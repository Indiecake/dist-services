import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createCommandEnvelope } from '@services-sandbox/contracts';
import { DEADLETTER_TOPICS, EVENT_TOPICS } from '@services-sandbox/kafka';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { handleInventoryCommand } from '../../src/messaging/command-handler.ts';
import { createInventoryService } from '../../src/server.ts';

async function isPostgresAvailable(databaseUrl: string): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

function configureInventoryServiceEnv(databaseUrl: string): void {
  process.env.SERVICE_NAME = 'inventory-service';
  process.env.PORT = '3003';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
}

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

test('reserve command persists reservation, stock, inbox, and outbox together', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const productId = `sku-${randomUUID()}`;
    await runtime.repository.seedCatalog([{ productId, onHand: 5 }]);

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 2 }]
      }
    });

    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );

    assert.equal(status, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(20);
    const result = unpublished.find((row) => row.envelope.causationId === envelope.messageId);

    assert.ok(result);
    assert.equal(result.topic, EVENT_TOPICS.inventory);
    assert.equal(result.envelope.type, MESSAGE_TYPES.INVENTORY_RESERVED);
    assert.equal(result.envelope.correlationId, envelope.correlationId);
    assert.equal(result.envelope.traceparent, envelope.traceparent);

    const stockRow = await runtime.repository.getStock(productId);
    assert.equal(stockRow?.reservedQty, 2);
  } finally {
    await runtime.close();
  }
});

test('insufficient stock publishes inventory.reservation.failed without reserving units', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const available = `sku-${randomUUID()}`;
    const scarce = `sku-${randomUUID()}`;
    await runtime.repository.seedCatalog([
      { productId: available, onHand: 10 },
      { productId: scarce, onHand: 1 }
    ]);

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [
          { productId: available, quantity: 1 },
          { productId: scarce, quantity: 4 }
        ]
      }
    });

    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );

    assert.equal(status, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(20);
    const result = unpublished.find((row) => row.envelope.causationId === envelope.messageId);
    assert.equal(result?.envelope.type, MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);

    assert.equal((await runtime.repository.getStock(available))?.reservedQty, 0);
    assert.equal((await runtime.repository.getStock(scarce))?.reservedQty, 0);
  } finally {
    await runtime.close();
  }
});

test('unknown SKU publishes inventory.reservation.failed', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId: `missing-${randomUUID()}`, quantity: 1 }]
      }
    });

    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );

    assert.equal(status, 'processed');
    const unpublished = await runtime.repository.listUnpublishedOutbox(20);
    const result = unpublished.find((row) => row.envelope.causationId === envelope.messageId);
    assert.equal(result?.envelope.type, MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
  } finally {
    await runtime.close();
  }
});

test('redelivery of the same messageId does not create another inventory event', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const productId = `sku-${randomUUID()}`;
    await runtime.repository.seedCatalog([{ productId, onHand: 5 }]);

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 1 }]
      }
    });

    const first = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );
    const before = await runtime.repository.listUnpublishedOutbox(100);

    const second = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );
    const after = await runtime.repository.listUnpublishedOutbox(100);

    assert.equal(first, 'processed');
    assert.equal(second, 'duplicate');
    assert.equal(after.length, before.length);
    assert.equal((await runtime.repository.getStock(productId))?.reservedQty, 1);
  } finally {
    await runtime.close();
  }
});

test('release command restores reserved quantity and publishes inventory.released', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const productId = `sku-${randomUUID()}`;
    const orderId = `order-${randomUUID()}`;
    const reservationId = `res-${randomUUID()}`;
    await runtime.repository.seedCatalog([{ productId, onHand: 5 }]);

    const reserve = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId,
        reservationId,
        items: [{ productId, quantity: 3 }]
      }
    });

    await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: reserve }
    );

    const release = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RELEASE_REQUESTED,
      source: 'test',
      correlationId: reserve.correlationId,
      payload: { orderId, reservationId }
    });

    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: release }
    );

    assert.equal(status, 'processed');
    const unpublished = await runtime.repository.listUnpublishedOutbox(50);
    const result = unpublished.find((row) => row.envelope.causationId === release.messageId);
    assert.equal(result?.envelope.type, MESSAGE_TYPES.INVENTORY_RELEASED);
    assert.equal((await runtime.repository.getStock(productId))?.reservedQty, 0);
  } finally {
    await runtime.close();
  }
});

test('two concurrent reserves of the last unit yield one reserved and one failed', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const productId = `sku-${randomUUID()}`;
    await runtime.repository.seedCatalog([{ productId, onHand: 1 }]);

    const first = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 1 }]
      }
    });
    const second = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 1 }]
      }
    });

    const [firstStatus, secondStatus] = await Promise.all([
      handleInventoryCommand(
        { repository: runtime.repository, logger: silentLogger, retryDelaysMs: [0, 0] },
        { rawValue: first }
      ),
      handleInventoryCommand(
        { repository: runtime.repository, logger: silentLogger, retryDelaysMs: [0, 0] },
        { rawValue: second }
      )
    ]);

    assert.equal(firstStatus, 'processed');
    assert.equal(secondStatus, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(50);
    const types = [first, second].map((envelope) => {
      const row = unpublished.find((item) => item.envelope.causationId === envelope.messageId);
      return row?.envelope.type;
    });

    assert.equal(
      types.filter((type) => type === MESSAGE_TYPES.INVENTORY_RESERVED).length,
      1
    );
    assert.equal(
      types.filter((type) => type === MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED).length,
      1
    );
    assert.equal((await runtime.repository.getStock(productId))?.reservedQty, 1);
  } finally {
    await runtime.close();
  }
});

test('invalid envelope is written to dead_letter_events and the DLQ outbox topic', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: { bogus: true } }
    );

    assert.equal(status, 'dead_lettered');

    const unpublished = await runtime.repository.listUnpublishedOutbox(50);
    const deadLetter = unpublished.find((row) => row.topic === DEADLETTER_TOPICS.inventory);

    assert.ok(deadLetter);
    assert.equal(deadLetter.envelope.type, MESSAGE_TYPES.INVENTORY_DEADLETTERED);
  } finally {
    await runtime.close();
  }
});
