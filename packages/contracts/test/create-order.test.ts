import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateTotalAmountCents,
  toGatewayCreateOrderResponse,
  validateCreateOrder
} from '../http/create-order.ts';
import { ContractValidationError } from '../http/errors.ts';

const validRequest = {
  customerId: 'cust-123',
  currency: 'USD',
  items: [
    {
      productId: 'sku-1',
      quantity: 2,
      unitPriceCents: 1299
    }
  ]
};

test('validateCreateOrder accepts a valid request', () => {
  const result = validateCreateOrder(validRequest);

  assert.deepEqual(result, validRequest);
});

test('validateCreateOrder rejects missing customerId', () => {
  assert.throws(
    () => validateCreateOrder({ ...validRequest, customerId: '' }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'customerId is required');
      return true;
    }
  );
});

test('validateCreateOrder rejects unsupported currency', () => {
  assert.throws(
    () => validateCreateOrder({ ...validRequest, currency: 'EUR' }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'currency must be supported');
      return true;
    }
  );
});

test('validateCreateOrder rejects empty items', () => {
  assert.throws(
    () => validateCreateOrder({ ...validRequest, items: [] }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'items must contain at least one entry');
      return true;
    }
  );
});

test('validateCreateOrder rejects invalid item quantity and price', () => {
  assert.throws(
    () =>
      validateCreateOrder({
        ...validRequest,
        items: [{ productId: 'sku-1', quantity: 0, unitPriceCents: 1299 }]
      }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'quantity must be greater than 0');
      return true;
    }
  );

  assert.throws(
    () =>
      validateCreateOrder({
        ...validRequest,
        items: [{ productId: 'sku-1', quantity: 1, unitPriceCents: 0 }]
      }),
    (error) => {
      assert.ok(error instanceof ContractValidationError);
      assert.equal(error.message, 'unitPriceCents must be greater than 0');
      return true;
    }
  );
});

test('calculateTotalAmountCents sums item totals', () => {
  const total = calculateTotalAmountCents([
    { productId: 'sku-1', quantity: 2, unitPriceCents: 1299 },
    { productId: 'sku-2', quantity: 1, unitPriceCents: 500 }
  ]);

  assert.equal(total, 3098);
});

test('toGatewayCreateOrderResponse projects the public gateway shape', () => {
  const projected = toGatewayCreateOrderResponse({
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    customerId: 'cust-123',
    status: 'PENDING',
    currency: 'USD',
    totalAmountCents: 2598,
    items: [
      {
        id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        productId: 'sku-1',
        quantity: 2,
        unitPriceCents: 1299
      }
    ],
    createdAt: '2026-06-23T12:00:00.000Z',
    updatedAt: '2026-06-23T12:00:00.000Z'
  });

  assert.deepEqual(projected, {
    orderId: '550e8400-e29b-41d4-a716-446655440000',
    status: 'PENDING',
    totalAmountCents: 2598,
    currency: 'USD'
  });
});
