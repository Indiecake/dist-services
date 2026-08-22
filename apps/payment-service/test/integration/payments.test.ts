import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createCommandEnvelope } from '@services-sandbox/contracts';
import { DEADLETTER_TOPICS, EVENT_TOPICS } from '@services-sandbox/kafka';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

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

test('charge command persists payment, attempt, inbox, and outbox together', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        paymentId: `pay-${randomUUID()}`,
        amountCents: 2599,
        currency: 'USD'
      }
    });

    const status = await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: envelope }
    );

    assert.equal(status, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(20);
    const result = unpublished.find((row) => row.envelope.causationId === envelope.messageId);

    assert.ok(result);
    assert.equal(result.topic, EVENT_TOPICS.payments);
    assert.equal(result.envelope.type, MESSAGE_TYPES.PAYMENT_CHARGED);
    assert.equal(result.envelope.correlationId, envelope.correlationId);
    assert.equal(result.envelope.traceparent, envelope.traceparent);
  } finally {
    await runtime.close();
  }
});

test('redelivery of the same messageId does not create another payment event', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
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

    const first = await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: envelope }
    );
    const before = await runtime.repository.listUnpublishedOutbox(100);

    const second = await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: envelope }
    );
    const after = await runtime.repository.listUnpublishedOutbox(100);

    assert.equal(first, 'processed');
    assert.equal(second, 'duplicate');
    assert.equal(after.length, before.length);
  } finally {
    await runtime.close();
  }
});

test('refund command publishes payment.refunded after a successful charge', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const orderId = `order-${randomUUID()}`;
    const paymentId = `pay-${randomUUID()}`;

    const charge = createCommandEnvelope({
      type: MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: { orderId, paymentId, amountCents: 500, currency: 'USD' }
    });

    await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: charge }
    );

    const refund = createCommandEnvelope({
      type: MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED,
      source: 'test',
      correlationId: charge.correlationId,
      payload: { orderId, paymentId }
    });

    const status = await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: refund }
    );

    assert.equal(status, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(50);
    const result = unpublished.find((row) => row.envelope.causationId === refund.messageId);

    assert.ok(result);
    assert.equal(result.envelope.type, MESSAGE_TYPES.PAYMENT_REFUNDED);
  } finally {
    await runtime.close();
  }
});

test('invalid envelope is written to dead_letter_events and the DLQ outbox topic', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping payment-service integration test.');
    return;
  }

  configurePaymentServiceEnv(databaseUrl);
  const runtime = await createPaymentService({ enableMessaging: false });

  try {
    const status = await handlePaymentCommand(
      {
        repository: runtime.repository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger
      },
      { rawValue: { bogus: true } }
    );

    assert.equal(status, 'dead_lettered');

    const unpublished = await runtime.repository.listUnpublishedOutbox(50);
    const deadLetter = unpublished.find((row) => row.topic === DEADLETTER_TOPICS.payments);

    assert.ok(deadLetter);
    assert.equal(deadLetter.envelope.type, MESSAGE_TYPES.PAYMENT_DEADLETTERED);
  } finally {
    await runtime.close();
  }
});
