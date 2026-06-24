# database

Shared home for database conventions and helpers.

## Current role

- Documents service-owned schema boundaries for local development.
- Provides a stable place for future migration tooling and connection helpers.

## Local conventions

- Each stateful service owns one schema in the shared PostgreSQL container.
- Service migrations live with the service under `apps/<service>/database/migrations/`.
- Bootstrap SQL that creates local schemas lives under `infra/postgres/init/`.
