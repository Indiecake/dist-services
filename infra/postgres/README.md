# PostgreSQL Notes

The local platform uses one PostgreSQL container for development with separate schemas for each stateful service.

## Local schema bootstrap

- Init SQL lives in `infra/postgres/init/`.
- The bootstrap script creates:
  - `orders_schema`
  - `payments_schema`
  - `inventory_schema`
  - `shipping_schema`
  - `saga_schema`
  - `reporting_schema`

## Migration ownership

- Each service keeps its own migrations under `apps/<service>/database/migrations/`.
- Future tooling should execute migrations per service rather than from a shared global folder.
