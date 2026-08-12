import { loadGatewayConfig } from '../../src/config.ts';
import { createHttpClient } from '../../src/clients/http-client.ts';
import {
  createOrderServiceClient,
  isOrderServiceCreateResponse
} from '../../src/clients/order-service-client.ts';
import { toGatewayCreateOrderResponse } from '@services-sandbox/contracts/http/create-order';

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
      ORDER_SERVICE_BASE_URL: 'http://localhost:3001/'
    });

    expect(config.orderServiceBaseUrl).toBe('http://localhost:3001');
    expect(config.orderServiceTimeoutMs).toBe(5000);
  });
});

describe('createOrderServiceClient', () => {
  const validRequest = {
    customerId: 'cust-123',
    currency: 'USD',
    items: [{ productId: 'sku-1', quantity: 2, unitPriceCents: 1299 }]
  };

  it('forwards request body and correlation headers', async () => {
    const calls: {
      url: string;
      init: RequestInit;
    }[] = [];

    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });

      return new Response(
        JSON.stringify({
          orderId: 'order-1',
          customerId: 'cust-123',
          status: 'PENDING',
          currency: 'USD',
          totalAmountCents: 2598,
          items: [],
          createdAt: '2026-06-23T12:00:00.000Z',
          updatedAt: '2026-06-23T12:00:00.000Z'
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
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
    expect(isOrderServiceCreateResponse(result.body)).toBe(true);

    if (isOrderServiceCreateResponse(result.body)) {
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
          orderId: 'order-1',
          status: 'PENDING',
          totalAmountCents: 2598,
          currency: 'USD'
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
