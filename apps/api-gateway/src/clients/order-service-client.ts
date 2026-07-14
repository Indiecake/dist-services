import type { CreateOrderRequest, OrderServiceCreateResponse } from '@services-sandbox/contracts/http/create-order';

export interface OrderServiceClientOptions {
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export interface OrderServiceClientResult {
  ok: boolean;
  statusCode: number;
  body: unknown;
}

export interface OrderRequestContext {
  requestId: string;
  correlationId: string;
  traceId: string | null;
}

function buildTraceparent(traceId: string | null): string | undefined {
  if (!traceId) {
    return undefined;
  }

  return `00-${traceId}-0000000000000001-01`;
}

export function createOrderServiceClient({
  baseUrl,
  timeoutMs,
  fetchImpl = fetch
}: OrderServiceClientOptions) {
  return {
    async createOrder(
      body: CreateOrderRequest,
      context: OrderRequestContext
    ): Promise<OrderServiceClientResult> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'x-request-id': context.requestId,
          'x-correlation-id': context.correlationId
        };

        const traceparent = buildTraceparent(context.traceId);

        if (traceparent) {
          headers.traceparent = traceparent;
        }

        const response = await fetchImpl(`${baseUrl}/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const responseBody = await response.json();

        return {
          ok: response.ok,
          statusCode: response.status,
          body: responseBody
        };
      } catch {
        return {
          ok: false,
          statusCode: 502,
          body: { error: 'order-service unavailable' }
        };
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export function isOrderServiceCreateResponse(body: unknown): body is OrderServiceCreateResponse {
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
