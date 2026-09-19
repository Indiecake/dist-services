import {
  prepareCreateCategory,
  prepareCreateProduct,
  preparePatchCategory,
  preparePatchProduct,
  requireCategoryId,
  requireProductId
} from '../../src/domain/catalog';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';

describe('inventory-service catalog domain', () => {
  it('prepares create and patch payloads', () => {
    expect(prepareCreateCategory({ name: 'Tools' })).toEqual({
      name: 'Tools',
      description: null
    });
    expect(preparePatchCategory({ name: 'Hardware' })).toEqual({ name: 'Hardware' });
    expect(prepareCreateProduct({ name: 'Widget', priceCents: 1299 })).toEqual({
      id: undefined,
      name: 'Widget',
      priceCents: 1299,
      description: null,
      categoryIds: undefined,
      onHand: 0
    });
    expect(preparePatchProduct({ priceCents: 1500 })).toEqual({ priceCents: 1500 });
  });

  it('requires product and category identifiers', () => {
    expect(requireProductId(' sku-1 ')).toBe('sku-1');
    expect(() => requireProductId('  ')).toThrow(ContractValidationError);
    expect(requireCategoryId('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(() => requireCategoryId('not-a-uuid')).toThrow(ContractValidationError);
  });
});
