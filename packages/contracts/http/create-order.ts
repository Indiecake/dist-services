import { ContractValidationError } from './errors.ts';
export const SUPPORTED_CURRENCIES = ['USD'] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export interface CreateOrderItem {
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreateOrderRequest {
  customerId: string;
  currency: string;
  items: CreateOrderItem[];
}

export interface OrderServiceItemResponse {
  id: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderServiceCreateResponse {
  orderId: string;
  customerId: string;
  status: string;
  currency: string;
  totalAmountCents: number;
  items: OrderServiceItemResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface GatewayCreateOrderResponse {
  orderId: string;
  status: string;
  totalAmountCents: number;
  currency: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function calculateTotalAmountCents(items: CreateOrderItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0);
}

export function validateCreateOrder(input: unknown): CreateOrderRequest {
  if (input === null || typeof input !== 'object') {
    throw new ContractValidationError('Request body must be a JSON object');
  }

  const body = input as Record<string, unknown>;

  if (!isNonEmptyString(body.customerId)) {
    throw new ContractValidationError('customerId is required');
  }

  if (!isNonEmptyString(body.currency)) {
    throw new ContractValidationError('currency is required');
  }

  if (!SUPPORTED_CURRENCIES.includes(body.currency as SupportedCurrency)) {
    throw new ContractValidationError('currency must be supported');
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new ContractValidationError('items must contain at least one entry');
  }

  const items: CreateOrderItem[] = [];

  for (const [index, rawItem] of body.items.entries()) {
    if (rawItem === null || typeof rawItem !== 'object') {
      throw new ContractValidationError(`items[${index}] must be an object`);
    }

    const item = rawItem as Record<string, unknown>;

    if (!isNonEmptyString(item.productId)) {
      throw new ContractValidationError('productId is required');
    }

    if (!isPositiveInteger(item.quantity)) {
      throw new ContractValidationError('quantity must be greater than 0');
    }

    if (!isPositiveInteger(item.unitPriceCents)) {
      throw new ContractValidationError('unitPriceCents must be greater than 0');
    }

    items.push({
      productId: item.productId.trim(),
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents
    });
  }

  return {
    customerId: body.customerId.trim(),
    currency: body.currency.trim(),
    items
  };
}

export function toGatewayCreateOrderResponse(
  downstream: OrderServiceCreateResponse
): GatewayCreateOrderResponse {
  return {
    orderId: downstream.orderId,
    status: downstream.status,
    totalAmountCents: downstream.totalAmountCents,
    currency: downstream.currency
  };
}
