import {
  calculateTotalAmountCents,
  validateCreateOrder
} from '@services-sandbox/contracts/http/create-order';
import { INITIAL_ORDER_STATUS } from './types.ts';

export function prepareCreateOrder(input: unknown) {
  const validated = validateCreateOrder(input);
  const totalAmountCents = calculateTotalAmountCents(validated.items);

  return {
    customerId: validated.customerId,
    currency: validated.currency,
    items: validated.items,
    status: INITIAL_ORDER_STATUS,
    totalAmountCents
  };
}
