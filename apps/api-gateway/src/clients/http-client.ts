export interface HttpRequestContext {
  requestId: string;
  correlationId: string;
  traceId: string | null;
}

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs: number;
  serviceName: string;
  fetchImpl?: typeof fetch;
}

export interface HttpResponse<T = unknown> {
  ok: boolean;
  statusCode: number;
  body: T;
}

function buildTraceparent(traceId: string | null | undefined): string | undefined {
  if (!traceId) {
    return undefined;
  }

  return `00-${traceId}-0000000000000001-01`;
}

export function createHttpClient({
  baseUrl,
  timeoutMs,
  serviceName,
  fetchImpl = fetch
}: HttpClientOptions) {
  async function request<T>(
    path: string,
    init: RequestInit = {},
    context: HttpRequestContext
  ): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = new Headers(init.headers);
      headers.set('x-request-id', context.requestId);
      headers.set('x-correlation-id', context.correlationId);

      if (init.body !== undefined) {
        headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json');
      }

      // TODO: once OpenTelemetry is wired, replace with propagation.inject(...)
      const traceparent = buildTraceparent(context.traceId);
      if (traceparent) {
        headers.set('traceparent', traceparent);
      }

      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal
      });

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      return {
        ok: response.ok,
        statusCode: response.status,
        body: body as T
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return {
          ok: false,
          statusCode: 504,
          body: { error: `${serviceName} time out` } as T
        };
      }

      return {
        ok: false,
        statusCode: 502,
        body: { error: `${serviceName} unavailable` } as T
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return request;
}
