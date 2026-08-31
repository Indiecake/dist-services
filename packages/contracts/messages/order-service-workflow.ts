/**
 * order-service workflow message type constants and v1 payload shapes.
 * Envelope `type` values use dot notation; see docs/kafka-topic-conventions.md
 * for the mapping from architecture PascalCase names.
 */

export const MESSAGE_TYPES = Object.freeze({
  ORDER_CREATED: 'order.created',
  PAYMENT_CHARGE_REQUESTED: 'payment.charge.requested',
  PAYMENT_CHARGED: 'payment.charged',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUND_REQUESTED: 'payment.refund.requested',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_REFUND_FAILED: 'payment.refund.failed',
  PAYMENT_DEADLETTERED: 'payment.deadlettered',
  INVENTORY_RESERVE_REQUESTED: 'inventory.reserve.requested',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RESERVATION_FAILED: 'inventory.reservation.failed',
  INVENTORY_RELEASE_REQUESTED: 'inventory.release.requested',
  INVENTORY_RELEASED: 'inventory.released',
  INVENTORY_RELEASE_FAILED: 'inventory.release.failed',
  INVENTORY_DEADLETTERED: 'inventory.deadlettered',
  SHIPPING_CREATE_REQUESTED: 'shipping.create.requested',
  SHIPPING_CREATED: 'shipping.created',
  SHIPPING_FAILED: 'shipping.failed'
} as const);

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export interface OrderCreatedPayloadV1 {
  orderId: string;
  customerId: string;
  status: string;
  currency: string;
  totalAmountCents: number;
}

export interface PaymentChargeRequestedPayloadV1 {
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
}

export interface PaymentChargedPayloadV1 {
  orderId: string;
  paymentId: string;
  providerReference: string;
  chargedAt: string;
}

export interface PaymentFailedPayloadV1 {
  orderId: string;
  paymentId: string;
  reason: string;
}

export interface PaymentRefundRequestedPayloadV1 {
  orderId: string;
  paymentId: string;
}

export interface PaymentRefundedPayloadV1 {
  orderId: string;
  paymentId: string;
  providerReference: string;
  refundedAt: string;
}

export interface PaymentRefundFailedPayloadV1 {
  orderId: string;
  paymentId: string;
  reason: string;
}

export interface PaymentDeadletteredPayloadV1 {
  originalTopic: string;
  originalEnvelope: unknown;
  reason: string;
  attempts: number;
  failedAt: string;
  orderId?: string;
  paymentId?: string;
}

export interface InventoryReserveRequestedPayloadV1 {
  orderId: string;
  reservationId: string;
  items: Array<{
    productId: string;
    quantity: number;
  }>;
}

export interface InventoryReservedPayloadV1 {
  orderId: string;
  reservationId: string;
  reservedAt: string;
}

export interface InventoryReservationFailedPayloadV1 {
  orderId: string;
  reservationId: string;
  reason: string;
}

export interface InventoryReleaseRequestedPayloadV1 {
  orderId: string;
  reservationId: string;
}

export interface InventoryReleasedPayloadV1 {
  orderId: string;
  reservationId: string;
  releasedAt: string;
}

export interface InventoryReleaseFailedPayloadV1 {
  orderId: string;
  reservationId: string;
  reason: string;
}

export interface InventoryDeadletteredPayloadV1 {
  originalTopic: string;
  originalEnvelope: unknown;
  reason: string;
  attempts: number;
  failedAt: string;
  orderId?: string;
  reservationId?: string;
}

export interface ShippingCreateRequestedPayloadV1 {
  orderId: string;
  shipmentId: string;
  destination: {
    line1: string;
    city: string;
    postalCode: string;
    country: string;
  };
}

export interface ShippingCreatedPayloadV1 {
  orderId: string;
  shipmentId: string;
  trackingNumber: string;
  createdAt: string;
}

export interface ShippingFailedPayloadV1 {
  orderId: string;
  shipmentId: string;
  reason: string;
}

/** Maps architecture.md PascalCase names to envelope type strings. */
export const ARCHITECTURE_EVENT_TYPE_MAP = Object.freeze({
  OrderCreated: MESSAGE_TYPES.ORDER_CREATED,
  PaymentCharged: MESSAGE_TYPES.PAYMENT_CHARGED,
  PaymentFailed: MESSAGE_TYPES.PAYMENT_FAILED,
  RefundPaymentRequested: MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED,
  PaymentRefunded: MESSAGE_TYPES.PAYMENT_REFUNDED,
  RefundPaymentFailed: MESSAGE_TYPES.PAYMENT_REFUND_FAILED,
  PaymentDeadlettered: MESSAGE_TYPES.PAYMENT_DEADLETTERED,
  ReserveInventoryCommand: MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED,
  InventoryReserved: MESSAGE_TYPES.INVENTORY_RESERVED,
  InventoryReservationFailed: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
  ReleaseInventoryRequested: MESSAGE_TYPES.INVENTORY_RELEASE_REQUESTED,
  InventoryReleased: MESSAGE_TYPES.INVENTORY_RELEASED,
  InventoryReleaseFailed: MESSAGE_TYPES.INVENTORY_RELEASE_FAILED,
  InventoryDeadlettered: MESSAGE_TYPES.INVENTORY_DEADLETTERED,
  ShipmentCreated: MESSAGE_TYPES.SHIPPING_CREATED,
  ShipmentFailed: MESSAGE_TYPES.SHIPPING_FAILED
} as const);

export function isMessageType(value: string): value is MessageType {
  return Object.values(MESSAGE_TYPES).includes(value as MessageType);
}
