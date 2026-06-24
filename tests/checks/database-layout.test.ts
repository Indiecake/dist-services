import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

import { repoRoot } from '../repo-root.ts';

const sqlFile = path.join(repoRoot, 'infra/postgres/init/001-create-service-schemas.sql');
const docFile = path.join(repoRoot, 'docs/database-layout.md');

const statefulServices = [
  'order-service',
  'payment-service',
  'inventory-service',
  'shipping-service',
  'saga-orchestrator',
  'reporting-worker'
] as const;

const schemas = [
  'orders_schema',
  'payments_schema',
  'inventory_schema',
  'shipping_schema',
  'saga_schema',
  'reporting_schema'
] as const;

test('includes bootstrap SQL and database layout documentation', () => {
  assert.ok(existsSync(sqlFile));
  assert.ok(existsSync(docFile));
});

test('defines migration directories for stateful services', () => {
  for (const service of statefulServices) {
    assert.ok(
      existsSync(path.join(repoRoot, 'apps', service, 'database', 'migrations')),
      `Missing migration directory for service: ${service}`
    );
  }
});

test('documents service-owned schemas in SQL and docs', () => {
  const sql = readFileSync(sqlFile, 'utf8');
  const docs = readFileSync(docFile, 'utf8');

  for (const schema of schemas) {
    assert.match(sql, new RegExp(schema));
    assert.match(docs, new RegExp(schema));
  }

  assert.match(docs, /apps\/<service>\/database\/migrations\//);
});
