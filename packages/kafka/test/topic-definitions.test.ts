import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMAND_TOPICS,
  DEADLETTER_TOPICS,
  EVENT_TOPICS,
  TOPIC_CATALOG,
  TOPIC_PARTITION_KEYS,
  buildTopicName,
  getTopicPartitionKey
} from '../index.ts';

test('defines command topics for the order workflow services', () => {
  assert.deepEqual(COMMAND_TOPICS, {
    orders: 'dist.command.orders',
    payments: 'dist.command.payments',
    inventory: 'dist.command.inventory',
    shipping: 'dist.command.shipping'
  });
});

test('defines event topics for domain services and saga lifecycle events', () => {
  assert.deepEqual(EVENT_TOPICS, {
    orders: 'dist.event.orders',
    payments: 'dist.event.payments',
    inventory: 'dist.event.inventory',
    shipping: 'dist.event.shipping',
    saga: 'dist.event.saga'
  });
  assert.equal(TOPIC_CATALOG.events.saga, 'dist.event.saga');
});

test('defines dead-letter topics for workflow domains', () => {
  assert.deepEqual(DEADLETTER_TOPICS, {
    orders: 'dist.deadletter.orders',
    payments: 'dist.deadletter.payments',
    inventory: 'dist.deadletter.inventory',
    shipping: 'dist.deadletter.shipping'
  });
  assert.equal(TOPIC_CATALOG.deadletters.payments, 'dist.deadletter.payments');
});

test('uses orderId for workflow topics and sagaId for saga lifecycle events', () => {
  assert.equal(getTopicPartitionKey(COMMAND_TOPICS.orders), 'orderId');
  assert.equal(getTopicPartitionKey(COMMAND_TOPICS.payments), 'orderId');
  assert.equal(getTopicPartitionKey(COMMAND_TOPICS.inventory), 'orderId');
  assert.equal(getTopicPartitionKey(COMMAND_TOPICS.shipping), 'orderId');
  assert.equal(getTopicPartitionKey(EVENT_TOPICS.orders), 'orderId');
  assert.equal(getTopicPartitionKey(EVENT_TOPICS.saga), 'sagaId');
  assert.equal(getTopicPartitionKey(DEADLETTER_TOPICS.payments), 'orderId');
  assert.equal(TOPIC_PARTITION_KEYS['dist.event.shipping'], 'orderId');
});

test('builds topic names from the shared naming convention', () => {
  assert.equal(buildTopicName('command', 'orders'), 'dist.command.orders');
  assert.equal(buildTopicName('event', 'shipping'), 'dist.event.shipping');
  assert.equal(buildTopicName('deadletter', 'payments'), 'dist.deadletter.payments');
});

test('rejects unsupported topic names and categories', () => {
  assert.throws(() => buildTopicName('command', 'notifications'), /Unsupported topic domain/);
  assert.throws(() => getTopicPartitionKey('dist.event.unknown'), /Unknown topic name/);
});
