import {
  calculateTotalAmountCents,
  validateCreateOrder,
  type CreateOrderRequest
} from '@services-sandbox/contracts/http/create-order';
import { ContractValidationError } from '@services-sandbox/contracts/http/errors';
import { INITIAL_ORDER_STATUS } from './types.ts';

export function prepareCreateOrder(input: CreateOrderRequest | unknown) {
  try {
    const validated = validateCreateOrder(input);
    const totalAmountCents = calculateTotalAmountCents(validated.items);

    return {
      customerId: validated.customerId,
      currency: validated.currency,
      items: validated.items,
      status: INITIAL_ORDER_STATUS,
      totalAmountCents
    };
  } catch (error) {
    if (error instanceof ContractValidationError) {
      throw error;
    }

    throw error;
  }
}
