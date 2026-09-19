import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiGateway } from '../../src/server.ts';

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

function configureGatewayEnv(baseUrl: string): void {
  process.env.SERVICE_NAME = 'api-gateway';
  process.env.PORT = '3010';
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
  process.env.ORDER_SERVICE_BASE_URL = baseUrl;
  process.env.ORDER_SERVICE_TIMEOUT_MS = '1000';
  process.env.INVENTORY_SERVICE_BASE_URL = 'http://127.0.0.1:3003';
  process.env.INVENTORY_SERVICE_TIMEOUT_MS = '1000';
}

async function startMockOrderService(
  handler: (req: http.IncomingMessage, body: string) => { statusCode: number; body: unknown }
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString('utf8');
    const result = handler(req, body);

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve mock order-service port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

test('POST /orders projects downstream success to the public gateway shape', async () => {
  const mock = await startMockOrderService((req, body) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/orders');
    assert.equal(req.headers['x-request-id'], 'req-test-1');
    assert.equal(req.headers['x-correlation-id'], 'corr-test-1');
    assert.deepEqual(JSON.parse(body), validOrderRequest);

    return {
      statusCode: 201,
      body: {
        orderId: '550e8400-e29b-41d4-a716-446655440000',
        customerId: 'cust-123',
        status: 'PENDING',
        currency: 'USD',
        totalAmountCents: 2598,
        items: [
          {
            id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            productId: 'sku-1',
            quantity: 2,
            unitPriceCents: 1299
          }
        ],
        createdAt: '2026-06-23T12:00:00.000Z',
        updatedAt: '2026-06-23T12:00:00.000Z'
      }
    };
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/orders',
      headers: {
        'x-request-id': 'req-test-1',
        'x-correlation-id': 'corr-test-1'
      },
      payload: validOrderRequest
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), {
      orderId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'PENDING',
      totalAmountCents: 2598,
      currency: 'USD'
    });
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('POST /orders passes through downstream validation errors', async () => {
  const mock = await startMockOrderService((_req, _body) => ({
    statusCode: 400,
    body: { error: 'customerId is required' }
  }));

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/orders',
      payload: validOrderRequest
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'customerId is required' });
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('POST /orders validates input before calling downstream', async () => {
  const mock = await startMockOrderService(() => {
    throw new Error('downstream should not be called');
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

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
    await mock.close();
  }
});

test('POST /orders returns 502 when downstream is unreachable', async () => {
  configureGatewayEnv('http://127.0.0.1:1');
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/orders',
      payload: validOrderRequest
    });

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { error: 'order-service unavailable' });
  } finally {
    await runtime.close();
  }
});
