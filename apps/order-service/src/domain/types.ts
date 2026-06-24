export const ORDER_SCHEMA = 'orders_schema';
export const INITIAL_ORDER_STATUS = 'PENDING';
export const SUPPORTED_CURRENCIES = ['USD'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface OrderItemInput {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderInput {
  customerId: string;
  currency: string;
  items: OrderItemInput[];
}

export interface OrderItemRecord {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderStatusHistoryRecord {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  changedAt: string;
  reason: string | null;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  status: string;
  currency: string;
  totalAmountCents: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItemRecord[];
  statusHistory: OrderStatusHistoryRecord[];
}

export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

export class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = 'OrderNotFoundError';
  }
}
