# Shared Configuration Package

## Package

`packages/config` provides a shared runtime configuration loader for services in this repository.

## Loaders

### `loadServiceConfig()`

For database-backed services.

**Required environment variables:**

- `SERVICE_NAME`
- `PORT`
- `DATABASE_URL`
- `KAFKA_BOOTSTRAP_SERVERS`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOG_LEVEL`

### `loadEdgeServiceConfig()`

For stateless edge HTTP services such as `api-gateway`.

**Required environment variables:**

- `SERVICE_NAME`
- `PORT`
- `KAFKA_BOOTSTRAP_SERVERS`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOG_LEVEL`

`DATABASE_URL` is not required.

Gateway-specific variables such as `ORDER_SERVICE_BASE_URL` are validated in `apps/api-gateway/src/config.ts`.

## Behavior

- Services should call the appropriate loader during startup.
- Missing or invalid values fail fast by throwing `ConfigValidationError`.
- Kafka bootstrap servers are parsed from a comma-separated string into an array.
- URL-shaped values are validated before the service continues booting.

## Example

```ts
import { loadEdgeServiceConfig, loadServiceConfig } from '@services-sandbox/config';

const serviceConfig = loadServiceConfig();
const gatewayConfig = loadEdgeServiceConfig();
```

## Testing note

- Tests for this package should validate configuration parsing and error handling behavior.
- Repository structure checks are intentionally out of scope for this package test suite.
