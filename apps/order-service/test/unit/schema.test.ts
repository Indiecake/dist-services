import {
  ORDER_SCHEMA_NAME,
  ORDER_TABLE_NAMES,
  orderServiceTables
} from '../../src/db/schema';

describe('order-service schema', () => {
  it('uses the owned postgres schema name', () => {
    expect(ORDER_SCHEMA_NAME).toBe('orders_schema');
  });

  it('defines the core order workflow tables', () => {
    expect(ORDER_TABLE_NAMES).toEqual([
      'orders',
      'order_items',
      'order_status_history'
    ]);
    expect(orderServiceTables.orders).toBeDefined();
    expect(orderServiceTables.orderItems).toBeDefined();
    expect(orderServiceTables.orderStatusHistory).toBeDefined();
  });
});
