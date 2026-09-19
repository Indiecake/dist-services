# inventory-service

Inventory domain service for DIST-17. Consumes reserve and release commands from Kafka, records stock reservations, and publishes result events through a transactional outbox. HTTP covers liveness, readiness, and catalog CRUD for products and categories.

## Status

Implemented for DIST-17 plus catalog HTTP:

- `GET /health` liveness endpoint
- `GET /ready` readiness endpoint (Postgres connectivity)
- Product and category Read/Create/Update/soft-Delete HTTP APIs
- Kafka consumer on `dist.command.inventory` for `inventory.reserve.requested` and `inventory.release.requested`
- Result events on `dist.event.inventory` (`inventory.reserved`, `inventory.reservation.failed`, `inventory.released`, `inventory.release.failed`)
- Inbox/outbox/dead-letter tables composed from `@services-sandbox/kafka/schema`
- Kafka consumer, lease outbox poller, bounded backoff, and dual DLQ from `@services-sandbox/kafka/runtime`
- Fail-fast conditional stock updates (`lock_timeout = 0`) so competing instances do not wait on a stock-row lock queue

Saga wiring is out of scope. Tests (and later the saga orchestrator) publish commands directly.

## Local configuration

Copy `.env.example` to `.env` or export the variables before starting the service.

| Variable | Default (local) |
| -------- | --------------- |
| `SERVICE_NAME` | `inventory-service` |
| `PORT` | `3003` |
| `DATABASE_URL` | `postgres://platform:platform@localhost:5432/platform` |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` |
| `LOG_LEVEL` | `info` |

## Commands

From the repository root:

```bash
pnpm install
make up
pnpm --filter @services-sandbox/inventory-service db:seed
pnpm --filter @services-sandbox/inventory-service start
```

`db:seed` applies pending migrations, then inserts local catalog rows for `sku-1` and `sku-2` (with names, prices, and a `General` category). Re-running it is safe: existing stock quantities and reservations are left unchanged. Product catalog fields and category links are upserted.

From this directory:

```bash
pnpm db:seed
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
| GET | `/categories` | List active categories |
| POST | `/categories` | Create a category |
| GET | `/categories/:categoryId` | Fetch an active category |
| PATCH | `/categories/:categoryId` | Partial category update |
| DELETE | `/categories/:categoryId` | Soft-delete a category |
| GET | `/products` | List active products; optional `?categoryId=` |
| POST | `/products` | Create a product |
| GET | `/products/:productId` | Fetch an active product |
| PATCH | `/products/:productId` | Partial product update |
| DELETE | `/products/:productId` | Soft-delete a product |

There is no HTTP API for reserving or releasing inventory.

## Kafka topics

| Direction | Topic | Message types |
| --------- | ----- | ------------- |
| Consume | `dist.command.inventory` | `inventory.reserve.requested`, `inventory.release.requested` |
| Produce | `dist.event.inventory` | `inventory.reserved`, `inventory.reservation.failed`, `inventory.released`, `inventory.release.failed` |
| Produce | `dist.deadletter.inventory` | `inventory.deadlettered` |

## Related docs

- [Service Building Guide](../../docs/service-building-guide.md)
- [API Contracts](../../docs/api-contracts.md)
- [Kafka package](../../packages/kafka/README.md)
- [ADR-0002 Outbox and Inbox](../../docs/adr/0002-use-outbox-pattern.md)
- [ADR-0004 Service Runtime Stack](../../docs/adr/0004-service-runtime-stack.md)
- [ADR-0005 Internal Service Layering](../../docs/adr/0005-service-internal-layering.md)
