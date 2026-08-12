import type {
  CreateOrderRequest,
  OrderServiceCreateResponse
} from '@services-sandbox/contracts/http/create-order';

import { createHttpClient, type HttpResponse } from './http-client.ts';

export interface OrderRequestContext {
  requestId: string;
  correlationId: string;
  traceId: string | null;
}

interface OrderServiceClient {
  getOrder(
    orderId: string,
    context: OrderRequestContext
  ): Promise<HttpResponse<OrderServiceCreateResponse>>;

  createOrder(
    body: CreateOrderRequest,
    context: OrderRequestContext
  ): Promise<HttpResponse<OrderServiceCreateResponse>>;
}

export function createOrderServiceClient(
  httpClient: ReturnType<typeof createHttpClient>
): OrderServiceClient {
  return {
    getOrder(orderId: string, context: OrderRequestContext) {
      return httpClient<OrderServiceCreateResponse>(
        `/orders/${orderId}`,
        { method: 'GET' },
        context
      );
    },

    createOrder(body: CreateOrderRequest, context: OrderRequestContext) {
      return httpClient<OrderServiceCreateResponse>(
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify(body)
        },
        context
      );
    }
  };
}

export function isOrderServiceCreateResponse(
  body: unknown
): body is OrderServiceCreateResponse {
  if (body === null || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Record<string, unknown>;

  return (
    typeof candidate.orderId === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.totalAmountCents === 'number' &&
    typeof candidate.currency === 'string'
  );
}
