# Local Development Platform

## Setup

- Install dependencies with `pnpm install` from the repository root.
- Copy `.env.example` to `.env` if you want to override the default local ports, credentials, or host settings.
- Keep placeholder values in `.env.example`; never commit real secrets.
- If you change local PostgreSQL bootstrap or compose defaults and need a clean restart, use `make reset` before `make up`.

## Startup

Use one of the following commands from the repository root:

- `make up`
- `docker compose up -d`

## Shutdown

- `make down`
- `docker compose down`

## Logs

- `make logs`
- `docker compose logs -f`

## Reset

- `make reset`
- `docker compose down -v --remove-orphans`

## Validation

- `pnpm test`
- `make test`
- Validation covers the monorepo structure, compose platform foundation, local database layout, and shared package behavior.

## Default local URLs

- Kafka UI: `http://localhost:8080`
- Jaeger: `http://localhost:16686`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3000`

## Default credentials

- Grafana username: `admin`
- Grafana password: `admin`

## Service notes

- PostgreSQL runs on port `5432`.
- PostgreSQL initializes service-owned schemas from `infra/postgres/init/`.
- Kafka is available inside Docker at `kafka:9092`.
- Kafka is exposed on the host at `localhost:9092`.
- The OpenTelemetry Collector receives OTLP on `localhost:4319` (gRPC) and `localhost:4320` (HTTP).
- Prometheus scrapes the collector metrics exporter on port `9464`.

## Database layout

- `orders_schema` belongs to `order-service`.
- `payments_schema` belongs to `payment-service`.
- `inventory_schema` belongs to `inventory-service`.
- `shipping_schema` belongs to `shipping-service`.
- `saga_schema` belongs to `saga-orchestrator`.
- `reporting_schema` belongs to `reporting-worker`.
- Service migrations should live under `apps/<service>/database/migrations`.
- If you need the init SQL to rerun locally, use `make reset` before `make up`.

## Troubleshooting

- If WSL Bash is unavailable on Windows, the repository test runner falls back to Git Bash from `C:\Program Files\Git\bin\bash.exe`.
- If Kafka clients on the host cannot connect, verify `KAFKA_ADVERTISED_HOST` in `.env`.
- If Grafana shows no data, confirm that Prometheus and Jaeger are healthy, then refresh the provisioned data sources.
- If Docker Compose fails after prior runs, use `make reset` before starting again.
