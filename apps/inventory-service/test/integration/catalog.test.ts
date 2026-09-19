import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import pg from 'pg';

import { createCommandEnvelope } from '@services-sandbox/contracts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { catalogItem } from '../../src/db/seed-catalog.ts';
import { handleInventoryCommand } from '../../src/messaging/command-handler.ts';
import { createInventoryService } from '../../src/server.ts';

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

function configureInventoryServiceEnv(databaseUrl: string): void {
  process.env.SERVICE_NAME = 'inventory-service';
  process.env.PORT = '3003';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = 'localhost:9092';
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
}

const silentLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

test('category and product catalog HTTP supports create, read, update, and soft delete', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const categoryName = `Tools-${randomUUID()}`;
    const otherName = `Hardware-${randomUUID()}`;

    const createdCategory = await runtime.app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: categoryName, description: 'Hand tools' }
    });
    assert.equal(createdCategory.statusCode, 201);
    const category = createdCategory.json();
    assert.equal(category.name, categoryName);
    assert.equal(category.description, 'Hand tools');

    const duplicateCategory = await runtime.app.inject({
      method: 'POST',
      url: '/categories',
      payload: { name: categoryName }
    });
    assert.equal(duplicateCategory.statusCode, 409);

    const listedCategories = await runtime.app.inject({ method: 'GET', url: '/categories' });
    assert.equal(listedCategories.statusCode, 200);
    assert.ok(listedCategories.json().some((item: { id: string }) => item.id === category.id));

    const fetchedCategory = await runtime.app.inject({
      method: 'GET',
      url: `/categories/${category.id}`
    });
    assert.equal(fetchedCategory.statusCode, 200);
    assert.equal(fetchedCategory.json().id, category.id);

    const patchedCategory = await runtime.app.inject({
      method: 'PATCH',
      url: `/categories/${category.id}`,
      payload: { description: 'Updated tools' }
    });
    assert.equal(patchedCategory.statusCode, 200);
    assert.equal(patchedCategory.json().description, 'Updated tools');

    const otherCategory = (
      await runtime.app.inject({
        method: 'POST',
        url: '/categories',
        payload: { name: otherName }
      })
    ).json();

    const productId = `sku-catalog-${randomUUID()}`;
    const createdProduct = await runtime.app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        id: productId,
        name: 'Hammer',
        priceCents: 1999,
        description: 'Steel hammer',
        categoryIds: [category.id],
        onHand: 12
      }
    });
    assert.equal(createdProduct.statusCode, 201);
    const product = createdProduct.json();
    assert.equal(product.id, productId);
    assert.equal(product.name, 'Hammer');
    assert.equal(product.priceCents, 1999);
    assert.equal(product.onHand, 12);
    assert.equal(product.reservedQty, 0);
    assert.equal(product.categories.length, 1);
    assert.equal(product.categories[0].id, category.id);

    const duplicateProduct = await runtime.app.inject({
      method: 'POST',
      url: '/products',
      payload: { id: productId, name: 'Hammer', priceCents: 1999 }
    });
    assert.equal(duplicateProduct.statusCode, 409);

    const missingCategory = await runtime.app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'Ghost',
        priceCents: 100,
        categoryIds: ['550e8400-e29b-41d4-a716-446655440000']
      }
    });
    assert.equal(missingCategory.statusCode, 400);

    const listedByCategory = await runtime.app.inject({
      method: 'GET',
      url: `/products?categoryId=${category.id}`
    });
    assert.equal(listedByCategory.statusCode, 200);
    assert.ok(listedByCategory.json().some((item: { id: string }) => item.id === productId));

    const replaced = await runtime.app.inject({
      method: 'PATCH',
      url: `/products/${productId}`,
      payload: { categoryIds: [otherCategory.id], name: 'Claw hammer' }
    });
    assert.equal(replaced.statusCode, 200);
    assert.equal(replaced.json().name, 'Claw hammer');
    assert.deepEqual(
      replaced.json().categories.map((item: { id: string }) => item.id),
      [otherCategory.id]
    );

    const deletedCategory = await runtime.app.inject({
      method: 'DELETE',
      url: `/categories/${otherCategory.id}`
    });
    assert.equal(deletedCategory.statusCode, 204);

    const afterCategoryDelete = await runtime.app.inject({
      method: 'GET',
      url: `/products/${productId}`
    });
    assert.equal(afterCategoryDelete.statusCode, 200);
    assert.deepEqual(afterCategoryDelete.json().categories, []);

    const missingDeletedCategory = await runtime.app.inject({
      method: 'GET',
      url: `/categories/${otherCategory.id}`
    });
    assert.equal(missingDeletedCategory.statusCode, 404);

    const deletedProduct = await runtime.app.inject({
      method: 'DELETE',
      url: `/products/${productId}`
    });
    assert.equal(deletedProduct.statusCode, 204);

    const missingProduct = await runtime.app.inject({
      method: 'GET',
      url: `/products/${productId}`
    });
    assert.equal(missingProduct.statusCode, 404);

    const secondDelete = await runtime.app.inject({
      method: 'DELETE',
      url: `/products/${productId}`
    });
    assert.equal(secondDelete.statusCode, 404);
  } finally {
    await runtime.close();
  }
});

test('reserve command treats a soft-deleted product as missing', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service integration test.');
    return;
  }

  configureInventoryServiceEnv(databaseUrl);
  const runtime = await createInventoryService({ enableMessaging: false });

  try {
    const productId = `sku-deleted-${randomUUID()}`;
    await runtime.repository.seedCatalog([catalogItem(productId, 5)]);

    const deleted = await runtime.app.inject({
      method: 'DELETE',
      url: `/products/${productId}`
    });
    assert.equal(deleted.statusCode, 204);

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 1 }]
      }
    });

    const status = await handleInventoryCommand(
      { repository: runtime.repository, logger: silentLogger },
      { rawValue: envelope }
    );

    assert.equal(status, 'processed');

    const unpublished = await runtime.repository.listUnpublishedOutbox(20);
    const result = unpublished.find((row) => row.envelope.causationId === envelope.messageId);
    assert.ok(result);
    assert.equal(result.envelope.type, MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED);
    assert.equal(
      (result.envelope.payload as { reason?: string }).reason,
      `product not found: ${productId}`
    );
  } finally {
    await runtime.close();
  }
});
