import type {
  CreateOrderRequest,
  OrderServiceOrderResponse
} from '@services-sandbox/contracts/http/create-order';
import { isOrderServiceOrderResponse } from '@services-sandbox/contracts/http/create-order';

import {
  createHttpClient,
  type HttpRequestContext,
  type HttpResponse
} from './http-client.ts';

interface OrderServiceClient {
  getOrder(
    orderId: string,
    context: HttpRequestContext
  ): Promise<HttpResponse<OrderServiceOrderResponse>>;

  createOrder(
    body: CreateOrderRequest,
    context: HttpRequestContext
  ): Promise<HttpResponse<OrderServiceOrderResponse>>;
}

export function createOrderServiceClient(
  httpClient: ReturnType<typeof createHttpClient>
): OrderServiceClient {
  return {
    getOrder(orderId: string, context: HttpRequestContext) {
      return httpClient<OrderServiceOrderResponse>(
        `/orders/${orderId}`,
        { method: 'GET' },
        context
      );
    },

    createOrder(body: CreateOrderRequest, context: HttpRequestContext) {
      return httpClient<OrderServiceOrderResponse>(
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

export { isOrderServiceOrderResponse };
