import {
  integer,
  pgSchema,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

export const ORDER_SCHEMA_NAME = 'orders_schema';

export const ordersSchema = pgSchema(ORDER_SCHEMA_NAME);

export const orders = ordersSchema.table('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: text('customer_id').notNull(),
  status: text('status').notNull(),
  currency: text('currency').notNull(),
  totalAmountCents: integer('total_amount_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const orderItems = ordersSchema.table('order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull()
});

export const orderStatusHistory = ordersSchema.table('order_status_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  reason: text('reason')
});

export const orderServiceTables = {
  orders,
  orderItems,
  orderStatusHistory
} as const;

export const ORDER_TABLE_NAMES = Object.freeze([
  'orders',
  'order_items',
  'order_status_history'
] as const);
