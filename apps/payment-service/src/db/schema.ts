import { integer, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  createDeadLetterEventsTable,
  createInboxEventsTable,
  createOutboxEventsTable
} from '@services-sandbox/kafka/schema';

export const PAYMENT_SCHEMA_NAME = 'payments_schema';

export const paymentsSchema = pgSchema(PAYMENT_SCHEMA_NAME);

export const payments = paymentsSchema.table('payments', {
  id: text('id').primaryKey(),
  orderId: text('order_id').notNull().unique(),
  amountCents: integer('amount_cents').notNull(),
  currency: text('currency').notNull(),
  status: text('status').notNull(),
  providerReference: text('provider_reference'),
  failureReason: text('failure_reason'),
  chargedAt: timestamp('charged_at', { withTimezone: true, mode: 'string' }),
  refundedAt: timestamp('refunded_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const paymentAttempts = paymentsSchema.table('payment_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  paymentId: text('payment_id')
    .notNull()
    .references(() => payments.id, { onDelete: 'cascade' }),
  attemptType: text('attempt_type').notNull(),
  status: text('status').notNull(),
  providerReference: text('provider_reference'),
  reason: text('reason'),
  attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const inboxEvents = createInboxEventsTable(paymentsSchema);
export const outboxEvents = createOutboxEventsTable(paymentsSchema);
export const deadLetterEvents = createDeadLetterEventsTable(paymentsSchema);

export const paymentServiceTables = {
  payments,
  paymentAttempts,
  inboxEvents,
  outboxEvents,
  deadLetterEvents
} as const;

export const PAYMENT_TABLE_NAMES = Object.freeze([
  'payments',
  'payment_attempts',
  'inbox_events',
  'outbox_events',
  'dead_letter_events'
] as const);
