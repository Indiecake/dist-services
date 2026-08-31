import {
  INVENTORY_SCHEMA_NAME,
  INVENTORY_TABLE_NAMES,
  inventoryServiceTables
} from '../../src/db/schema';

describe('inventory-service schema', () => {
  it('uses the owned postgres schema name', () => {
    expect(INVENTORY_SCHEMA_NAME).toBe('inventory_schema');
  });

  it('defines product, stock, reservation, inbox, outbox, and dead-letter tables', () => {
    expect(INVENTORY_TABLE_NAMES).toEqual([
      'products',
      'stock',
      'inventory_reservations',
      'reservation_items',
      'inbox_events',
      'outbox_events',
      'dead_letter_events'
    ]);
    expect(inventoryServiceTables.products).toBeDefined();
    expect(inventoryServiceTables.stock).toBeDefined();
    expect(inventoryServiceTables.inventoryReservations).toBeDefined();
    expect(inventoryServiceTables.reservationItems).toBeDefined();
    expect(inventoryServiceTables.inboxEvents).toBeDefined();
    expect(inventoryServiceTables.outboxEvents).toBeDefined();
    expect(inventoryServiceTables.outboxEvents.claimedBy).toBeDefined();
    expect(inventoryServiceTables.outboxEvents.leaseUntil).toBeDefined();
    expect(inventoryServiceTables.deadLetterEvents).toBeDefined();
  });
});
