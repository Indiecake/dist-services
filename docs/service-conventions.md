# Service Conventions

This document defines the default conventions for deployable services in this repository. Use these rules when creating a new service or extending an existing placeholder so the platform stays consistent across naming, health checks, configuration, logging, and folder layout.

## Naming

- Service folder names use lowercase kebab case.
- Runtime service names must match the app folder name exactly.
- Shared package names use the `@services-sandbox/<package-name>` format.
- Database schema names use lowercase snake case and end with `_schema`.
- Event, command, and topic names should include the owning domain and avoid generic names such as `created` or `updated` without context.

## Current service names

- `api-gateway`
- `order-service`
- `payment-service`
- `inventory-service`
- `shipping-service`
- `saga-orchestrator`
- `notification-service`
- `reporting-worker`

## Port conventions

- Infrastructure ports come from `.env` and `docker-compose.yml` and should stay configurable.
- Each HTTP service should expose one application port through the `PORT` environment variable.
- Avoid hardcoding ports in application code or tests.
- When a new service needs a fixed default port for local development, document it in that service's README and keep the value unique across the repo.
- Prefer reserving the `3000-3999` range for service HTTP ports so local tooling and service endpoints are easy to distinguish.

## Health checks

- HTTP services should expose `GET /health` for basic liveness checks.
- Services that depend on external readiness conditions may also expose `GET /ready`.
- Optional aliases such as `/healthz`, `/readyz`, `/live`, and `/livez` are acceptable when required by a framework or deployment target.
- Health endpoints should return quickly and avoid expensive dependency checks unless the endpoint is explicitly a readiness check.
- Successful health requests should be quiet in normal logs; failed health requests should still be logged.

## Configuration

- Services should load runtime configuration through `@services-sandbox/config`.
- Required shared environment variables are:
  - `SERVICE_NAME`
  - `PORT`
  - `DATABASE_URL`
  - `KAFKA_BOOTSTRAP_SERVERS`
  - `OTEL_EXPORTER_OTLP_ENDPOINT`
  - `LOG_LEVEL`
- `SERVICE_NAME` must match the service folder name.
- Environment validation should fail fast during startup rather than allowing partial boot.
- Secrets must not be committed; use `.env.example` for placeholders only.
- Tests and local tooling must not hardcode `DATABASE_URL`.
- Additional service-specific variables should follow uppercase snake case naming.

## Logging

- Services should use the shared helpers from `@services-sandbox/telemetry`.
- Every log line should be a single JSON object.
- Required log fields are:
  - `timestamp`
  - `level`
  - `serviceName`
  - `message`
- Include `correlationId`, `requestId`, and `traceId` whenever they are available.
- Correlation identifiers must be propagated across HTTP boundaries, Kafka messages, and saga steps.
- Health check traffic should follow the quiet logging behavior documented in [logging-conventions.md](./logging-conventions.md).

## Folder structure

Each deployable service should live under `apps/<service-name>/`.

Recommended baseline layout:

```text
apps/<service-name>/
  README.md
  package.json
  src/
  test/
  database/
    README.md
    migrations/
```

Folder expectations:

- `src/` contains runtime code for handlers, transport adapters, and domain logic.
- `test/` contains unit and integration tests focused on service behavior.
- `database/migrations/` contains only migrations owned by that service.
- Service-local helpers stay inside the service unless they are intentionally promoted into `packages/`.

## Service ownership boundaries

- Each service owns its own database schema and migrations.
- Runtime code must not read or write another service's schema directly.
- Cross-service coordination should happen through APIs, events, or orchestrated workflow steps.
- Shared packages may provide helpers, but they must not hide cross-service data access.
- The `reporting-worker` may build read models for analytics, but source-of-truth writes stay with the owning service.

## Documentation expectations

- Each service should keep a short `README.md` describing its responsibility, dependencies, and local commands.
- When a service introduces a new port, topic, or environment variable, document it in the service README and any relevant shared docs.
- Important cross-cutting technical decisions belong in `docs/adr/`.
