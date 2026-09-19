import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { eq } from 'drizzle-orm';
import pg from 'pg';

import { createDbClient } from '../../src/db/client.ts';
import { InventoryRepository } from '../../src/db/inventory-repository.ts';
import { runMigrations } from '../../src/db/migrate.ts';
import { stock } from '../../src/db/schema.ts';
import {
  catalogItem,
  DEFAULT_INVENTORY_CATALOG,
  seedCatalogItems
} from '../../src/db/seed-catalog.ts';

async function isPostgresAvailable(databaseUrl: string): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

test('ensure mode inserts missing catalog stock and leaves existing rows unchanged', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  const { pool, db } = createDbClient(databaseUrl);
  const repository = new InventoryRepository(db);

  try {
    await runMigrations(db);

    const productId = `sku-seed-${randomUUID()}`;
    const first = await seedCatalogItems(db, [catalogItem(productId, 10)], { mode: 'ensure' });
    assert.deepEqual(first.created, [productId]);
    assert.deepEqual(first.skipped, []);

    await db
      .update(stock)
      .set({ reservedQty: 3, onHand: 8 })
      .where(eq(stock.productId, productId));

    const second = await seedCatalogItems(db, [catalogItem(productId, 99)], { mode: 'ensure' });
    assert.deepEqual(second.created, []);
    assert.deepEqual(second.skipped, [productId]);

    const stockRow = await repository.getStock(productId);
    assert.deepEqual(stockRow, { onHand: 8, reservedQty: 3 });
  } finally {
    await pool.end();
  }
});

test('reset mode overwrites on-hand and reserved quantities', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  const { pool, db } = createDbClient(databaseUrl);
  const repository = new InventoryRepository(db);

  try {
    await runMigrations(db);

    const productId = `sku-reset-${randomUUID()}`;
    await seedCatalogItems(db, [catalogItem(productId, 10)], { mode: 'ensure' });
    await db.update(stock).set({ reservedQty: 4 }).where(eq(stock.productId, productId));

    await repository.seedCatalog([catalogItem(productId, 25)]);

    const stockRow = await repository.getStock(productId);
    assert.deepEqual(stockRow, { onHand: 25, reservedQty: 0 });
  } finally {
    await pool.end();
  }
});

test('default catalog seed is idempotent for documented SKUs', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  const { pool, db } = createDbClient(databaseUrl);
  const repository = new InventoryRepository(db);

  try {
    await runMigrations(db);

    const first = await seedCatalogItems(db, DEFAULT_INVENTORY_CATALOG, { mode: 'ensure' });
    const sku1 = await repository.getStock('sku-1');
    const sku2 = await repository.getStock('sku-2');
    assert.ok(sku1);
    assert.ok(sku2);

    if (first.created.includes('sku-1')) {
      assert.equal(sku1.onHand, 100);
    }
    if (first.created.includes('sku-2')) {
      assert.equal(sku2.onHand, 50);
    }

    const again = await seedCatalogItems(db, DEFAULT_INVENTORY_CATALOG, { mode: 'ensure' });
    assert.deepEqual(again.created, []);
    assert.deepEqual(again.skipped, ['sku-1', 'sku-2']);
    assert.deepEqual(await repository.getStock('sku-1'), sku1);
    assert.deepEqual(await repository.getStock('sku-2'), sku2);
  } finally {
    await pool.end();
  }
});
