import type { InventoryReleaseRequestedPayloadV1 } from '@services-sandbox/contracts/messages/order-service-workflow';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { InvalidInventoryCommandError } from './errors.ts';
import {
  RESERVATION_STATUSES,
  WORKFLOW_STEPS,
  type ReservationSnapshot,
  type ResultEventDecision
} from './types.ts';

export interface ReleaseDecision {
  reservation: ReservationSnapshot | null;
  resultEvent: ResultEventDecision;
  restoreStock: boolean;
}

function requireNonEmptyString(fieldName: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidInventoryCommandError(`${fieldName} is required`);
  }

  return value.trim();
}

export function parseReleaseCommandPayload(payload: unknown): InventoryReleaseRequestedPayloadV1 {
  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidInventoryCommandError('release payload must be an object');
  }

  const record = payload as Record<string, unknown>;

  return {
    orderId: requireNonEmptyString('orderId', record.orderId),
    reservationId: requireNonEmptyString('reservationId', record.reservationId)
  };
}

function releaseNotFound(command: InventoryReleaseRequestedPayloadV1): ReleaseDecision {
  return {
    reservation: null,
    restoreStock: false,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RELEASE_FAILED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RELEASE_FAILED,
      payload: {
        orderId: command.orderId,
        reservationId: command.reservationId,
        reason: 'reservation not found'
      }
    }
  };
}

function replayReleased(existing: ReservationSnapshot): ReleaseDecision {
  return {
    reservation: existing,
    restoreStock: false,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RELEASED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RELEASED,
      payload: {
        orderId: existing.orderId,
        reservationId: existing.id,
        releasedAt: existing.releasedAt ?? new Date().toISOString()
      }
    }
  };
}

function rejectIllegalReleaseStatus(existing: ReservationSnapshot): ReleaseDecision {
  const reason = `cannot release inventory in status ${existing.status}`;

  return {
    reservation: {
      ...existing,
      status: RESERVATION_STATUSES.RELEASE_FAILED,
      failureReason: reason
    },
    restoreStock: false,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RELEASE_FAILED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RELEASE_FAILED,
      payload: {
        orderId: existing.orderId,
        reservationId: existing.id,
        reason
      }
    }
  };
}

export function decideRelease(input: {
  command: InventoryReleaseRequestedPayloadV1;
  existing: ReservationSnapshot | null;
}): ReleaseDecision {
  if (!input.existing) {
    return releaseNotFound(input.command);
  }

  if (input.existing.status === RESERVATION_STATUSES.RELEASED) {
    return replayReleased(input.existing);
  }

  if (input.existing.status !== RESERVATION_STATUSES.RESERVED) {
    return rejectIllegalReleaseStatus(input.existing);
  }

  const releasedAt = new Date().toISOString();

  return {
    reservation: {
      ...input.existing,
      status: RESERVATION_STATUSES.RELEASED,
      failureReason: null,
      releasedAt
    },
    restoreStock: true,
    resultEvent: {
      type: MESSAGE_TYPES.INVENTORY_RELEASED,
      workflowStep: WORKFLOW_STEPS.INVENTORY_RELEASED,
      payload: {
        orderId: input.existing.orderId,
        reservationId: input.existing.id,
        releasedAt
      }
    }
  };
}
