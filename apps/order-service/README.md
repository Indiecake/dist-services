# order-service

Reference service for the order domain. Implements the DIST-3 building blueprint with Fastify, Drizzle ORM, shared config/telemetry, and the standard Jest + `node:test` split.

## Status

Implemented for DIST-15:

- `GET /health` liveness endpoint
- `GET /ready` readiness endpoint (Postgres connectivity)
- `POST /orders` create PENDING order with items and status history
- `GET /orders/:orderId` fetch order aggregate
- Drizzle schema and migrate-on-startup

Kafka/outbox publishing is planned for DIST-16+.

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
| GET | `/ready` | Readiness check |
| POST | `/orders` | Create PENDING order |
| GET | `/orders/:orderId` | Fetch order aggregate |

## Related docs

- [Service Building Guide](../../docs/service-building-guide.md)
- [API Contracts](../../docs/api-contracts.md)
- [ADR-0004 Service Runtime Stack](../../docs/adr/0004-service-runtime-stack.md)
- [ADR-0005 Internal Service Layering](../../docs/adr/0005-service-internal-layering.md)
