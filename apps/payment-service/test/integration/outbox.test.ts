import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createCommandEnvelope } from '@services-sandbox/contracts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import type { OutboxRecord } from '../../src/db/payments-repository.ts';
import { createSimulatedPaymentProcessor } from '../../src/domain/processor.ts';
import { handlePaymentCommand } from '../../src/messaging/command-handler.ts';
import { createPaymentService } from '../../src/server.ts';

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

function configurePaymentServiceEnv(databaseUrl: string): void {
  process.env.SERVICE_NAME = 'payment-service';
  process.env.PORT = '3002';
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

async function insertUnpublishedCharge(
  repository: Parameters<typeof handlePaymentCommand>[0]['repository']
): Promise<OutboxRecord> {
  const envelope = createCommandEnvelope({
    type: MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED,
    source: 'test',
    correlationId: `corr-${randomUUID()}`,
    payload: {
      orderId: `order-${randomUUID()}`,
      paymentId: `pay-${randomUUID()}`,
      amountCents: 1000,
      currency: 'USD'
    }
  });

  const status = await handlePaymentCommand(
    {
      repository,
      processor: createSimulatedPaymentProcessor(),
      logger: silentLogger
    },
    { rawValue: envelope }
  );
  assert.equal(status, 'processed');

  const unpublished = await repository.listUnpublishedOutbox(200);
  const record = unpublished.find((row) => row.envelope.causationId === envelope.messageId);
  assert.ok(record);
  return record;
}

test('concurrent outbox claims return disjoint row ids', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service outbox integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const created = await Promise.all([
      insertUnpublishedCharge(runtime.repository),
      insertUnpublishedCharge(runtime.repository),
      insertUnpublishedCharge(runtime.repository),
      insertUnpublishedCharge(runtime.repository)
    ]);
    const createdIds = new Set(created.map((row) => row.id));

    const [first, second] = await Promise.all([
      runtime.repository.claimUnpublishedOutbox({ instanceId: `a-${randomUUID()}`, limit: 100 }),
      runtime.repository.claimUnpublishedOutbox({ instanceId: `b-${randomUUID()}`, limit: 100 })
    ]);

    const firstIds = new Set(first.map((row) => row.id));
    const secondIds = new Set(second.map((row) => row.id));
    const overlap = [...firstIds].filter((id) => secondIds.has(id));

    assert.deepEqual(overlap, []);
    assert.ok(
      [...createdIds].some((id) => firstIds.has(id) || secondIds.has(id)),
      'at least one created outbox row should be claimed'
    );
  } finally {
    await runtime.close();
  }
});

test('an expired outbox lease can be reclaimed by another instance', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service outbox integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const record = await insertUnpublishedCharge(runtime.repository);
    const firstOwner = `owner-${randomUUID()}`;
    const secondOwner = `owner-${randomUUID()}`;

    const firstClaim = await runtime.repository.claimUnpublishedOutbox({
      instanceId: firstOwner,
      leaseMs: 20,
      limit: 200
    });
    assert.ok(firstClaim.some((row) => row.id === record.id));

    await new Promise((resolve) => setTimeout(resolve, 50));

    const secondClaim = await runtime.repository.claimUnpublishedOutbox({
      instanceId: secondOwner,
      leaseMs: 30_000,
      limit: 200
    });
    assert.ok(secondClaim.some((row) => row.id === record.id));
  } finally {
    await runtime.close();
  }
});

test('markOutboxPublished from a non-owner is a no-op', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service outbox integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const record = await insertUnpublishedCharge(runtime.repository);
    const owner = `owner-${randomUUID()}`;

    const claimed = await runtime.repository.claimUnpublishedOutbox({
      instanceId: owner,
      leaseMs: 30_000,
      limit: 200
    });
    assert.ok(claimed.some((row) => row.id === record.id));

    await runtime.repository.markOutboxPublished({
      id: record.id,
      instanceId: `other-${randomUUID()}`
    });

    const stillUnpublished = await runtime.repository.listUnpublishedOutbox(200);
    assert.ok(stillUnpublished.some((row) => row.id === record.id));

    await runtime.repository.markOutboxPublished({
      id: record.id,
      instanceId: owner
    });

    const afterOwnerMark = await runtime.repository.listUnpublishedOutbox(200);
    assert.ok(afterOwnerMark.every((row) => row.id !== record.id));
  } finally {
    await runtime.close();
  }
});
