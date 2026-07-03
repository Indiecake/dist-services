# ADR-0004: Service Runtime Stack

## Status

Accepted

## Context

DIST-3 introduces the first runnable microservices in `apps/`. The foundation packages already standardize configuration, logging, Kafka topic names, and message envelopes. We need a consistent runtime stack for HTTP services, persistence, migrations, and testing before implementing order workflow tickets (DIST-15 through DIST-18).

The order-service scaffold already declares Fastify, Drizzle ORM, and `pg` as dependencies.

## Decision

Adopt the following stack for DIST-3 deployable services:

| Layer | Choice |
| ----- | ------ |
| HTTP | Fastify |
| Postgres access | Drizzle ORM with the `pg` driver |
| Migrations | drizzle-kit generated SQL in `apps/<service>/database/migrations/` |
| Unit tests (apps) | Jest under `test/unit/` |
| Integration tests (apps) | `node:test` under `test/integration/` |
| Package tests | `node:test` (unchanged in this epic) |
| Local dev runner | `tsx` |
| Module system | TypeScript ESM |

### Migration rules

- Each service defines tables in `src/db/schema.ts` scoped to its owned PostgreSQL schema (for example `orders_schema`).
- `drizzle.config.ts` lives at the service root and points at the schema file and migrations output folder.
- Hand-written SQL migrations are not maintained alongside Drizzle output; schema-as-code is the single source of truth.
- On local startup, services apply pending Drizzle migrations programmatically before serving traffic.
- Shared database conventions stay in `packages/database`; ORM dependencies remain per-service.

### Testing rules

- Jest covers domain logic, validation, and pure helpers in `apps/*/test/unit/`.
- `node:test` covers HTTP and database integration in `apps/*/test/integration/`.
- Integration suites skip gracefully when Postgres is unreachable rather than failing the entire repository test run.
- Foundation packages under `packages/*` continue using `node:test` until a dedicated migration ticket exists.

## Alternatives considered

- **Raw `pg` without an ORM** — simpler initially, but repetitive SQL mapping across five workflow services.
- **Jest for all tests including packages** — rejected to limit scope; packages already use `node:test`.
- **Hand-written SQL migrations only** — rejected in favor of Drizzle schema-as-code and drizzle-kit generation.

## Consequences

- Each new DIST-3 service copies the order-service reference layout: Drizzle schema, migrate-on-startup, Jest + `node:test` split.
- Agents must run `pnpm exec drizzle-kit generate` after schema changes and commit generated migration files.
- Root `pnpm test` must invoke both Jest and `node:test` runners for app suites.
