import test from 'node:test';
import assert from 'node:assert/strict';

import { createEventEnvelope } from '../index.ts';
import {
  ARCHITECTURE_EVENT_TYPE_MAP,
  MESSAGE_TYPES,
  isMessageType
} from '../messages/order-service-workflow.ts';

test('exports stable order-service message type constants', () => {
  assert.equal(MESSAGE_TYPES.ORDER_CREATED, 'order.created');
  assert.equal(MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED, 'payment.charge.requested');
  assert.equal(MESSAGE_TYPES.SHIPPING_FAILED, 'shipping.failed');
});

test('maps architecture PascalCase names to envelope type strings', () => {
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.OrderCreated, 'order.created');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.PaymentCharged, 'payment.charged');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.ShipmentCreated, 'shipping.created');
});

test('creates an order.created envelope from catalog constants', () => {
  const envelope = createEventEnvelope({
    type: MESSAGE_TYPES.ORDER_CREATED,
    version: 1,
    source: 'order-service',
    correlationId: 'corr-order-123',
    payload: {
      orderId: 'order-123',
      customerId: 'cust-123',
      status: 'PENDING',
      currency: 'USD',
      totalAmountCents: 2598
    }
  });

  assert.equal(envelope.type, 'order.created');
  assert.equal(envelope.payload.orderId, 'order-123');
});

test('validates known message types', () => {
  assert.equal(isMessageType('order.created'), true);
  assert.equal(isMessageType('unknown.event'), false);
});
