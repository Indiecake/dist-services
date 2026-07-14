import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createOrderService } from '../../src/server.ts';

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

function configureOrderServiceEnv(databaseUrl: string): void {
  process.env.SERVICE_NAME = 'order-service';
  process.env.PORT = '3001';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
}

const validOrderRequest = {
  customerId: 'cust-123',
  currency: 'USD',
  items: [
    {
      productId: 'sku-1',
      quantity: 2,
      unitPriceCents: 1299
    }
  ]
};

test('POST /orders creates a pending order when Postgres is available', async (t) => {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://platform:platform@localhost:5432/platform';

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping order-service integration test.');
    return;
  }

  configureOrderServiceEnv(databaseUrl);
  const runtime = await createOrderService();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/orders',
      payload: validOrderRequest
    });

    assert.equal(response.statusCode, 201);

    const body = response.json();
    assert.equal(body.customerId, 'cust-123');
    assert.equal(body.status, 'PENDING');
    assert.equal(body.currency, 'USD');
    assert.equal(body.totalAmountCents, 2598);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].productId, 'sku-1');
    assert.equal(typeof body.orderId, 'string');
    assert.equal(typeof body.createdAt, 'string');
    assert.equal(typeof body.updatedAt, 'string');
  } finally {
    await runtime.close();
  }
});

test('POST /orders returns validation errors', async (t) => {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://platform:platform@localhost:5432/platform';

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping order-service integration test.');
    return;
  }

  configureOrderServiceEnv(databaseUrl);
  const runtime = await createOrderService();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/orders',
      payload: {
        ...validOrderRequest,
        customerId: ''
      }
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'customerId is required' });
  } finally {
    await runtime.close();
  }
});

test('GET /ready reports readiness when Postgres is available', async (t) => {
  const databaseUrl =
    process.env.DATABASE_URL ?? 'postgres://platform:platform@localhost:5432/platform';

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping order-service integration test.');
    return;
  }

  configureOrderServiceEnv(databaseUrl);
  const runtime = await createOrderService();

  try {
    const response = await runtime.app.inject({
      method: 'GET',
      url: '/ready'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      status: 'ready',
      service: 'order-service'
    });
  } finally {
    await runtime.close();
  }
});
