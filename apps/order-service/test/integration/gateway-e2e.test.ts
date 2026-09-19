import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createApiGateway } from '../../../api-gateway/src/server.ts';
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

test('gateway forwards order creation to order-service end-to-end', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping gateway e2e integration test.');
    return;
  }

  process.env.SERVICE_NAME = 'order-service';
  process.env.PORT = '3001';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';

  const orderRuntime = await createOrderService();

  await orderRuntime.app.listen({ host: '127.0.0.1', port: 0 });
  const orderAddress = orderRuntime.app.server.address();

  if (!orderAddress || typeof orderAddress === 'string') {
    await orderRuntime.close();
    throw new Error('Failed to resolve order-service listen address');
  }

  process.env.SERVICE_NAME = 'api-gateway';
  process.env.PORT = '3010';
  process.env.ORDER_SERVICE_BASE_URL = `http://127.0.0.1:${orderAddress.port}`;
  process.env.ORDER_SERVICE_TIMEOUT_MS = '5000';
  process.env.INVENTORY_SERVICE_BASE_URL = 'http://127.0.0.1:3003';
  process.env.INVENTORY_SERVICE_TIMEOUT_MS = '5000';

  const gatewayRuntime = await createApiGateway();

  try {
    const response = await gatewayRuntime.app.inject({
      method: 'POST',
      url: '/orders',
      headers: {
        'x-request-id': 'req-e2e-1',
        'x-correlation-id': 'corr-e2e-1'
      },
      payload: validOrderRequest
    });

    assert.equal(response.statusCode, 201);

    const body = response.json();
    assert.equal(body.status, 'PENDING');
    assert.equal(body.totalAmountCents, 2598);
    assert.equal(body.currency, 'USD');
    assert.equal(typeof body.orderId, 'string');
  } finally {
    await gatewayRuntime.close();
    await orderRuntime.close();
  }
});
