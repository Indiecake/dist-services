import type { PaymentRefundRequestedPayloadV1 } from '@services-sandbox/contracts/messages/order-service-workflow';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import { InvalidPaymentCommandError, TransientProcessingError } from './errors.ts';
import type { RefundProcessorResult } from './processor.ts';
import {
  ATTEMPT_STATUSES,
  ATTEMPT_TYPES,
  PAYMENT_STATUSES,
  WORKFLOW_STEPS,
  type PaymentAttemptDecision,
  type PaymentSnapshot,
  type ResultEventDecision
} from './types.ts';

export interface RefundDecision {
  payment: PaymentSnapshot | null;
  attempt: PaymentAttemptDecision | null;
  resultEvent: ResultEventDecision;
}

export type RefundPlan =
  | { kind: 'skip_processor'; decision: RefundDecision }
  | { kind: 'call_processor' };

function requireNonEmptyString(fieldName: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new InvalidPaymentCommandError(`${fieldName} is required`);
  }

  return value.trim();
}

export function parseRefundCommandPayload(payload: unknown): PaymentRefundRequestedPayloadV1 {
  if (typeof payload !== 'object' || payload === null) {
    throw new InvalidPaymentCommandError('refund payload must be an object');
  }

  const record = payload as Record<string, unknown>;

  return {
    orderId: requireNonEmptyString('orderId', record.orderId),
    paymentId: requireNonEmptyString('paymentId', record.paymentId)
  };
}

function refundNotFound(command: PaymentRefundRequestedPayloadV1): RefundDecision {
  return {
    payment: null,
    attempt: null,
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_REFUND_FAILED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_REFUND_FAILED,
      payload: {
        orderId: command.orderId,
        paymentId: command.paymentId,
        reason: 'payment not found'
      }
    }
  };
}

function replayRefunded(existing: PaymentSnapshot): RefundDecision {
  return {
    payment: existing,
    attempt: null,
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_REFUNDED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_REFUNDED,
      payload: {
        orderId: existing.orderId,
        paymentId: existing.id,
        providerReference: existing.providerReference ?? `re_${existing.id}`,
        refundedAt: existing.refundedAt ?? new Date().toISOString()
      }
    }
  };
}

function rejectIllegalRefundStatus(existing: PaymentSnapshot): RefundDecision {
  const reason = `cannot refund payment in status ${existing.status}`;

  return {
    payment: {
      ...existing,
      status: PAYMENT_STATUSES.REFUND_FAILED,
      failureReason: reason
    },
    attempt: {
      attemptType: ATTEMPT_TYPES.REFUND,
      status: ATTEMPT_STATUSES.FAILED,
      providerReference: null,
      reason
    },
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_REFUND_FAILED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_REFUND_FAILED,
      payload: {
        orderId: existing.orderId,
        paymentId: existing.id,
        reason
      }
    }
  };
}

export function planRefund(
  command: PaymentRefundRequestedPayloadV1,
  existing: PaymentSnapshot | null
): RefundPlan {
  if (!existing) {
    return { kind: 'skip_processor', decision: refundNotFound(command) };
  }

  if (existing.status === PAYMENT_STATUSES.REFUNDED) {
    return { kind: 'skip_processor', decision: replayRefunded(existing) };
  }

  if (existing.status !== PAYMENT_STATUSES.CHARGED) {
    return { kind: 'skip_processor', decision: rejectIllegalRefundStatus(existing) };
  }

  return { kind: 'call_processor' };
}

function decisionFromRefundResult(
  existing: PaymentSnapshot,
  result: RefundProcessorResult
): RefundDecision {
  if (!result.ok) {
    return {
      payment: {
        ...existing,
        status: PAYMENT_STATUSES.REFUND_FAILED,
        failureReason: result.reason
      },
      attempt: {
        attemptType: ATTEMPT_TYPES.REFUND,
        status: ATTEMPT_STATUSES.FAILED,
        providerReference: null,
        reason: result.reason
      },
      resultEvent: {
        type: MESSAGE_TYPES.PAYMENT_REFUND_FAILED,
        workflowStep: WORKFLOW_STEPS.PAYMENT_REFUND_FAILED,
        payload: {
          orderId: existing.orderId,
          paymentId: existing.id,
          reason: result.reason
        }
      }
    };
  }

  return {
    payment: {
      ...existing,
      status: PAYMENT_STATUSES.REFUNDED,
      providerReference: result.providerReference,
      failureReason: null,
      refundedAt: result.refundedAt
    },
    attempt: {
      attemptType: ATTEMPT_TYPES.REFUND,
      status: ATTEMPT_STATUSES.SUCCEEDED,
      providerReference: result.providerReference,
      reason: null
    },
    resultEvent: {
      type: MESSAGE_TYPES.PAYMENT_REFUNDED,
      workflowStep: WORKFLOW_STEPS.PAYMENT_REFUNDED,
      payload: {
        orderId: existing.orderId,
        paymentId: existing.id,
        providerReference: result.providerReference,
        refundedAt: result.refundedAt
      }
    }
  };
}

export function decideRefund(input: {
  command: PaymentRefundRequestedPayloadV1;
  existing: PaymentSnapshot | null;
  processorResult: RefundProcessorResult | null;
}): RefundDecision {
  const plan = planRefund(input.command, input.existing);
  if (plan.kind === 'skip_processor') {
    return plan.decision;
  }

  if (!input.existing || !input.processorResult) {
    throw new TransientProcessingError('missing refund processor result');
  }

  return decisionFromRefundResult(input.existing, input.processorResult);
}
