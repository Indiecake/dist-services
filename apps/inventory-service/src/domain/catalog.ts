import {
  validateCreateCategory,
  validateCreateProduct,
  validatePatchCategory,
  validatePatchProduct
} from '@services-sandbox/contracts/http/catalog';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function prepareCreateCategory(input: unknown) {
  return validateCreateCategory(input);
}

export function preparePatchCategory(input: unknown) {
  return validatePatchCategory(input);
}

export function prepareCreateProduct(input: unknown) {
  return validateCreateProduct(input);
}

export function preparePatchProduct(input: unknown) {
  return validatePatchProduct(input);
}

export function requireCategoryId(categoryId: string): string {
  const trimmed = categoryId.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new ContractValidationError('categoryId must be a UUID');
  }

  return trimmed.toLowerCase();
}

export function requireProductId(productId: string): string {
  const trimmed = productId.trim();
  if (trimmed === '') {
    throw new ContractValidationError('productId is required');
  }

  return trimmed;
}
