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
  INVENTORY_RESERVE_REQUESTED: 'inventory.reserve.requested',
  INVENTORY_RESERVED: 'inventory.reserved',
  INVENTORY_RESERVATION_FAILED: 'inventory.reservation.failed',
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
  InventoryReserved: MESSAGE_TYPES.INVENTORY_RESERVED,
  InventoryReservationFailed: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
  ShipmentCreated: MESSAGE_TYPES.SHIPPING_CREATED,
  ShipmentFailed: MESSAGE_TYPES.SHIPPING_FAILED
} as const);

export function isMessageType(value: string): value is MessageType {
  return Object.values(MESSAGE_TYPES).includes(value as MessageType);
}
