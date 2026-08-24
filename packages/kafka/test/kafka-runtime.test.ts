import test from 'node:test';
import assert from 'node:assert/strict';

import { createEventEnvelope } from '@services-sandbox/contracts';

import type { ParticipantLogger } from '../command-handler.ts';
import { drainClaimedOutbox } from '../kafka-runtime.ts';
import type { OutboxRecord } from '../outbox-store.ts';

function silentLogger(): ParticipantLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

function outboxRecord(id: string): OutboxRecord {
  return {
    id,
    topic: 'dist.event.inventory',
    partitionKey: 'order-1',
    envelope: createEventEnvelope({
      type: 'inventory.reserved',
      source: 'inventory-service',
      correlationId: 'corr-1',
      payload: { orderId: 'order-1', reservationId: 'res-1' }
    })
  };
}

test('claims unpublished rows, sends them, and marks the claimer as published', async () => {
  const records = [outboxRecord('row-1'), outboxRecord('row-2')];
  const claimed: unknown[] = [];
  const marked: unknown[] = [];
  const released: unknown[] = [];
  const sent: string[] = [];

  await drainClaimedOutbox({
    instanceId: 'instance-a',
    logger: silentLogger(),
    leaseMs: 30_000,
    send: async (record) => {
      sent.push(record.id);
    },
    store: {
      claimUnpublishedOutbox: async (input) => {
        claimed.push(input);
        return records;
      },
      markOutboxPublished: async (input) => {
        marked.push(input);
      },
      releaseOutboxClaim: async (input) => {
        released.push(input);
      },
      releaseAllOutboxClaims: async () => undefined
    }
  });

  assert.deepEqual(claimed, [{ instanceId: 'instance-a', leaseMs: 30_000, limit: undefined }]);
  assert.deepEqual(sent, ['row-1', 'row-2']);
  assert.deepEqual(marked, [
    { id: 'row-1', instanceId: 'instance-a' },
    { id: 'row-2', instanceId: 'instance-a' }
  ]);
  assert.equal(released.length, 0);
});

test('releases the failed claim and stops the batch so the next poll can retry', async () => {
  const records = [outboxRecord('row-1'), outboxRecord('row-2')];
  const marked: unknown[] = [];
  const released: unknown[] = [];
  const warnings: string[] = [];

  await drainClaimedOutbox({
    instanceId: 'instance-a',
    logger: {
      ...silentLogger(),
      warn: (message) => {
        warnings.push(message);
      }
    },
    send: async (record) => {
      if (record.id === 'row-1') {
        throw new Error('broker unavailable');
      }
    },
    store: {
      claimUnpublishedOutbox: async () => records,
      markOutboxPublished: async (input) => {
        marked.push(input);
      },
      releaseOutboxClaim: async (input) => {
        released.push(input);
      },
      releaseAllOutboxClaims: async () => undefined
    }
  });

  assert.deepEqual(released, [{ id: 'row-1', instanceId: 'instance-a' }]);
  assert.equal(marked.length, 0);
  assert.ok(warnings.includes('Outbox publish failed; will retry'));
});
