import { Kafka, type Consumer, type Producer } from 'kafkajs';

import { COMMAND_TOPICS } from '@services-sandbox/kafka';

import type { PaymentsRepository } from '../db/payments-repository.ts';
import type { PaymentProcessor } from '../domain/processor.ts';
import { SERVICE_NAME } from '../domain/types.ts';
import { handlePaymentCommand, type PaymentLogger } from './command-handler.ts';

export interface KafkaRuntime {
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createKafkaRuntime(input: {
  brokers: string[];
  repository: PaymentsRepository;
  processor: PaymentProcessor;
  logger: PaymentLogger;
  retryDelaysMs?: readonly number[];
  outboxPollIntervalMs?: number;
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
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let publishing = false;

  async function publishOutbox(): Promise<void> {
    if (publishing) {
      return;
    }

    publishing = true;

    try {
      const unpublished = await input.repository.listUnpublishedOutbox();

      for (const record of unpublished) {
        try {
          await producer.send({
            topic: record.topic,
            messages: [
              {
                key: record.partitionKey,
                value: JSON.stringify(record.envelope)
              }
            ]
          });
          await input.repository.markOutboxPublished(record.id);
        } catch (error) {
          input.logger.warn('Outbox publish failed; will retry', {
            topic: record.topic,
            messageId: record.envelope.messageId,
            reason: error instanceof Error ? error.message : 'publish failed'
          });
          break;
        }
      }
    } catch (error) {
      input.logger.warn('Outbox poll failed; will retry', {
        reason: error instanceof Error ? error.message : 'poll failed'
      });
    } finally {
      publishing = false;
    }
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
        void publishOutbox();
      }, pollIntervalMs);
      void publishOutbox();
    },
    async stop() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }

      await consumer.disconnect();
      await producer.disconnect();
    }
  };
}
