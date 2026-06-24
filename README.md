# Distributed Services Sandbox

Local foundation for an event-driven portfolio project built around microservices, Kafka, and observability.

## Repository layout

```text
/apps
  /api-gateway
  /order-service
  /payment-service
  /inventory-service
  /shipping-service
  /saga-orchestrator
  /notification-service
  /reporting-worker
/packages
  /contracts
  /telemetry
  /database
  /kafka
  /config
/infra
/docs
/tests
```

## Included platform services

- PostgreSQL
- Kafka (KRaft mode)
- Kafka UI
- OpenTelemetry Collector
- Jaeger
- Prometheus
- Grafana

## Monorepo notes

- `apps/` contains deployable services.
- `packages/` contains shared code and conventions reused across services.
- `packages/config` contains shared service configuration parsing and validation.
- `packages/kafka` contains the shared Kafka topic catalog and partition-key conventions.
- `packages/telemetry` contains shared request-context and structured logging helpers.
- `infra/` contains local infrastructure configuration.
- `infra/postgres/init/` contains the bootstrap SQL for local service-owned schemas.
- `docs/adr/` is reserved for architecture decision records.
- Root `package.json` defines the workspace boundaries for future app and package manifests.

## Local database layout

- A single local PostgreSQL container is used for development.
- Each stateful service owns a dedicated schema inside that instance.
- Migration files live with the owning service under `apps/<service>/database/migrations`.
- The initial schema bootstrap lives in `infra/postgres/init/001-create-service-schemas.sql`.

## Quick start

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` if you want to override defaults.
3. Start the platform with `make up` or `docker compose up -d`.
4. Open the local tools:
   - Kafka UI: `http://localhost:8080`
   - Jaeger: `http://localhost:16686`
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3000`

## Common commands

- `pnpm install`
- `make up`
- `make down`
- `make logs`
- `make reset`
- `pnpm test`
- `make test`

## Documentation

- `docs/README.md` is the documentation index and best starting point for repository guidance.
- `docs/architecture.md` explains the system shape, service responsibilities, and saga orchestration flow.
- `docs/service-conventions.md` defines shared service naming, runtime, health check, and folder conventions.
- `docs/local-development.md` covers local environment setup, commands, URLs, and troubleshooting.
- `docs/database-layout.md` documents service-owned schemas and migration boundaries.
- `docs/kafka-topic-conventions.md` defines Kafka topic naming and partition-key strategy.
- `docs/configuration-package.md` explains the shared runtime configuration package.
- `docs/logging-conventions.md` explains the shared logging and request-context rules.
