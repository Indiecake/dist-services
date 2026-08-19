export interface ChargeRequest {
  orderId: string;
  paymentId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
}

export interface RefundRequest {
  orderId: string;
  paymentId: string;
  idempotencyKey: string;
}

export type ChargeProcessorResult =
  | { ok: true; providerReference: string; chargedAt: string }
  | { ok: false; reason: string };

export type RefundProcessorResult =
  | { ok: true; providerReference: string; refundedAt: string }
  | { ok: false; reason: string };

export interface PaymentProcessor {
  charge(request: ChargeRequest): ChargeProcessorResult | Promise<ChargeProcessorResult>;
  refund(request: RefundRequest): RefundProcessorResult | Promise<RefundProcessorResult>;
}

export function chargeIdempotencyKey(paymentId: string): string {
  return `charge:${paymentId}`;
}

export function refundIdempotencyKey(paymentId: string): string {
  return `refund:${paymentId}`;
}

export function createSimulatedPaymentProcessor(): PaymentProcessor {
  return {
    charge(request) {
      if (request.amountCents < 1) {
        return { ok: false, reason: 'amountCents must be greater than 0' };
      }

      return {
        ok: true,
        providerReference: `ch_${request.paymentId}`,
        chargedAt: new Date().toISOString()
      };
    },
    refund(request) {
      return {
        ok: true,
        providerReference: `re_${request.paymentId}`,
        refundedAt: new Date().toISOString()
      };
    }
  };
}
