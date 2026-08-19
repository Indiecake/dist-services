export const PAYMENT_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  CHARGED: 'CHARGED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  REFUND_FAILED: 'REFUND_FAILED'
} as const);

export type PaymentStatus = (typeof PAYMENT_STATUSES)[keyof typeof PAYMENT_STATUSES];

export const ATTEMPT_TYPES = Object.freeze({
  CHARGE: 'CHARGE',
  REFUND: 'REFUND'
} as const);

export type AttemptType = (typeof ATTEMPT_TYPES)[keyof typeof ATTEMPT_TYPES];

export const ATTEMPT_STATUSES = Object.freeze({
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED'
} as const);

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[keyof typeof ATTEMPT_STATUSES];

export const SERVICE_NAME = 'payment-service';

export const SUPPORTED_MESSAGE_VERSION = 1;

export const WORKFLOW_STEPS = Object.freeze({
  PAYMENT_PROCESSING: 'payment_processing',
  PAYMENT_CHARGED: 'payment_charged',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYMENT_REFUND_FAILED: 'payment_refund_failed',
  PAYMENT_DEADLETTERED: 'payment_deadlettered'
} as const);

export interface PaymentSnapshot {
  id: string;
  orderId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  providerReference: string | null;
  failureReason: string | null;
  chargedAt: string | null;
  refundedAt: string | null;
}

export interface PaymentAttemptDecision {
  attemptType: AttemptType;
  status: AttemptStatus;
  providerReference: string | null;
  reason: string | null;
}

export interface ResultEventDecision {
  type: string;
  payload: Record<string, unknown>;
  workflowStep: string;
}
