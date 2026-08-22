import { createEventEnvelope } from '@services-sandbox/contracts';
import { EVENT_TOPICS } from '@services-sandbox/kafka';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import type { OutboxRecord } from '../../src/db/payments-repository.ts';
import { drainClaimedOutbox } from '../../src/messaging/kafka-runtime.ts';
import type { PaymentLogger } from '../../src/messaging/command-handler.ts';

function silentLogger(): PaymentLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

function outboxRecord(id: string): OutboxRecord {
  return {
    id,
    topic: EVENT_TOPICS.payments,
    partitionKey: 'order-1',
    envelope: createEventEnvelope({
      type: MESSAGE_TYPES.PAYMENT_CHARGED,
      source: 'payment-service',
      correlationId: 'corr-1',
      payload: { orderId: 'order-1', paymentId: 'pay-1' }
    })
  };
}

describe('drainClaimedOutbox', () => {
  it('claims unpublished rows, sends them, and marks the claimer as published', async () => {
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
      repository: {
        claimUnpublishedOutbox: async (input) => {
          claimed.push(input);
          return records;
        },
        markOutboxPublished: async (input) => {
          marked.push(input);
        },
        releaseOutboxClaim: async (input) => {
          released.push(input);
        }
      }
    });

    expect(claimed).toEqual([{ instanceId: 'instance-a', leaseMs: 30_000, limit: undefined }]);
    expect(sent).toEqual(['row-1', 'row-2']);
    expect(marked).toEqual([
      { id: 'row-1', instanceId: 'instance-a' },
      { id: 'row-2', instanceId: 'instance-a' }
    ]);
    expect(released).toHaveLength(0);
  });

  it('releases the failed claim and stops the batch so the next poll can retry', async () => {
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
      repository: {
        claimUnpublishedOutbox: async () => records,
        markOutboxPublished: async (input) => {
          marked.push(input);
        },
        releaseOutboxClaim: async (input) => {
          released.push(input);
        }
      }
    });

    expect(released).toEqual([{ id: 'row-1', instanceId: 'instance-a' }]);
    expect(marked).toHaveLength(0);
    expect(warnings).toContain('Outbox publish failed; will retry');
  });
});
