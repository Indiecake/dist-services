# order-service

Reference skeleton for the order domain service. Implements the DIST-3 building blueprint with Fastify, Drizzle ORM, shared config/telemetry, and the standard Jest + `node:test` split.

## Status

Reference skeleton only:

- `GET /health` liveness endpoint
- Drizzle schema and migrate-on-startup
- Business routes (`POST /orders`, `GET /orders/:orderId`, `GET /ready`) are planned for DIST-15

## Local configuration

Copy `.env.example` to `.env` or export the variables before starting the service.

| Variable | Default (local) |
| -------- | --------------- |
| `SERVICE_NAME` | `order-service` |
| `PORT` | `3001` |
| `DATABASE_URL` | `postgres://platform:platform@localhost:5432/platform` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` |
| `LOG_LEVEL` | `info` |

## Commands

From the repository root:

```bash
pnpm install
make up
pnpm --filter @services-sandbox/order-service start
```

From this directory:

```bash
pnpm start
pnpm test:unit
pnpm test:integration
pnpm test
pnpm exec drizzle-kit generate
```

## Endpoints

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Liveness check |

## Related docs

- [Service Building Guide](../../docs/service-building-guide.md)
- [API Contracts](../../docs/api-contracts.md)
- [ADR-0004 Service Runtime Stack](../../docs/adr/0004-service-runtime-stack.md)
- [ADR-0005 Internal Service Layering](../../docs/adr/0005-service-internal-layering.md)
