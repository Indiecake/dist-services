import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';

import { createApiGateway } from '../../src/server.ts';

const categoryId = '550e8400-e29b-41d4-a716-446655440000';

const validCategory = {
  id: categoryId,
  name: 'General',
  description: null,
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:00.000Z'
};

const validProduct = {
  id: 'sku-1',
  name: 'Widget',
  priceCents: 1299,
  description: 'Standard widget',
  onHand: 100,
  reservedQty: 0,
  categories: [validCategory],
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:00.000Z'
};

function configureGatewayEnv(inventoryBaseUrl: string): void {
  process.env.SERVICE_NAME = 'api-gateway';
  process.env.PORT = '3010';
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
  process.env.ORDER_SERVICE_BASE_URL = 'http://127.0.0.1:3001';
  process.env.ORDER_SERVICE_TIMEOUT_MS = '1000';
  process.env.INVENTORY_SERVICE_BASE_URL = inventoryBaseUrl;
  process.env.INVENTORY_SERVICE_TIMEOUT_MS = '1000';
}

async function startMockInventoryService(
  handler: (req: http.IncomingMessage, body: string) => { statusCode: number; body?: unknown }
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];

    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks).toString('utf8');
    const result = handler(req, body);

    if (result.statusCode === 204) {
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.body ?? null));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve mock inventory-service port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  };
}

test('POST /products validates then forwards to inventory-service', async () => {
  const payload = {
    id: 'sku-1',
    name: 'Widget',
    priceCents: 1299,
    description: 'Standard widget',
    onHand: 100
  };

  const mock = await startMockInventoryService((req, body) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/products');
    assert.equal(req.headers['x-request-id'], 'req-cat-1');
    assert.equal(req.headers['x-correlation-id'], 'corr-cat-1');
    assert.deepEqual(JSON.parse(body), payload);

    return { statusCode: 201, body: validProduct };
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/products',
      headers: {
        'x-request-id': 'req-cat-1',
        'x-correlation-id': 'corr-cat-1'
      },
      payload
    });

    assert.equal(response.statusCode, 201);
    assert.deepEqual(response.json(), validProduct);
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('POST /products validates input before calling downstream', async () => {
  const mock = await startMockInventoryService(() => {
    throw new Error('downstream should not be called');
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: 'Widget', priceCents: 0 }
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: 'priceCents must be greater than 0' });
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('GET /products passes through downstream catalog results', async () => {
  const mock = await startMockInventoryService((req) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.url, `/products?categoryId=${categoryId}`);
    return { statusCode: 200, body: [validProduct] };
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'GET',
      url: `/products?categoryId=${categoryId}`
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [validProduct]);
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('DELETE /categories forwards 204 from inventory-service', async () => {
  const mock = await startMockInventoryService((req) => {
    assert.equal(req.method, 'DELETE');
    assert.equal(req.url, `/categories/${categoryId}`);
    return { statusCode: 204 };
  });

  configureGatewayEnv(mock.baseUrl);
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'DELETE',
      url: `/categories/${categoryId}`
    });

    assert.equal(response.statusCode, 204);
  } finally {
    await runtime.close();
    await mock.close();
  }
});

test('POST /categories returns 502 when downstream is unreachable', async () => {
  configureGatewayEnv('http://127.0.0.1:1');
  const runtime = await createApiGateway();

  try {
    const response = await runtime.app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: 'General' }
    });

    assert.equal(response.statusCode, 502);
    assert.deepEqual(response.json(), { error: 'inventory-service unavailable' });
  } finally {
    await runtime.close();
  }
});
