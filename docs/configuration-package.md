# Shared Configuration Package

## Package

`packages/config` provides a shared runtime configuration loader for services in this repository.

## Required environment variables

- `SERVICE_NAME`
- `PORT`
- `DATABASE_URL`
- `KAFKA_BOOTSTRAP_SERVERS`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOG_LEVEL`

## Behavior

- Services should call `loadServiceConfig()` during startup.
- Missing or invalid values fail fast by throwing `ConfigValidationError`.
- Kafka bootstrap servers are parsed from a comma-separated string into an array.
- URL-shaped values are validated before the service continues booting.

## Example

```ts
import { loadServiceConfig } from '@services-sandbox/config';

const config = loadServiceConfig();
```

## Testing note

- Tests for this package should validate configuration parsing and error handling behavior.
- Repository structure checks are intentionally out of scope for this package test suite.
