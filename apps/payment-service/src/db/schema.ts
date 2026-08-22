import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

import type { MessageEnvelope } from '@services-sandbox/contracts';

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

export const inboxEvents = paymentsSchema.table('inbox_events', {
  messageId: text('message_id').primaryKey(),
  messageType: text('message_type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

export const outboxEvents = paymentsSchema.table('outbox_events', {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    topic: text('topic').notNull(),
    partitionKey: text('partition_key').notNull(),
    envelope: jsonb('envelope').$type<MessageEnvelope>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    claimedBy: text('claimed_by'),
    leaseUntil: timestamp('lease_until', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
  },
  (table) => [
    index('outbox_events_unpublished_created_at_idx')
      .on(table.createdAt)
      .where(sql`${table.publishedAt} is null`)
  ]
);

export const deadLetterEvents = paymentsSchema.table('dead_letter_events', {
  messageId: text('message_id').primaryKey(),
  originalTopic: text('original_topic').notNull(),
  envelope: jsonb('envelope').notNull(),
  reason: text('reason').notNull(),
  attempts: integer('attempts').notNull(),
  failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' })
    .notNull()
    .defaultNow()
});

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
