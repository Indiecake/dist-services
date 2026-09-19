import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type {
  CategoryResponse,
  CreateCategoryRequest,
  CreateProductRequest,
  PatchCategoryRequest,
  PatchProductRequest,
  ProductResponse
} from '@services-sandbox/contracts/http/catalog';

import {
  CatalogConflictError,
  CatalogInvalidReferenceError,
  CatalogNotFoundError
} from '../domain/errors.ts';
import { categories, productCategories, products, stock } from './schema.ts';

const UNIQUE_VIOLATION_CODE = '23505';

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }

  if ('cause' in error) {
    return postgresCode((error as { cause?: unknown }).cause);
  }

  return undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return postgresCode(error) === UNIQUE_VIOLATION_CODE;
}

function nowIso(): string {
  return new Date().toISOString();
}

function toCategory(row: typeof categories.$inferSelect): CategoryResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function toProduct(
  row: typeof products.$inferSelect,
  stockRow: { onHand: number; reservedQty: number },
  productCategoryRows: CategoryResponse[]
): ProductResponse {
  return {
    id: row.id,
    name: row.name,
    priceCents: row.priceCents,
    description: row.description,
    onHand: stockRow.onHand,
    reservedQty: stockRow.reservedQty,
    categories: productCategoryRows,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export class CatalogRepository {
  private readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async createCategory(input: CreateCategoryRequest): Promise<CategoryResponse> {
    try {
      const [row] = await this.db
        .insert(categories)
        .values({
          name: input.name,
          description: input.description ?? null
        })
        .returning();

      return toCategory(row);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new CatalogConflictError(`category name already exists: ${input.name}`);
      }

      throw error;
    }
  }

  async listCategories(): Promise<CategoryResponse[]> {
    const rows = await this.db
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .orderBy(categories.name);

    return rows.map(toCategory);
  }

  async findCategoryById(categoryId: string): Promise<CategoryResponse> {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
      .limit(1);

    if (!row) {
      throw new CatalogNotFoundError(`Category not found: ${categoryId}`);
    }

    return toCategory(row);
  }

  async updateCategory(categoryId: string, patch: PatchCategoryRequest): Promise<CategoryResponse> {
    try {
      const [row] = await this.db
        .update(categories)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          updatedAt: nowIso()
        })
        .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
        .returning();

      if (!row) {
        throw new CatalogNotFoundError(`Category not found: ${categoryId}`);
      }

      return toCategory(row);
    } catch (error) {
      if (error instanceof CatalogNotFoundError) {
        throw error;
      }

      if (isUniqueViolation(error)) {
        throw new CatalogConflictError(
          `category name already exists: ${patch.name ?? categoryId}`
        );
      }

      throw error;
    }
  }

  async softDeleteCategory(categoryId: string): Promise<void> {
    const [row] = await this.db
      .update(categories)
      .set({
        deletedAt: nowIso(),
        updatedAt: nowIso()
      })
      .where(and(eq(categories.id, categoryId), isNull(categories.deletedAt)))
      .returning({ id: categories.id });

    if (!row) {
      throw new CatalogNotFoundError(`Category not found: ${categoryId}`);
    }
  }

  async createProduct(input: CreateProductRequest): Promise<ProductResponse> {
    const id = input.id ?? randomUUID();

    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(products)
          .values({
            id,
            name: input.name,
            priceCents: input.priceCents,
            description: input.description ?? null
          })
          .returning();

        await tx.insert(stock).values({
          productId: id,
          onHand: input.onHand,
          reservedQty: 0
        });

        const linked =
          input.categoryIds === undefined
            ? []
            : await this.replaceProductCategories(tx, id, input.categoryIds);

        return toProduct(row, { onHand: input.onHand, reservedQty: 0 }, linked);
      });
    } catch (error) {
      if (error instanceof CatalogInvalidReferenceError) {
        throw error;
      }

      if (isUniqueViolation(error)) {
        throw new CatalogConflictError(`product already exists: ${id}`);
      }

      throw error;
    }
  }

  async listProducts(filter: { categoryId?: string } = {}): Promise<ProductResponse[]> {
    const conditions = [isNull(products.deletedAt)];

    if (filter.categoryId) {
      const linked = await this.db
        .select({ productId: productCategories.productId })
        .from(productCategories)
        .innerJoin(categories, eq(categories.id, productCategories.categoryId))
        .where(
          and(
            eq(productCategories.categoryId, filter.categoryId),
            isNull(categories.deletedAt)
          )
        );

      const productIds = linked.map((row) => row.productId);
      if (productIds.length === 0) {
        return [];
      }

      conditions.push(inArray(products.id, productIds));
    }

    const rows = await this.db
      .select({
        product: products,
        onHand: stock.onHand,
        reservedQty: stock.reservedQty
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(and(...conditions))
      .orderBy(products.id);

    return this.assembleProducts(rows);
  }

  async findProductById(productId: string): Promise<ProductResponse> {
    const [row] = await this.db
      .select({
        product: products,
        onHand: stock.onHand,
        reservedQty: stock.reservedQty
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .limit(1);

    if (!row) {
      throw new CatalogNotFoundError(`Product not found: ${productId}`);
    }

    const [assembled] = await this.assembleProducts([row]);
    return assembled;
  }

  async updateProduct(productId: string, patch: PatchProductRequest): Promise<ProductResponse> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new CatalogNotFoundError(`Product not found: ${productId}`);
      }

      await tx
        .update(products)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.priceCents !== undefined ? { priceCents: patch.priceCents } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          updatedAt: nowIso()
        })
        .where(eq(products.id, productId));

      if (patch.categoryIds !== undefined) {
        await this.replaceProductCategories(tx, productId, patch.categoryIds);
      }

      const [row] = await tx
        .select({
          product: products,
          onHand: stock.onHand,
          reservedQty: stock.reservedQty
        })
        .from(products)
        .leftJoin(stock, eq(stock.productId, products.id))
        .where(eq(products.id, productId))
        .limit(1);

      if (!row) {
        throw new CatalogNotFoundError(`Product not found: ${productId}`);
      }

      const [assembled] = await this.assembleProducts([row], tx);
      return assembled;
    });
  }

  async softDeleteProduct(productId: string): Promise<void> {
    const [row] = await this.db
      .update(products)
      .set({
        deletedAt: nowIso(),
        updatedAt: nowIso()
      })
      .where(and(eq(products.id, productId), isNull(products.deletedAt)))
      .returning({ id: products.id });

    if (!row) {
      throw new CatalogNotFoundError(`Product not found: ${productId}`);
    }
  }

  private async replaceProductCategories(
    tx: NodePgDatabase,
    productId: string,
    categoryIds: string[]
  ): Promise<CategoryResponse[]> {
    if (categoryIds.length > 0) {
      const found = await tx
        .select()
        .from(categories)
        .where(and(inArray(categories.id, categoryIds), isNull(categories.deletedAt)));

      if (found.length !== categoryIds.length) {
        const foundIds = new Set(found.map((row) => row.id));
        const missing = categoryIds.find((id) => !foundIds.has(id));
        throw new CatalogInvalidReferenceError(`category not found: ${missing}`);
      }
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

    return this.loadCategoriesForProducts(tx, [productId]).then(
      (map) => map.get(productId) ?? []
    );
  }

  private async assembleProducts(
    rows: Array<{
      product: typeof products.$inferSelect;
      onHand: number | null;
      reservedQty: number | null;
    }>,
    db: NodePgDatabase = this.db
  ): Promise<ProductResponse[]> {
    const categoryMap = await this.loadCategoriesForProducts(
      db,
      rows.map((row) => row.product.id)
    );

    return rows.map((row) =>
      toProduct(
        row.product,
        {
          onHand: row.onHand ?? 0,
          reservedQty: row.reservedQty ?? 0
        },
        categoryMap.get(row.product.id) ?? []
      )
    );
  }

  private async loadCategoriesForProducts(
    db: NodePgDatabase,
    productIds: string[]
  ): Promise<Map<string, CategoryResponse[]>> {
    const map = new Map<string, CategoryResponse[]>();
    if (productIds.length === 0) {
      return map;
    }

    const rows = await db
      .select({
        productId: productCategories.productId,
        category: categories
      })
      .from(productCategories)
      .innerJoin(categories, eq(categories.id, productCategories.categoryId))
      .where(
        and(inArray(productCategories.productId, productIds), isNull(categories.deletedAt))
      )
      .orderBy(categories.name);

    for (const row of rows) {
      const list = map.get(row.productId) ?? [];
      list.push(toCategory(row.category));
      map.set(row.productId, list);
    }

    return map;
  }
}
