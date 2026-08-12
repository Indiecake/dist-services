import { calculateTotalAmountCents, validateCreateOrder } from '@services-sandbox/contracts/http/create-order';
import { prepareCreateOrder } from '../../src/domain/create-order.ts';

describe('prepareCreateOrder', () => {
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

  it('returns prepared order data with computed total', () => {
    const prepared = prepareCreateOrder(validRequest);

    expect(prepared).toEqual({
      customerId: 'cust-123',
      currency: 'USD',
      items: validRequest.items,
      status: 'PENDING',
      totalAmountCents: calculateTotalAmountCents(validRequest.items)
    });
  });

  it('rejects invalid customerId', () => {
    expect(() => prepareCreateOrder({ ...validRequest, customerId: '' })).toThrow(
      'customerId is required'
    );
  });
});

describe('validateCreateOrder', () => {
  it('rejects unsupported currency', () => {
    expect(() =>
      validateCreateOrder({
        customerId: 'cust-123',
        currency: 'EUR',
        items: [{ productId: 'sku-1', quantity: 1, unitPriceCents: 100 }]
      })
    ).toThrow('currency must be supported');
  });
});
