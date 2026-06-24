# Local Database Layout

## Strategy

Local development uses a single PostgreSQL instance with one schema per stateful service. This keeps the platform simple to run while preserving service ownership boundaries.

## Schema ownership

| Service | Schema | Purpose |
|---|---|---|
| `order-service` | `orders_schema` | Order aggregates, outbox, inbox, and order read helpers |
| `payment-service` | `payments_schema` | Payment state, payment outbox, and settlement tracking |
| `inventory-service` | `inventory_schema` | Reservation state, stock movements, and inbox handling |
| `shipping-service` | `shipping_schema` | Shipment state and shipment workflow events |
| `saga-orchestrator` | `saga_schema` | Saga coordination state, checkpoints, and orchestration logs |
| `reporting-worker` | `reporting_schema` | Reporting projections and analytical read models |

## Naming conventions

- Schema names use lowercase snake case and end with `_schema`.
- Each service owns exactly one primary schema in local development.
- Tables, indexes, and sequences should be created only within the owning service schema.
- Cross-service joins are not allowed in service runtime code.
- Shared database utilities may exist in `packages/database`, but they must not bypass schema ownership.

## Migration layout

- Bootstrap SQL for local schema creation lives in `infra/postgres/init/001-create-service-schemas.sql`.
- Service-specific migrations live under `apps/<service>/database/migrations/`.
- Use sortable file names such as `001-create-orders-tables.sql` and `002-add-order-outbox.sql`.
- Keep seed or developer-only data separate from structural migrations.

## Notes

- The local PostgreSQL container runs the init SQL only when the database volume is created.
- If schema bootstrap files change after the first startup, reset local volumes before re-running the stack.
