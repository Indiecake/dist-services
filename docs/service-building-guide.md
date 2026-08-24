# Service Building Guide

This guide is the implementation playbook for DIST-3 microservices. Read it together with [service-conventions.md](./service-conventions.md), [ADR-0004](./adr/0004-service-runtime-stack.md), and [ADR-0005](./adr/0005-service-internal-layering.md).

## Bootstrap checklist

Each new or extended service should:

1. Add `package.json` with `@services-sandbox/config` and `@services-sandbox/telemetry`.
2. Provide `.env.example` with required variables from [service-conventions.md](./service-conventions.md).
3. Load configuration through `loadServiceConfig()` and fail fast on invalid env.
4. Create a structured logger with `createLogger({ serviceName })`.
5. Define Drizzle schema in `src/db/schema.ts` for the owned PostgreSQL schema.
6. Add `drizzle.config.ts` and generate migrations with drizzle-kit.
7. Apply pending migrations on startup via `src/db/migrate.ts`.
8. Expose `GET /health` with quiet logging for successful checks.
9. Register graceful shutdown for the HTTP server and database pool.
10. Document ports, commands, and endpoints in the service README.

## Drizzle setup

Per service:

```text
apps/<service>/
  drizzle.config.ts
  src/db/schema.ts
  src/db/client.ts
  src/db/migrate.ts
  database/migrations/
```

Workflow:

1. Model tables in `src/db/schema.ts` using `pgSchema('<service>_schema')`.
2. Run `pnpm exec drizzle-kit generate --name <description>` from the service directory.
3. Commit generated SQL under `database/migrations/`.
4. Call the migrator during server bootstrap before accepting traffic.

Do not maintain parallel hand-written SQL migrations once Drizzle schema exists.

## Testing setup

| Scope | Runner | Location |
| ----- | ------ | -------- |
| App unit tests | Jest | `apps/<service>/test/unit/` |
| App integration tests | `node:test` | `apps/<service>/test/integration/` |
| Shared packages | `node:test` | `packages/<pkg>/test/` |

Per-app scripts:

- `test:unit` → Jest
- `test:integration` → `node --test test/integration/*.test.ts`
- `test` → run both

Integration tests that require Postgres should detect connectivity and **skip gracefully** when the database is unavailable. Register all suites in [`tests/test-suite.ts`](../tests/test-suite.ts) so `pnpm test` runs them from the repo root.

## Local port map

| Service | Port |
| ------- | ---- |
| `api-gateway` | 3010 |
| `order-service` | 3001 |
| `payment-service` | 3002 |
| `inventory-service` | 3003 |
| `shipping-service` | 3004 |

Grafana uses host port 3000 via Docker Compose; do not assign application services to 3000 locally.

## Kafka participant runtime

Kafka command consumers use `@services-sandbox/kafka`:

1. Compose `createInboxEventsTable`, `createOutboxEventsTable`, and `createDeadLetterEventsTable` into the service `pgSchema`.
2. Claim inbox with `claimInboxEvent` in the same transaction as the business write.
3. Start `createKafkaParticipantRuntime` with the service command topic, a domain `handleCommand` callback, and `createOutboxStore`.
4. Route poison/exhausted commands through `handleCommandMessage` so dual DLQ (table + dead-letter topic) stays consistent.

Do not copy `payment-service` messaging files into inventory or shipping. `payment-service` is the reference consumer of this package after DIST-22.

## HTTP contracts

Public and internal HTTP shapes for DIST-3 are documented in [api-contracts.md](./api-contracts.md).

## Epic ticket map

| Ticket | Builds on this guide | Defer |
| ------ | -------------------- | ----- |
| Reference skeleton | ADRs, Drizzle bootstrap, `/health`, Jest layout | Business routes, `/ready`, Kafka |
| DIST-15 | Repositories, `POST/GET /orders`, `/ready` | Kafka, outbox |
| DIST-14 | Gateway forwarding, correlation ids | Auth (DIST-38) |
| DIST-16 | Payment-service Kafka consumers, inbox/outbox, backoff, dead-letter topic | Saga wiring |
| DIST-22 | Shared Kafka participant runtime in `@services-sandbox/kafka` | Inventory/shipping domain |
| DIST-17–18 | Inventory and shipping Kafka consumers using the DIST-22 runtime | Saga wiring |
| DIST-39 | Shared trace propagation helpers | — |
| DIST-38 | Gateway auth middleware | — |

## Definition of Done

Every DIST-3 ticket is done when:

- Acceptance criteria for the Jira ticket are met.
- Unit and integration tests exist and are registered in `tests/test-suite.ts`.
- `pnpm test` passes.
- Service README documents ports, env vars, and run commands.
- `docs/agent-task-log.md` is updated.
- No secrets are committed; placeholders live in `.env.example` only.
- No cross-service schema access was introduced.
