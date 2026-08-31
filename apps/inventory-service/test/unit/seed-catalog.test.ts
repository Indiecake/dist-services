import {
  assertValidCatalogItems,
  DEFAULT_INVENTORY_CATALOG,
  InvalidCatalogError
} from '../../src/db/seed-catalog';

describe('inventory-service catalog seed', () => {
  it('covers the SKUs used in order and API examples', () => {
    expect(DEFAULT_INVENTORY_CATALOG.map((item) => item.productId)).toEqual(['sku-1', 'sku-2']);
    expect(DEFAULT_INVENTORY_CATALOG.every((item) => item.onHand > 0)).toBe(true);
  });

  it('rejects empty product ids, duplicate SKUs, and invalid on-hand quantities', () => {
    expect(() =>
      assertValidCatalogItems([{ productId: '  ', onHand: 1 }])
    ).toThrow(InvalidCatalogError);

    expect(() =>
      assertValidCatalogItems([
        { productId: 'sku-1', onHand: 1 },
        { productId: 'sku-1', onHand: 2 }
      ])
    ).toThrow(/duplicate productId/);

    expect(() =>
      assertValidCatalogItems([{ productId: 'sku-1', onHand: -1 }])
    ).toThrow(/non-negative integer/);

    expect(() =>
      assertValidCatalogItems([{ productId: 'sku-1', onHand: 1.5 }])
    ).toThrow(/non-negative integer/);
  });

  it('accepts the default catalog', () => {
    expect(() => assertValidCatalogItems(DEFAULT_INVENTORY_CATALOG)).not.toThrow();
  });
});
