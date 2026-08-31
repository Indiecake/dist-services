import type { InventoryReserveRequestedPayloadV1 } from '@services-sandbox/contracts/messages/order-service-workflow';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { InvalidInventoryCommandError } from './errors.ts';
import {
  RESERVATION_STATUSES,
  WORKFLOW_STEPS,
  type LineItem,
  type ReservationSnapshot,
  type ResultEventDecision
} from './types.ts';

export interface ReserveDecision {
  reservation: ReservationSnapshot;
  resultEvent: ResultEventDecision;
}

export type ReservePlan =
  | { kind: 'skip_stock'; decision: ReserveDecision }
  | { kind: 'attempt_stock' };

function requireNonEmptyString(fieldName: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInventoryCommandError(`${fieldName} is required`);
  }

  return value.trim();
}

function requirePositiveInteger(fieldName: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new InvalidInventoryCommandError(`${fieldName} must be a positive integer`);
  }

  return value;
}

export function parseReserveCommandPayload(payload: unknown): InventoryReserveRequestedPayloadV1 {
  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidInventoryCommandError('reserve payload must be an object');
  }

  const record = payload as Record<string, unknown>;
  if (!Array.isArray(record.items) || record.items.length === 0) {
    throw new InvalidInventoryCommandError('items must be a non-empty array');
  }

  const seen = new Set<string>();
  const items: LineItem[] = record.items.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidInventoryCommandError(`items[${index}] must be an object`);
    }

    const line = item as Record<string, unknown>;
    const productId = requireNonEmptyString(`items[${index}].productId`, line.productId);
    if (seen.has(productId)) {
      throw new InvalidInventoryCommandError(`duplicate productId: ${productId}`);
    }
    seen.add(productId);

    return {
      productId,
      quantity: requirePositiveInteger(`items[${index}].quantity`, line.quantity)
    };
  });

  return {
    orderId: requireNonEmptyString('orderId', record.orderId),
    reservationId: requireNonEmptyString('reservationId', record.reservationId),
    items
  };
}

export function sortedLineItems(items: LineItem[]): LineItem[] {
  return [...items].sort((left, right) => left.productId.localeCompare(right.productId));
}

function replayReserved(existing: ReservationSnapshot): ReserveDecision {
  return {
    reservation: existing,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RESERVED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVED,
      payload: {
        orderId: existing.orderId,
        reservationId: existing.id,
        reservedAt: existing.reservedAt ?? new Date().toISOString()
      }
    }
  };
}

function replayFailed(existing: ReservationSnapshot): ReserveDecision {
  return {
    reservation: existing,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVATION_FAILED,
      payload: {
        orderId: existing.orderId,
        reservationId: existing.id,
        reason: existing.failureReason ?? `cannot reserve inventory in status ${existing.status}`
      }
    }
  };
}

function rejectIllegalReserveStatus(existing: ReservationSnapshot): ReserveDecision {
  const reason = `cannot reserve inventory in status ${existing.status}`;

  return {
    reservation: {
      ...existing,
      failureReason: reason
    },
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVATION_FAILED,
      payload: {
        orderId: existing.orderId,
        reservationId: existing.id,
        reason
      }
    }
  };
}

export function planReserve(
  command: InventoryReserveRequestedPayloadV1,
  existing: ReservationSnapshot | null
): ReservePlan {
  if (!existing) {
    return { kind: 'attempt_stock' };
  }

  if (existing.id !== command.reservationId) {
    return {
      kind: 'skip_stock',
      decision: {
        reservation: existing,
        resultEvent: {
          type: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
          workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVATION_FAILED,
          payload: {
            orderId: command.orderId,
            reservationId: command.reservationId,
            reason: `order already has reservation ${existing.id}`
          }
        }
      }
    };
  }

  if (existing.status === RESERVATION_STATUSES.RESERVED) {
    return { kind: 'skip_stock', decision: replayReserved(existing) };
  }

  if (existing.status === RESERVATION_STATUSES.FAILED) {
    return { kind: 'skip_stock', decision: replayFailed(existing) };
  }

  return { kind: 'skip_stock', decision: rejectIllegalReserveStatus(existing) };
}

export function decideReserve(input: {
  command: InventoryReserveRequestedPayloadV1;
  existing: ReservationSnapshot | null;
  stockFailureReason: string | null;
}): ReserveDecision {
  const plan = planReserve(input.command, input.existing);
  if (plan.kind === 'skip_stock') {
    return plan.decision;
  }

  if (input.stockFailureReason) {
    return {
      reservation: {
        id: input.command.reservationId,
        orderId: input.command.orderId,
        status: RESERVATION_STATUSES.FAILED,
        failureReason: input.stockFailureReason,
        reservedAt: null,
        releasedAt: null,
        items: input.command.items
      },
      resultEvent: {
        type: MESSAGE_TYPES.INVENTORY_RESERVATION_FAILED,
        workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVATION_FAILED,
        payload: {
          orderId: input.command.orderId,
          reservationId: input.command.reservationId,
          reason: input.stockFailureReason
        }
      }
    };
  }

  const reservedAt = new Date().toISOString();

  return {
    reservation: {
      id: input.command.reservationId,
      orderId: input.command.orderId,
      status: RESERVATION_STATUSES.RESERVED,
      failureReason: null,
      reservedAt,
      releasedAt: null,
      items: input.command.items
    },
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RESERVED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RESERVED,
      payload: {
        orderId: input.command.orderId,
        reservationId: input.command.reservationId,
        reservedAt
      }
    }
  };
}
