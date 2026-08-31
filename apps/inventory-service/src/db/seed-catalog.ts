import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { products, stock } from './schema.ts';

export interface CatalogStockItem {
  productId: string;
  onHand: number;
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

export const DEFAULT_INVENTORY_CATALOG: readonly CatalogStockItem[] = Object.freeze([
  { productId: 'sku-1', onHand: 100 },
  { productId: 'sku-2', onHand: 50 }
]);

export function assertValidCatalogItems(items: readonly CatalogStockItem[]): void {
  const seen = new Set<string>();

  for (const [index, item] of items.entries()) {
    const productId = item.productId.trim();
    if (productId === '') {
      throw new InvalidCatalogError(`catalog[${index}].productId is required`);
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
      await tx.insert(products).values({ id: item.productId }).onConflictDoNothing();

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
