import { loadGatewayConfig } from '../../src/config.ts';
import { createHttpClient } from '../../src/clients/http-client.ts';
import {
  createOrderServiceClient,
  isOrderServiceOrderResponse
} from '../../src/clients/order-service-client.ts';
import { createInventoryServiceClient } from '../../src/clients/inventory-service-client.ts';
import { toGatewayCreateOrderResponse } from '@services-sandbox/contracts/http/create-order';
import {
  isProductListResponse,
  isProductResponse
} from '@services-sandbox/contracts/http/catalog';

function createTestOrderServiceClient(fetchImpl: typeof fetch) {
  const httpClient = createHttpClient({
    baseUrl: 'http://localhost:3001',
    timeoutMs: 1000,
    serviceName: 'order-service',
    fetchImpl
  });

  return createOrderServiceClient(httpClient);
}

function headerValue(headers: HeadersInit | undefined, name: string): string | null {
  return new Headers(headers).get(name);
}

describe('loadGatewayConfig', () => {
  it('loads gateway configuration with defaults', () => {
    const config = loadGatewayConfig({
      SERVICE_NAME: 'api-gateway',
      PORT: '3010',
      KAFKA_BOOTSTRAP_SERVERS: 'localhost:9092',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
      LOG_LEVEL: 'info',
      ORDER_SERVICE_BASE_URL: 'http://localhost:3001/',
      INVENTORY_SERVICE_BASE_URL: 'http://localhost:3003/'
    });

    expect(config.orderServiceBaseUrl).toBe('http://localhost:3001');
    expect(config.orderServiceTimeoutMs).toBe(5000);
    expect(config.inventoryServiceBaseUrl).toBe('http://localhost:3003');
    expect(config.inventoryServiceTimeoutMs).toBe(5000);
  });
});

describe('createOrderServiceClient', () => {
  const validRequest = {
    customerId: 'cust-123',
    currency: 'USD' as const,
    items: [{ productId: 'sku-1', quantity: 2, unitPriceCents: 1299 }]
  };

  const validOrderResponse = {
    orderId: 'order-1',
    customerId: 'cust-123',
    status: 'PENDING',
    currency: 'USD',
    totalAmountCents: 2598,
    items: [
      {
        id: 'item-1',
        productId: 'sku-1',
        quantity: 2,
        unitPriceCents: 1299
      }
    ],
    createdAt: '2026-06-23T12:00:00.000Z',
    updatedAt: '2026-06-23T12:00:00.000Z'
  };

  it('forwards request body and correlation headers', async () => {
    const calls: {
      url: string;
      init: RequestInit;
    }[] = [];

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(JSON.stringify(validOrderResponse), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const client = createTestOrderServiceClient(fetchImpl);

    const result = await client.createOrder(validRequest, {
      requestId: 'req-1',
      correlationId: 'corr-1',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:3001/orders');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify(validRequest));

    expect(headerValue(calls[0].init.headers, 'x-request-id')).toBe('req-1');
    expect(headerValue(calls[0].init.headers, 'x-correlation-id')).toBe('corr-1');
    expect(headerValue(calls[0].init.headers, 'traceparent')).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000001-01'
    );

    expect(result.statusCode).toBe(201);
    expect(isOrderServiceOrderResponse(result.body)).toBe(true);

    if (isOrderServiceOrderResponse(result.body)) {
      expect(toGatewayCreateOrderResponse(result.body)).toEqual({
        orderId: 'order-1',
        status: 'PENDING',
        totalAmountCents: 2598,
        currency: 'USD'
      });
    }
  });

  it('returns 502 when downstream is unavailable', async () => {
    const client = createTestOrderServiceClient(async () => {
      throw new Error('network down');
    });

    const result = await client.createOrder(validRequest, {
      requestId: 'req-1',
      correlationId: 'corr-1',
      traceId: null
    });

    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: 'order-service unavailable' });
  });

  it('getOrder forwards correlation headers on GET', async () => {
    const calls: {
      url: string;
      init: RequestInit;
    }[] = [];

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(
        JSON.stringify({
          ...validOrderResponse,
          statusHistory: [
            {
              id: 'hist-1',
              fromStatus: null,
              toStatus: 'PENDING',
              changedAt: '2026-06-23T12:00:00.000Z',
              reason: null
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = createTestOrderServiceClient(fetchImpl);

    const result = await client.getOrder('42', {
      requestId: 'req-2',
      correlationId: 'corr-2',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:3001/orders/42');
    expect(calls[0].init.method).toBe('GET');
    expect(calls[0].init.signal).toBeDefined();

    expect(headerValue(calls[0].init.headers, 'x-request-id')).toBe('req-2');
    expect(headerValue(calls[0].init.headers, 'x-correlation-id')).toBe('corr-2');
    expect(headerValue(calls[0].init.headers, 'traceparent')).toBe(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000001-01'
    );
    expect(headerValue(calls[0].init.headers, 'Content-Type')).toBeNull();

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(isOrderServiceOrderResponse(result.body)).toBe(true);
  });

  it('getOrder returns 502 when downstream is unavailable', async () => {
    const client = createTestOrderServiceClient(async () => {
      throw new Error('network down');
    });

    const result = await client.getOrder('42', {
      requestId: 'req-2',
      correlationId: 'corr-2',
      traceId: null
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: 'order-service unavailable' });
  });
});

describe('createInventoryServiceClient', () => {
  const validCategory = {
    id: '550e8400-e29b-41d4-a716-446655440000',
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

  function createTestInventoryServiceClient(fetchImpl: typeof fetch) {
    const httpClient = createHttpClient({
      baseUrl: 'http://localhost:3003',
      timeoutMs: 1000,
      serviceName: 'inventory-service',
      fetchImpl
    });

    return createInventoryServiceClient(httpClient);
  }

  it('forwards create product body and correlation headers', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createTestInventoryServiceClient(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(validProduct), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const body = {
      id: 'sku-1',
      name: 'Widget',
      priceCents: 1299,
      description: 'Standard widget',
      categoryIds: [validCategory.id],
      onHand: 100
    };

    const result = await client.createProduct(body, {
      requestId: 'req-cat-1',
      correlationId: 'corr-cat-1',
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736'
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:3003/products');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify(body));
    expect(headerValue(calls[0].init.headers, 'x-request-id')).toBe('req-cat-1');
    expect(headerValue(calls[0].init.headers, 'x-correlation-id')).toBe('corr-cat-1');
    expect(result.statusCode).toBe(201);
    expect(isProductResponse(result.body)).toBe(true);
  });

  it('lists products with a category filter and returns 502 when unavailable', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createTestInventoryServiceClient(async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify([validProduct]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    });

    const listed = await client.listProducts(
      { categoryId: validCategory.id },
      { requestId: 'req-cat-2', correlationId: 'corr-cat-2', traceId: null }
    );

    expect(calls[0].url).toBe(
      `http://localhost:3003/products?categoryId=${validCategory.id}`
    );
    expect(listed.statusCode).toBe(200);
    expect(isProductListResponse(listed.body)).toBe(true);

    const unavailable = createTestInventoryServiceClient(async () => {
      throw new Error('network down');
    });
    const result = await unavailable.deleteCategory(validCategory.id, {
      requestId: 'req-cat-3',
      correlationId: 'corr-cat-3',
      traceId: null
    });
    expect(result.statusCode).toBe(502);
    expect(result.body).toEqual({ error: 'inventory-service unavailable' });
  });
});
