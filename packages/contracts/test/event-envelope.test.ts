import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MESSAGE_ENVELOPE_FIELDS,
  createCommandEnvelope,
  createEventEnvelope,
  createFollowUpEnvelope,
  validateMessageEnvelope
} from '../index.ts';

test('creates a command envelope with the shared required fields', () => {
  const envelope = createCommandEnvelope({
    type: 'payment.charge.requested',
    version: 1,
    source: 'saga-orchestrator',
    correlationId: 'corr-order-123',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    payload: {
      orderId: 'order-123',
      paymentId: 'payment-123',
      amountCents: 2599,
      currency: 'USD'
    }
  });

  assert.deepEqual(Object.keys(envelope), MESSAGE_ENVELOPE_FIELDS);
  assert.match(envelope.messageId, /^[0-9a-f-]{36}$/i);
  assert.equal(envelope.type, 'payment.charge.requested');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.source, 'saga-orchestrator');
  assert.equal(envelope.correlationId, 'corr-order-123');
  assert.equal(envelope.causationId, null);
  assert.equal(envelope.traceparent, '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
  assert.equal(envelope.payload.orderId, 'order-123');
  assert.ok(Number.isFinite(Date.parse(envelope.timestamp)));
});

test('creates follow-up envelopes that carry correlation and causation context', () => {
  const command = createCommandEnvelope({
    type: 'inventory.reserve.requested',
    version: 1,
    source: 'saga-orchestrator',
    correlationId: 'corr-order-456',
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    payload: {
      orderId: 'order-456',
      reservationId: 'res-456'
    }
  });

  const event = createFollowUpEnvelope(command, {
    type: 'inventory.reserved',
    version: 1,
    source: 'inventory-service',
    payload: {
      orderId: 'order-456',
      reservationId: 'res-456',
      warehouseId: 'wh-1'
    }
  });

  assert.equal(event.correlationId, 'corr-order-456');
  assert.equal(event.causationId, command.messageId);
  assert.equal(event.traceparent, command.traceparent);
});

test('allows explicit event envelopes and traceparent overrides for downstream messages', () => {
  const sourceEvent = createEventEnvelope({
    type: 'payment.charged',
    version: 2,
    source: 'payment-service',
    correlationId: 'corr-order-789',
    payload: {
      orderId: 'order-789',
      paymentId: 'payment-789'
    }
  });

  const nextEvent = createFollowUpEnvelope(sourceEvent, {
    type: 'notification.payment-receipt.requested',
    source: 'notification-service',
    traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
    payload: {
      orderId: 'order-789'
    }
  });

  assert.equal(sourceEvent.version, 2);
  assert.equal(nextEvent.version, 1);
  assert.equal(nextEvent.traceparent, '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01');
});

test('validates malformed envelopes before services can use them', () => {
  assert.throws(() => createCommandEnvelope({
    type: '',
    source: 'order-service',
    correlationId: 'corr-1',
    payload: {}
  }), /type must be a non-empty string/);

  assert.throws(() => createEventEnvelope({
    type: 'order.created',
    version: 0,
    source: 'order-service',
    correlationId: 'corr-1',
    payload: {}
  }), /version must be a positive integer/);

  assert.throws(() => validateMessageEnvelope({
    messageId: 'msg-1',
    type: 'order.created',
    version: 1,
    source: 'order-service',
    timestamp: 'not-a-date',
    correlationId: 'corr-1',
    causationId: null,
    traceparent: null,
    payload: {}
  }), /timestamp must be a valid ISO-8601 string/);

  assert.throws(() => validateMessageEnvelope({
    messageId: 'msg-2',
    type: 'order.created',
    version: 1,
    source: 'order-service',
    timestamp: '2026-06-09T00:00:00.000Z',
    correlationId: 'corr-2',
    causationId: null,
    traceparent: null,
    payload: undefined
  }), /payload is required/);
});
