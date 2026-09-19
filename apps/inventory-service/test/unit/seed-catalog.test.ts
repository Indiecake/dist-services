import {
  assertValidCatalogItems,
  catalogItem,
  DEFAULT_CATEGORY_NAME,
  DEFAULT_INVENTORY_CATALOG,
  InvalidCatalogError
} from '../../src/db/seed-catalog';

describe('inventory-service catalog seed', () => {
  it('covers the SKUs used in order and API examples', () => {
    expect(DEFAULT_INVENTORY_CATALOG.map((item) => item.productId)).toEqual(['sku-1', 'sku-2']);
    expect(DEFAULT_INVENTORY_CATALOG.every((item) => item.onHand > 0)).toBe(true);
    expect(DEFAULT_INVENTORY_CATALOG[0].priceCents).toBe(1299);
    expect(DEFAULT_INVENTORY_CATALOG.every((item) => item.categoryNames?.includes(DEFAULT_CATEGORY_NAME))).toBe(
      true
    );
  });

  it('rejects empty product ids, duplicate SKUs, and invalid on-hand quantities', () => {
    expect(() =>
      assertValidCatalogItems([catalogItem('  ', 1)])
    ).toThrow(InvalidCatalogError);

    expect(() =>
      assertValidCatalogItems([catalogItem('sku-1', 1), catalogItem('sku-1', 2)])
    ).toThrow(/duplicate productId/);

    expect(() =>
      assertValidCatalogItems([catalogItem('sku-1', -1)])
    ).toThrow(/non-negative integer/);

    expect(() =>
      assertValidCatalogItems([catalogItem('sku-1', 1.5)])
    ).toThrow(/non-negative integer/);
  });

  it('rejects missing names and invalid prices', () => {
    expect(() =>
      assertValidCatalogItems([{ productId: 'sku-1', name: '  ', priceCents: 100, onHand: 1 }])
    ).toThrow(/name is required/);

    expect(() =>
      assertValidCatalogItems([{ productId: 'sku-1', name: 'Widget', priceCents: 0, onHand: 1 }])
    ).toThrow(/priceCents must be a positive integer/);
  });

  it('accepts the default catalog', () => {
    expect(() => assertValidCatalogItems(DEFAULT_INVENTORY_CATALOG)).not.toThrow();
  });
});
