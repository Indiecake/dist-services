import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isCategoryListResponse,
  isCategoryResponse,
  isProductListResponse,
  isProductResponse,
  validateCreateCategory,
  validateCreateProduct,
  validatePatchCategory,
  validatePatchProduct
} from '../http/catalog.ts';
import { ContractValidationError } from '../http/errors.ts';

const categoryId = '550e8400-e29b-41d4-a716-446655440000';

const validCategory = {
  id: categoryId,
  name: 'General',
  description: null,
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:00.000Z'
};

const validProduct = {
  id: 'sku-1',
  name: 'Widget',
  priceCents: 1299,
  description: 'Standard widget',
  onHand: 100,
  reservedQty: 0,
  categories: [validCategory],
  createdAt: '2026-09-19T12:00:00.000Z',
  updatedAt: '2026-09-19T12:00:00.000Z'
};

test('validateCreateCategory accepts a valid request', () => {
  assert.deepEqual(validateCreateCategory({ name: ' General ', description: '  All products  ' }), {
    name: 'General',
    description: 'All products'
  });
});

test('validateCreateCategory rejects a missing name', () => {
  assert.throws(
    () => validateCreateCategory({ name: '  ' }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'name is required');
      return true;
    }
  );
});

test('validatePatchCategory requires at least one field', () => {
  assert.throws(
    () => validatePatchCategory({}),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'at least one field is required');
      return true;
    }
  );
});

test('validatePatchCategory accepts a description clear', () => {
  assert.deepEqual(validatePatchCategory({ description: null }), {
    description: null
  });
});

test('validateCreateProduct defaults onHand and trims fields', () => {
  assert.deepEqual(
    validateCreateProduct({
      id: ' sku-1 ',
      name: ' Widget ',
      priceCents: 1299,
      categoryIds: [categoryId.toUpperCase()]
    }),
    {
      id: 'sku-1',
      name: 'Widget',
      priceCents: 1299,
      description: null,
      categoryIds: [categoryId],
      onHand: 0
    }
  );
});

test('validateCreateProduct rejects invalid price and onHand', () => {
  assert.throws(
    () => validateCreateProduct({ name: 'Widget', priceCents: 0 }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'priceCents must be greater than 0');
      return true;
    }
  );

  assert.throws(
    () => validateCreateProduct({ name: 'Widget', priceCents: 100, onHand: -1 }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'onHand must be a non-negative integer');
      return true;
    }
  );
});

test('validateCreateProduct rejects invalid category ids', () => {
  assert.throws(
    () => validateCreateProduct({ name: 'Widget', priceCents: 100, categoryIds: ['not-a-uuid'] }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'categoryIds[0] must be a UUID');
      return true;
    }
  );

  assert.throws(
    () =>
      validateCreateProduct({
        name: 'Widget',
        priceCents: 100,
        categoryIds: [categoryId, categoryId]
      }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, `duplicate categoryId: ${categoryId}`);
      return true;
    }
  );
});

test('validatePatchProduct replaces categoryIds including an empty list', () => {
  assert.deepEqual(validatePatchProduct({ categoryIds: [] }), {
    categoryIds: []
  });
});

test('validatePatchProduct requires at least one field', () => {
  assert.throws(
    () => validatePatchProduct({}),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'at least one field is required');
      return true;
    }
  );
});

test('type guards accept catalog payloads and reject incomplete ones', () => {
  assert.equal(isCategoryResponse(validCategory), true);
  assert.equal(isCategoryListResponse([validCategory]), true);
  assert.equal(isProductResponse(validProduct), true);
  assert.equal(isProductListResponse([validProduct]), true);
  assert.equal(isCategoryResponse({ id: categoryId, name: 'General' }), false);
  assert.equal(isProductResponse({ ...validProduct, categories: [{}] }), false);
});
