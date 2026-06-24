# telemetry

Shared observability helpers for services in this monorepo.

## Current helpers

- `createRequestContext(input)` extracts or creates:
  - `correlationId`
  - `requestId`
  - `traceId`
- `createLogger({ serviceName })` emits structured JSON logs.
- `shouldLogHttpRequest({ method, path, statusCode })` suppresses routine health checks.

## Structured log shape

Each log entry is emitted as one JSON line with:

- `timestamp`
- `level`
- `serviceName`
- `message`
- `correlationId` when available
- `requestId` when available
- `traceId` when available

## Example usage

```ts
import {
  createLogger,
  createRequestContext,
  shouldLogHttpRequest
} from '@services-sandbox/telemetry';

const logger = createLogger({ serviceName: 'payment-service' });
const requestContext = createRequestContext(request.headers);

if (shouldLogHttpRequest({ method: request.method, path: request.path, statusCode: 200 })) {
  logger.info('Request completed.', {
    ...requestContext,
    method: request.method,
    path: request.path,
    statusCode: 200
  });
}
```
