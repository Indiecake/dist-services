# order-service migrations

Drizzle-kit generates SQL migrations in this folder from `src/db/schema.ts`.

Example output: `0000_initial.sql` plus `meta/_journal.json`.

Generate a new migration from the service directory:

```bash
pnpm exec drizzle-kit generate --name <description>
```
