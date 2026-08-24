import { randomUUID } from 'node:crypto';

import { Kafka, type Consumer, type Producer } from 'kafkajs';

import type { ParticipantLogger } from './command-handler.ts';
import { DEFAULT_OUTBOX_LEASE_MS, type OutboxRecord, type OutboxStore } from './outbox-store.ts';

export interface KafkaRuntime {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export async function drainClaimedOutbox(input: {
  store: OutboxStore;
  send: (record: OutboxRecord) => Promise<void>;
  instanceId: string;
  logger: ParticipantLogger;
  leaseMs?: number;
  limit?: number;
}): Promise<void> {
  const claimed = await input.store.claimUnpublishedOutbox({
    instanceId: input.instanceId,
    leaseMs: input.leaseMs,
    limit: input.limit
  });

  for (const record of claimed) {
    try {
      await input.send(record);
      await input.store.markOutboxPublished({
        id: record.id,
        instanceId: input.instanceId
      });
    } catch (error) {
      await input.store.releaseOutboxClaim({
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

export function createKafkaParticipantRuntime(input: {
  serviceName: string;
  brokers: string[];
  commandTopic: string;
  handleCommand: (input: { rawValue: unknown; originalTopic: string }) => Promise<unknown>;
  outboxStore: OutboxStore;
  logger: ParticipantLogger;
  outboxPollIntervalMs?: number;
  outboxLeaseMs?: number;
}): KafkaRuntime {
  const kafka = new Kafka({
    clientId: input.serviceName,
    brokers: input.brokers
  });

  const consumer: Consumer = kafka.consumer({
    groupId: input.serviceName,
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
        store: input.outboxStore,
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
      await consumer.subscribe({ topic: input.commandTopic, fromBeginning: true });

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

          await input.handleCommand({ rawValue, originalTopic: topic });

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

      await input.outboxStore.releaseAllOutboxClaims(instanceId);
      await consumer.disconnect();
      await producer.disconnect();
    }
  };
}
