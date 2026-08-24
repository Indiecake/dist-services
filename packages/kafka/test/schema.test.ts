import test from 'node:test';
import assert from 'node:assert/strict';

import { getTableConfig } from 'drizzle-orm/pg-core';
import { pgSchema } from 'drizzle-orm/pg-core';

import {
  PARTICIPANT_TABLE_NAMES,
  createDeadLetterEventsTable,
  createInboxEventsTable,
  createOutboxEventsTable
} from '../schema.ts';

test('participant table factories use the caller schema name', () => {
  const schema = pgSchema('inventory_schema');
  const inboxEvents = createInboxEventsTable(schema);
  const outboxEvents = createOutboxEventsTable(schema);
  const deadLetterEvents = createDeadLetterEventsTable(schema);

  assert.equal(getTableConfig(inboxEvents).schema, 'inventory_schema');
  assert.equal(getTableConfig(inboxEvents).name, 'inbox_events');
  assert.equal(getTableConfig(outboxEvents).schema, 'inventory_schema');
  assert.equal(getTableConfig(outboxEvents).name, 'outbox_events');
  assert.equal(getTableConfig(deadLetterEvents).name, 'dead_letter_events');
  assert.ok(outboxEvents.claimedBy);
  assert.ok(outboxEvents.leaseUntil);
  assert.deepEqual([...PARTICIPANT_TABLE_NAMES], [
    'inbox_events',
    'outbox_events',
    'dead_letter_events'
  ]);
});
