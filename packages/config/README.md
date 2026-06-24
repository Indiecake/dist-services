# config

Shared environment parsing and runtime configuration helpers for services in this monorepo.

## Supported environment variables

- `SERVICE_NAME`
- `PORT`
- `DATABASE_URL`
- `KAFKA_BOOTSTRAP_SERVERS`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOG_LEVEL`

## Example usage

```ts
import { loadServiceConfig } from '@services-sandbox/config';

const config = loadServiceConfig();

console.log(config.serviceName);
console.log(config.kafkaBootstrapServers);
```

## Validation behavior

- Missing required values fail fast at startup.
- `PORT` must be an integer between `1` and `65535`.
- `DATABASE_URL` and `OTEL_EXPORTER_OTLP_ENDPOINT` must be valid URLs.
- `KAFKA_BOOTSTRAP_SERVERS` must contain at least one comma-separated server.
- `LOG_LEVEL` must be one of `trace`, `debug`, `info`, `warn`, or `error`.
