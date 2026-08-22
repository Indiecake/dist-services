import { randomUUID } from 'node:crypto';

import { Kafka, type Consumer, type Producer } from 'kafkajs';

import { COMMAND_TOPICS } from '@services-sandbox/kafka';

import {
  DEFAULT_OUTBOX_LEASE_MS,
  type OutboxRecord,
  type PaymentsRepository
} from '../db/payments-repository.ts';
import type { PaymentProcessor } from '../domain/processor.ts';
import { SERVICE_NAME } from '../domain/types.ts';
import { handlePaymentCommand, type PaymentLogger } from './command-handler.ts';

export { DEFAULT_OUTBOX_LEASE_MS };

export interface KafkaRuntime {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function drainClaimedOutbox(input: {
  repository: Pick<
    PaymentsRepository,
    'claimUnpublishedOutbox' | 'markOutboxPublished' | 'releaseOutboxClaim'
  >;
  send: (record: OutboxRecord) => Promise<void>;
  instanceId: string;
  logger: PaymentLogger;
  leaseMs?: number;
  limit?: number;
}): Promise<void> {
  const claimed = await input.repository.claimUnpublishedOutbox({
    instanceId: input.instanceId,
    leaseMs: input.leaseMs,
    limit: input.limit
  });

  for (const record of claimed) {
    try {
      await input.send(record);
      await input.repository.markOutboxPublished({
        id: record.id,
        instanceId: input.instanceId
      });
    } catch (error) {
      await input.repository.releaseOutboxClaim({
        id: record.id,
        instanceId: input.instanceId
      });
      input.logger.warn('Outbox publish failed; will retry', {
        topic: record.topic,
        messageId: record.envelope.messageId,
        reason: error instanceof Error ? error.message : 'publish failed'
      });
      break;
    }
  }
}

export function createKafkaRuntime(input: {
  brokers: string[];
  repository: PaymentsRepository;
  processor: PaymentProcessor;
  logger: PaymentLogger;
  retryDelaysMs?: readonly number[];
  outboxPollIntervalMs?: number;
  outboxLeaseMs?: number;
}): KafkaRuntime {
  const kafka = new Kafka({
    clientId: SERVICE_NAME,
    brokers: input.brokers
  });

  const consumer: Consumer = kafka.consumer({
    groupId: SERVICE_NAME,
    allowAutoTopicCreation: true
  });
  const producer: Producer = kafka.producer({ allowAutoTopicCreation: true });
  const pollIntervalMs = input.outboxPollIntervalMs ?? 500;
  const leaseMs = input.outboxLeaseMs ?? DEFAULT_OUTBOX_LEASE_MS;
  const instanceId = randomUUID();
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let publishing = false;
  let inFlight: Promise<void> | null = null;

  async function publishOutbox(): Promise<void> {
    if (publishing) {
      return;
    }

    publishing = true;

    try {
      await drainClaimedOutbox({
        repository: input.repository,
        instanceId,
        logger: input.logger,
        leaseMs,
        send: async (record) => {
          await producer.send({
            topic: record.topic,
            messages: [
              {
                key: record.partitionKey,
                value: JSON.stringify(record.envelope)
              }
            ]
          });
        }
      });
    } catch (error) {
      input.logger.warn('Outbox poll failed; will retry', {
        reason: error instanceof Error ? error.message : 'poll failed'
      });
    } finally {
      publishing = false;
    }
  }

  function triggerPublish(): void {
    const run = publishOutbox();
    inFlight = run;
    void run.finally(() => {
      if (inFlight === run) {
        inFlight = null;
      }
    });
  }

  return {
    async start() {
      await producer.connect();
      await consumer.connect();
      await consumer.subscribe({ topic: COMMAND_TOPICS.payments, fromBeginning: true });

      await consumer.run({
        autoCommit: false,
        eachMessage: async ({ topic, partition, message, heartbeat }) => {
          const rawText = message.value?.toString() ?? '';
          let rawValue: unknown = rawText;

          try {
            rawValue = JSON.parse(rawText);
          } catch {
            rawValue = rawText;
          }

          await handlePaymentCommand(
            {
              repository: input.repository,
              processor: input.processor,
              logger: input.logger,
              retryDelaysMs: input.retryDelaysMs
            },
            { rawValue, originalTopic: topic }
          );

          await heartbeat();
          await consumer.commitOffsets([
            {
              topic,
              partition,
              offset: (BigInt(message.offset) + 1n).toString()
            }
          ]);
        }
      });

      pollTimer = setInterval(() => {
        triggerPublish();
      }, pollIntervalMs);
      triggerPublish();
    },
    async stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      if (inFlight) {
        await inFlight.catch(() => undefined);
      }

      await input.repository.releaseAllOutboxClaims(instanceId);
      await consumer.disconnect();
      await producer.disconnect();
    }
  };
}
