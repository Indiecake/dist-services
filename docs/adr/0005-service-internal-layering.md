# ADR-0005: Internal Service Layering

## Status

Accepted

## Context

DIST-3 services coordinate order workflow steps through HTTP and Kafka while each service owns its PostgreSQL schema. Without explicit layering rules, transport, persistence, and domain logic tend to mix, making services harder to test and evolve independently.

## Decision

Each deployable service under `apps/<service-name>/` follows this layout:

```text
apps/<service>/
  drizzle.config.ts
  database/migrations/
  src/
    index.ts           # process entrypoint
    server.ts          # bootstrap: config, telemetry, db, routes, shutdown
    routes/            # HTTP transport adapters only
    domain/            # validation and business rules
    db/
      schema.ts        # Drizzle table definitions
      client.ts        # pg pool + Drizzle client factory
      migrate.ts       # apply pending migrations on startup
    messaging/         # Kafka producers/consumers (DIST-16+)
  test/
    unit/              # Jest
    integration/       # node:test
```

### Layer rules

1. **Domain** (`domain/`) must not import Fastify, Drizzle, Kafka clients, or HTTP types.
2. **Routes** (`routes/`) translate HTTP to domain calls and map domain errors to status codes.
3. **Database adapters** (`db/`) map between domain types and Drizzle queries; repositories live here.
4. **Messaging** (`messaging/`) handles Kafka envelope validation and dispatch; added when a ticket requires it.
5. Business state changes that span multiple tables use Drizzle transactions (`db.transaction(...)`).
6. Services must not read or write another service's schema; coordination happens through HTTP or Kafka only.
7. Health endpoints follow quiet logging rules from `docs/logging-conventions.md`.

### Test placement

- Pure logic and validation → `test/unit/` (Jest).
- HTTP handlers and database behavior → `test/integration/` (`node:test`, skip when Postgres unavailable).

## Alternatives considered

- **Flat `src/handlers` layout** — faster to start but blurs ownership boundaries as services grow.
- **Shared ORM package immediately** — premature; replicate per-service until a second service proves shared helpers are needed.

## Consequences

- DIST-15 and later tickets extend the reference skeleton instead of inventing new folder shapes.
- Code review can reject domain files that import transport or persistence drivers.
- Kafka wiring in DIST-16–18 adds `messaging/` without restructuring existing layers.
