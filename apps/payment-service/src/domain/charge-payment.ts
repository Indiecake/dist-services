import type { PaymentChargeRequestedPayloadV1 } from '@services-sandbox/contracts/messages/order-service-workflow';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { InvalidPaymentCommandError, TransientProcessingError } from './errors.ts';
import type { ChargeProcessorResult } from './processor.ts';
import {
  ATTEMPT_STATUSES,
  ATTEMPT_TYPES,
  PAYMENT_STATUSES,
  WORKFLOW_STEPS,
  type PaymentAttemptDecision,
  type PaymentSnapshot,
  type ResultEventDecision
} from './types.ts';

export interface ChargeDecision {
  payment: PaymentSnapshot;
  attempt: PaymentAttemptDecision | null;
  resultEvent: ResultEventDecision;
}

export type ChargePlan =
  | { kind: 'skip_processor'; decision: ChargeDecision }
  | { kind: 'call_processor' };

function requireNonEmptyString(fieldName: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidPaymentCommandError(`${fieldName} is required`);
  }

  return value.trim();
}

function requireInteger(fieldName: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new InvalidPaymentCommandError(`${fieldName} must be an integer`);
  }

  return value;
}

export function parseChargeCommandPayload(payload: unknown): PaymentChargeRequestedPayloadV1 {
  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidPaymentCommandError('charge payload must be an object');
  }

  const record = payload as Record<string, unknown>;

  return {
    orderId: requireNonEmptyString('orderId', record.orderId),
    paymentId: requireNonEmptyString('paymentId', record.paymentId),
    amountCents: requireInteger('amountCents', record.amountCents),
    currency: requireNonEmptyString('currency', record.currency)
  };
}

export function createPendingChargePayment(
  command: PaymentChargeRequestedPayloadV1
): PaymentSnapshot {
  return {
    id: command.paymentId,
    orderId: command.orderId,
    amountCents: command.amountCents,
    currency: command.currency,
    status: PAYMENT_STATUSES.PENDING,
    providerReference: null,
    failureReason: null,
    chargedAt: null,
    refundedAt: null
  };
}

function replayCharged(existing: PaymentSnapshot): ChargeDecision {
  return {
    payment: existing,
    attempt: null,
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_CHARGED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_CHARGED,
      payload: {
        orderId: existing.orderId,
        paymentId: existing.id,
        providerReference: existing.providerReference ?? `ch_${existing.id}`,
        chargedAt: existing.chargedAt ?? new Date().toISOString()
      }
    }
  };
}

function rejectIllegalChargeStatus(existing: PaymentSnapshot): ChargeDecision {
  const reason = `cannot charge payment in status ${existing.status}`;

  return {
    payment: {
      ...existing,
      failureReason: reason
    },
    attempt: {
      attemptType: ATTEMPT_TYPES.CHARGE,
      status: ATTEMPT_STATUSES.FAILED,
      providerReference: null,
      reason
    },
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_FAILED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_FAILED,
      payload: {
        orderId: existing.orderId,
        paymentId: existing.id,
        reason
      }
    }
  };
}

export function planCharge(
  _command: PaymentChargeRequestedPayloadV1,
  existing: PaymentSnapshot | null
): ChargePlan {
  if (existing?.status === PAYMENT_STATUSES.CHARGED) {
    return { kind: 'skip_processor', decision: replayCharged(existing) };
  }

  if (
    existing &&
    existing.status !== PAYMENT_STATUSES.PENDING &&
    existing.status !== PAYMENT_STATUSES.FAILED
  ) {
    return { kind: 'skip_processor', decision: rejectIllegalChargeStatus(existing) };
  }

  return { kind: 'call_processor' };
}

function decisionFromChargeResult(
  command: PaymentChargeRequestedPayloadV1,
  existing: PaymentSnapshot | null,
  result: ChargeProcessorResult
): ChargeDecision {
  if (!result.ok) {
    return {
      payment: {
        id: command.paymentId,
        orderId: command.orderId,
        amountCents: command.amountCents,
        currency: command.currency,
        status: PAYMENT_STATUSES.FAILED,
        providerReference: null,
        failureReason: result.reason,
        chargedAt: null,
        refundedAt: existing?.refundedAt ?? null
      },
      attempt: {
        attemptType: ATTEMPT_TYPES.CHARGE,
        status: ATTEMPT_STATUSES.FAILED,
        providerReference: null,
        reason: result.reason
      },
      resultEvent: {
        type: MESSAGE_TYPES.PAYMENT_FAILED,
        workflowStep: WORKFLOW_STEPS.PAYMENT_FAILED,
        payload: {
          orderId: command.orderId,
          paymentId: command.paymentId,
          reason: result.reason
        }
      }
    };
  }

  return {
    payment: {
      id: command.paymentId,
      orderId: command.orderId,
      amountCents: command.amountCents,
      currency: command.currency,
      status: PAYMENT_STATUSES.CHARGED,
      providerReference: result.providerReference,
      failureReason: null,
      chargedAt: result.chargedAt,
      refundedAt: existing?.refundedAt ?? null
    },
    attempt: {
      attemptType: ATTEMPT_TYPES.CHARGE,
      status: ATTEMPT_STATUSES.SUCCEEDED,
      providerReference: result.providerReference,
      reason: null
    },
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_CHARGED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_CHARGED,
      payload: {
        orderId: command.orderId,
        paymentId: command.paymentId,
        providerReference: result.providerReference,
        chargedAt: result.chargedAt
      }
    }
  };
}

export function decideCharge(input: {
  command: PaymentChargeRequestedPayloadV1;
  existing: PaymentSnapshot | null;
  processorResult: ChargeProcessorResult | null;
}): ChargeDecision {
  const plan = planCharge(input.command, input.existing);
  if (plan.kind === 'skip_processor') {
    return plan.decision;
  }

  if (!input.processorResult) {
    throw new TransientProcessingError('missing charge processor result');
  }

  return decisionFromChargeResult(input.command, input.existing, input.processorResult);
}
