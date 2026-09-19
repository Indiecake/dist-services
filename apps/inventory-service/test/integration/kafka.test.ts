import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';

import { Kafka } from 'kafkajs';
import pg from 'pg';

import { createCommandEnvelope } from '@services-sandbox/contracts';
import { COMMAND_TOPICS, DEADLETTER_TOPICS, EVENT_TOPICS } from '@services-sandbox/kafka';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { catalogItem } from '../../src/db/seed-catalog.ts';
import { createInventoryService } from '../../src/server.ts';

async function isPostgresAvailable(databaseUrl: string): Promise<boolean> {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000
  });

  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

async function isKafkaAvailable(brokers: string[]): Promise<boolean> {
  const kafka = new Kafka({
    clientId: 'inventory-service-test',
    brokers,
    connectionTimeout: 2_000,
    requestTimeout: 2_000
  });
  const admin = kafka.admin();

  try {
    await Promise.race([
      admin.connect(),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('kafka connect timeout')), 3_000);
      })
    ]);
    return true;
  } catch {
    return false;
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

test('Kafka round-trip publishes inventory.reserved on dist.event.inventory', async (t) => {
  const databaseUrl = `${process.env.DATABASE_URL}`;
  const brokers = (process.env.KAFKA_BOOTSTRAP_SERVERS ?? 'localhost:9092').split(',');

  if (!(await isPostgresAvailable(databaseUrl))) {
    t.skip('Postgres is not available; skipping inventory-service Kafka integration test.');
    return;
  }

  if (!(await isKafkaAvailable(brokers))) {
    t.skip('Kafka is not available; skipping inventory-service Kafka integration test.');
    return;
  }

  process.env.SERVICE_NAME = 'inventory-service';
  process.env.PORT = '3003';
  process.env.DATABASE_URL = databaseUrl;
  process.env.KAFKA_BOOTSTRAP_SERVERS = brokers.join(',');
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
  process.env.LOG_LEVEL = 'info';
  process.env.KAFKAJS_NO_PARTITIONER_WARNING = '1';

  const kafka = new Kafka({
    clientId: 'inventory-service-test-client',
    brokers,
    connectionTimeout: 2_000,
    requestTimeout: 5_000
  });
  const admin = kafka.admin();
  const producer = kafka.producer({ allowAutoTopicCreation: true });
  const consumer = kafka.consumer({
    groupId: `inventory-service-test-${randomUUID()}`,
    allowAutoTopicCreation: true
  });

  await admin.connect();
  try {
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        { topic: COMMAND_TOPICS.inventory, numPartitions: 1, replicationFactor: 1 },
        { topic: EVENT_TOPICS.inventory, numPartitions: 1, replicationFactor: 1 },
        { topic: DEADLETTER_TOPICS.inventory, numPartitions: 1, replicationFactor: 1 }
      ]
    });
  } catch {
    // Topics may already exist from a previous local run.
  }
  await admin.disconnect();

  const runtime = await createInventoryService({
    enableMessaging: true,
    outboxPollIntervalMs: 200
  });

  try {
    const productId = `sku-${randomUUID()}`;
    await runtime.repository.seedCatalog([catalogItem(productId, 5)]);

    await producer.connect();
    await consumer.connect();
    await consumer.subscribe({ topic: EVENT_TOPICS.inventory, fromBeginning: true });

    const envelope = createCommandEnvelope({
      type: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
      source: 'test',
      correlationId: `corr-${randomUUID()}`,
      payload: {
        orderId: `order-${randomUUID()}`,
        reservationId: `res-${randomUUID()}`,
        items: [{ productId, quantity: 1 }]
      }
    });

    const received = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for inventory.reserved'));
      }, 15_000);

      void consumer.run({
        eachMessage: async ({ message }) => {
          if (!message.value) {
            return;
          }

          const parsed = JSON.parse(message.value.toString()) as {
            type?: string;
            causationId?: string;
          };

          if (
            parsed.type === MESSAGE_TYPES.INVENTORY_RESERVED &&
            parsed.causationId === envelope.messageId
          ) {
            clearTimeout(timeout);
            resolve();
          }
        }
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 1_000));

    await producer.send({
      topic: COMMAND_TOPICS.inventory,
      messages: [{ key: envelope.payload.orderId, value: JSON.stringify(envelope) }]
    });

    await received;
    assert.ok(true);
  } finally {
    await consumer.disconnect().catch(() => undefined);
    await producer.disconnect().catch(() => undefined);
    await runtime.close();
  }
});
