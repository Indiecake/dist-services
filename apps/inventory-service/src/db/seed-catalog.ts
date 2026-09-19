import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { categories, productCategories, products, stock } from './schema.ts';

export interface CatalogStockItem {
  productId: string;
  name: string;
  priceCents: number;
  description?: string | null;
  onHand: number;
  categoryNames?: readonly string[];
}

export type SeedCatalogMode = 'ensure' | 'reset';

export interface SeedCatalogResult {
  productIds: string[];
  created: string[];
  skipped: string[];
}

export class InvalidCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCatalogError';
  }
}

export const DEFAULT_CATEGORY_NAME = 'General';

export const DEFAULT_INVENTORY_CATALOG: readonly CatalogStockItem[] = Object.freeze([
  {
    productId: 'sku-1',
    name: 'Widget',
    priceCents: 1299,
    description: 'Standard widget',
    onHand: 100,
    categoryNames: [DEFAULT_CATEGORY_NAME]
  },
  {
    productId: 'sku-2',
    name: 'Gadget',
    priceCents: 2499,
    description: 'Standard gadget',
    onHand: 50,
    categoryNames: [DEFAULT_CATEGORY_NAME]
  }
]);

export function catalogItem(
  productId: string,
  onHand: number,
  extras: Partial<Omit<CatalogStockItem, 'productId' | 'onHand'>> = {}
): CatalogStockItem {
  return {
    productId,
    name: extras.name ?? productId,
    priceCents: extras.priceCents ?? 100,
    description: extras.description ?? null,
    onHand,
    categoryNames: extras.categoryNames
  };
}

export function assertValidCatalogItems(items: readonly CatalogStockItem[]): void {
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    const productId = item.productId.trim();
    if (productId === '') {
      throw new InvalidCatalogError(`catalog[${index}].productId is required`);
    }

    if (item.name.trim() === '') {
      throw new InvalidCatalogError(`catalog[${index}].name is required`);
    }

    if (!Number.isInteger(item.priceCents) || item.priceCents < 1) {
      throw new InvalidCatalogError(
        `catalog[${index}].priceCents must be a positive integer`
      );
    }

    if (!Number.isInteger(item.onHand) || item.onHand < 0) {
      throw new InvalidCatalogError(
        `catalog[${index}].onHand must be a non-negative integer`
      );
    }

    if (seen.has(productId)) {
      throw new InvalidCatalogError(`duplicate productId: ${productId}`);
    }

    seen.add(productId);
  }
}

async function ensureCategoryId(tx: NodePgDatabase, name: string): Promise<string> {
  const normalized = name.trim();
  const [active] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(and(sql`lower(${categories.name}) = ${normalized.toLowerCase()}`, isNull(categories.deletedAt)))
    .limit(1);

  if (active) {
    return active.id;
  }

  const [inserted] = await tx
    .insert(categories)
    .values({ name: normalized })
    .returning({ id: categories.id });

  return inserted.id;
}

async function replaceCategoryLinks(
  tx: NodePgDatabase,
  productId: string,
  categoryNames: readonly string[]
): Promise<void> {
  const categoryIds: string[] = [];
  for (const name of categoryNames) {
    categoryIds.push(await ensureCategoryId(tx, name));
  }

  await tx.delete(productCategories).where(eq(productCategories.productId, productId));

  if (categoryIds.length > 0) {
    await tx.insert(productCategories).values(
      categoryIds.map((categoryId) => ({
        productId,
        categoryId
      }))
    );
  }
}

export async function seedCatalogItems(
  db: NodePgDatabase,
  items: readonly CatalogStockItem[],
  options: { mode?: SeedCatalogMode } = {}
): Promise<SeedCatalogResult> {
  assertValidCatalogItems(items);
  const mode = options.mode ?? 'ensure';
  const productIds = items.map((item) => item.productId);

  if (items.length === 0) {
    return { productIds, created: [], skipped: [] };
  }

  return db.transaction(async (tx) => {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      await tx
        .insert(products)
        .values({
          id: item.productId,
          name: item.name,
          priceCents: item.priceCents,
          description: item.description ?? null,
          deletedAt: null
        })
        .onConflictDoUpdate({
          target: products.id,
          set: {
            name: item.name,
            priceCents: item.priceCents,
            description: item.description ?? null,
            deletedAt: null,
            updatedAt: new Date().toISOString()
          }
        });

      if (item.categoryNames) {
        await replaceCategoryLinks(tx, item.productId, item.categoryNames);
      }

      if (mode === 'reset') {
        await tx
          .insert(stock)
          .values({
            productId: item.productId,
            onHand: item.onHand,
            reservedQty: 0
          })
          .onConflictDoUpdate({
            target: stock.productId,
            set: {
              onHand: item.onHand,
              reservedQty: 0
            }
          });
        created.push(item.productId);
        continue;
      }

      const inserted = await tx
        .insert(stock)
        .values({
          productId: item.productId,
          onHand: item.onHand,
          reservedQty: 0
        })
        .onConflictDoNothing()
        .returning({ productId: stock.productId });

      if (inserted.length > 0) {
        created.push(item.productId);
      } else {
        skipped.push(item.productId);
      }
    }

    return { productIds, created, skipped };
  });
}
