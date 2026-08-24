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

export type ParticipantPgSchema = ReturnType<typeof pgSchema>;

export function createInboxEventsTable(schema: ParticipantPgSchema) {
  return schema.table('inbox_events', {
    messageId: text('message_id').primaryKey(),
    messageType: text('message_type').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
  });
}

export function createOutboxEventsTable(schema: ParticipantPgSchema) {
  return schema.table(
    'outbox_events',
    {
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
}

export function createDeadLetterEventsTable(schema: ParticipantPgSchema) {
  return schema.table('dead_letter_events', {
    messageId: text('message_id').primaryKey(),
    originalTopic: text('original_topic').notNull(),
    envelope: jsonb('envelope').notNull(),
    reason: text('reason').notNull(),
    attempts: integer('attempts').notNull(),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' })
      .notNull()
      .defaultNow()
  });
}

export type InboxEventsTable = ReturnType<typeof createInboxEventsTable>;
export type OutboxEventsTable = ReturnType<typeof createOutboxEventsTable>;
export type DeadLetterEventsTable = ReturnType<typeof createDeadLetterEventsTable>;

export const PARTICIPANT_TABLE_NAMES = Object.freeze([
  'inbox_events',
  'outbox_events',
  'dead_letter_events'
] as const);
