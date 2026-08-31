import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  createDeadLetterEventsTable,
  createInboxEventsTable,
  createOutboxEventsTable
} from '@services-sandbox/kafka/schema';

export const INVENTORY_SCHEMA_NAME = 'inventory_schema';

export const inventorySchema = pgSchema(INVENTORY_SCHEMA_NAME);

export const products = inventorySchema.table('products', {
  id: text('id').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const stock = inventorySchema.table('stock', {
  productId: text('product_id')
    .primaryKey()
    .references(() => products.id, { onDelete: 'cascade' }),
  onHand: integer('on_hand').notNull(),
  reservedQty: integer('reserved_qty').notNull().default(0)
});

export const inventoryReservations = inventorySchema.table('inventory_reservations', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
  status: text('status').notNull(),
  failureReason: text('failure_reason'),
  reservedAt: timestamp('reserved_at', { withTimezone: true, mode: 'string' }),
  releasedAt: timestamp('released_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const reservationItems = inventorySchema.table('reservation_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  reservationId: text('reservation_id')
    .notNull()
    .references(() => inventoryReservations.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull()
});

export const inboxEvents = createInboxEventsTable(inventorySchema);
export const outboxEvents = createOutboxEventsTable(inventorySchema);
export const deadLetterEvents = createDeadLetterEventsTable(inventorySchema);

export const inventoryServiceTables = {
  products,
  stock,
  inventoryReservations,
  reservationItems,
  inboxEvents,
  outboxEvents,
  deadLetterEvents
} as const;

export const INVENTORY_TABLE_NAMES = Object.freeze([
  'products',
  'stock',
  'inventory_reservations',
  'reservation_items',
  'inbox_events',
  'outbox_events',
  'dead_letter_events'
] as const);
