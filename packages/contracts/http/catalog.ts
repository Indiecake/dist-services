import { ContractValidationError } from './errors.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateCategoryRequest {
  name: string;
  description?: string | null;
}

export interface PatchCategoryRequest {
  name?: string;
  description?: string | null;
}

export interface CategoryResponse {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  id?: string;
  name: string;
  priceCents: number;
  description?: string | null;
  categoryIds?: string[];
  onHand: number;
}

export interface PatchProductRequest {
  name?: string;
  priceCents?: number;
  description?: string | null;
  categoryIds?: string[];
}

export interface ProductResponse {
  id: string;
  name: string;
  priceCents: number;
  description: string | null;
  onHand: number;
  reservedQty: number;
  categories: CategoryResponse[];
  createdAt: string;
  updatedAt: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function normalizeOptionalDescription(value: unknown, fieldName: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ContractValidationError(`${fieldName} must be a string or null`);
  }

  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeCategoryIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ContractValidationError('categoryIds must be an array');
  }

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const [index, rawId] of value.entries()) {
    if (!isNonEmptyString(rawId) || !isUuid(rawId.trim())) {
      throw new ContractValidationError(`categoryIds[${index}] must be a UUID`);
    }

    const id = rawId.trim().toLowerCase();
    if (seen.has(id)) {
      throw new ContractValidationError(`duplicate categoryId: ${id}`);
    }

    seen.add(id);
    ids.push(id);
  }

  return ids;
}

export function isCategoryResponse(body: unknown): body is CategoryResponse {
  if (body === null || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    (candidate.description === null || typeof candidate.description === 'string') &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function isCategoryListResponse(body: unknown): body is CategoryResponse[] {
  return Array.isArray(body) && body.every(isCategoryResponse);
}

export function isProductResponse(body: unknown): body is ProductResponse {
  if (body === null || typeof body !== 'object') {
    return false;
  }

  const candidate = body as Record<string, unknown>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.priceCents === 'number' &&
    (candidate.description === null || typeof candidate.description === 'string') &&
    typeof candidate.onHand === 'number' &&
    typeof candidate.reservedQty === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.categories) &&
    candidate.categories.every(isCategoryResponse)
  );
}

export function isProductListResponse(body: unknown): body is ProductResponse[] {
  return Array.isArray(body) && body.every(isProductResponse);
}

export function validateCreateCategory(input: unknown): CreateCategoryRequest {
  if (input === null || typeof input !== 'object') {
    throw new ContractValidationError('Request body must be a JSON object');
  }

  const body = input as Record<string, unknown>;

  if (!isNonEmptyString(body.name)) {
    throw new ContractValidationError('name is required');
  }

  const description = normalizeOptionalDescription(body.description, 'description');

  return {
    name: body.name.trim(),
    description: description === undefined ? null : description
  };
}

export function validatePatchCategory(input: unknown): PatchCategoryRequest {
  if (input === null || typeof input !== 'object') {
    throw new ContractValidationError('Request body must be a JSON object');
  }

  const body = input as Record<string, unknown>;
  const patch: PatchCategoryRequest = {};

  if ('name' in body) {
    if (!isNonEmptyString(body.name)) {
      throw new ContractValidationError('name is required');
    }
    patch.name = body.name.trim();
  }

  if ('description' in body) {
    const description = normalizeOptionalDescription(body.description, 'description');
    patch.description = description === undefined ? null : description;
  }

  if (patch.name === undefined && patch.description === undefined) {
    throw new ContractValidationError('at least one field is required');
  }

  return patch;
}

export function validateCreateProduct(input: unknown): CreateProductRequest {
  if (input === null || typeof input !== 'object') {
    throw new ContractValidationError('Request body must be a JSON object');
  }

  const body = input as Record<string, unknown>;

  let id: string | undefined;
  if ('id' in body && body.id !== undefined) {
    if (!isNonEmptyString(body.id)) {
      throw new ContractValidationError('id must be a non-empty string');
    }
    id = body.id.trim();
  }

  if (!isNonEmptyString(body.name)) {
    throw new ContractValidationError('name is required');
  }

  if (!isPositiveInteger(body.priceCents)) {
    throw new ContractValidationError('priceCents must be greater than 0');
  }

  const description = normalizeOptionalDescription(body.description, 'description');

  let categoryIds: string[] | undefined;
  if ('categoryIds' in body && body.categoryIds !== undefined) {
    categoryIds = normalizeCategoryIds(body.categoryIds);
  }

  let onHand = 0;
  if ('onHand' in body && body.onHand !== undefined) {
    if (!isNonNegativeInteger(body.onHand)) {
      throw new ContractValidationError('onHand must be a non-negative integer');
    }
    onHand = body.onHand;
  }

  return {
    id,
    name: body.name.trim(),
    priceCents: body.priceCents,
    description: description === undefined ? null : description,
    categoryIds,
    onHand
  };
}

export function validatePatchProduct(input: unknown): PatchProductRequest {
  if (input === null || typeof input !== 'object') {
    throw new ContractValidationError('Request body must be a JSON object');
  }

  const body = input as Record<string, unknown>;
  const patch: PatchProductRequest = {};

  if ('name' in body) {
    if (!isNonEmptyString(body.name)) {
      throw new ContractValidationError('name is required');
    }
    patch.name = body.name.trim();
  }

  if ('priceCents' in body) {
    if (!isPositiveInteger(body.priceCents)) {
      throw new ContractValidationError('priceCents must be greater than 0');
    }
    patch.priceCents = body.priceCents;
  }

  if ('description' in body) {
    const description = normalizeOptionalDescription(body.description, 'description');
    patch.description = description === undefined ? null : description;
  }

  if ('categoryIds' in body) {
    if (body.categoryIds === undefined) {
      throw new ContractValidationError('categoryIds must be an array');
    }
    patch.categoryIds = normalizeCategoryIds(body.categoryIds);
  }

  if (
    patch.name === undefined &&
    patch.priceCents === undefined &&
    patch.description === undefined &&
    patch.categoryIds === undefined
  ) {
    throw new ContractValidationError('at least one field is required');
  }

  return patch;
}
