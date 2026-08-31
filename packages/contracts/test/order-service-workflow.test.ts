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
  assert.equal(MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED, 'payment.refund.requested');
  assert.equal(MESSAGE_TYPES.PAYMENT_REFUNDED, 'payment.refunded');
  assert.equal(MESSAGE_TYPES.PAYMENT_REFUND_FAILED, 'payment.refund.failed');
  assert.equal(MESSAGE_TYPES.PAYMENT_DEADLETTERED, 'payment.deadlettered');
  assert.equal(MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED, 'inventory.reserve.requested');
  assert.equal(MESSAGE_TYPES.INVENTORY_RELEASE_REQUESTED, 'inventory.release.requested');
  assert.equal(MESSAGE_TYPES.INVENTORY_RELEASED, 'inventory.released');
  assert.equal(MESSAGE_TYPES.INVENTORY_RELEASE_FAILED, 'inventory.release.failed');
  assert.equal(MESSAGE_TYPES.INVENTORY_DEADLETTERED, 'inventory.deadlettered');
  assert.equal(MESSAGE_TYPES.SHIPPING_FAILED, 'shipping.failed');
});

test('maps architecture PascalCase names to envelope type strings', () => {
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.OrderCreated, 'order.created');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.PaymentCharged, 'payment.charged');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.PaymentRefunded, 'payment.refunded');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.PaymentDeadlettered, 'payment.deadlettered');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.ReserveInventoryCommand, 'inventory.reserve.requested');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.ReleaseInventoryRequested, 'inventory.release.requested');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.InventoryReleased, 'inventory.released');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.InventoryReleaseFailed, 'inventory.release.failed');
  assert.equal(ARCHITECTURE_EVENT_TYPE_MAP.InventoryDeadlettered, 'inventory.deadlettered');
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
