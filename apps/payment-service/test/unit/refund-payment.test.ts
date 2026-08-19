import { createSimulatedPaymentProcessor } from '../../src/domain/processor.ts';
import {
  decideRefund,
  parseRefundCommandPayload,
  planRefund
} from '../../src/domain/refund-payment.ts';
import { PAYMENT_STATUSES } from '../../src/domain/types.ts';
import { InvalidPaymentCommandError, TransientProcessingError } from '../../src/domain/errors.ts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

const chargedPayment = {
  id: 'pay-1',
  orderId: 'order-1',
  amountCents: 2599,
  currency: 'USD',
  status: PAYMENT_STATUSES.CHARGED,
  providerReference: 'ch_pay-1',
  failureReason: null,
  chargedAt: '2026-08-18T00:00:00.000Z',
  refundedAt: null
};

describe('parseRefundCommandPayload', () => {
  it('rejects a missing paymentId', () => {
    expect(() => parseRefundCommandPayload({ orderId: 'order-1' })).toThrow(InvalidPaymentCommandError);
  });
});

describe('planRefund', () => {
  it('calls the processor for a charged payment', () => {
    expect(planRefund({ orderId: 'order-1', paymentId: 'pay-1' }, chargedPayment).kind).toBe(
      'call_processor'
    );
  });

  it('skips the processor when the payment is missing', () => {
    const plan = planRefund({ orderId: 'order-1', paymentId: 'pay-missing' }, null);
    expect(plan.kind).toBe('skip_processor');
  });
});

describe('decideRefund', () => {
  it('refunds a charged payment from a processor result', async () => {
    const processorResult = await Promise.resolve(
      createSimulatedPaymentProcessor().refund({
        orderId: 'order-1',
        paymentId: 'pay-1',
        idempotencyKey: 'refund:pay-1'
      })
    );

    const decision = decideRefund({
      command: { orderId: 'order-1', paymentId: 'pay-1' },
      existing: chargedPayment,
      processorResult
    });

    expect(decision.payment?.status).toBe(PAYMENT_STATUSES.REFUNDED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_REFUNDED);
  });

  it('fails when the payment is not charged', () => {
    const decision = decideRefund({
      command: { orderId: 'order-1', paymentId: 'pay-1' },
      existing: { ...chargedPayment, status: PAYMENT_STATUSES.FAILED },
      processorResult: null
    });

    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_REFUND_FAILED);
    expect(decision.resultEvent.payload.reason).toBe('cannot refund payment in status FAILED');
  });

  it('fails when the payment does not exist', () => {
    const decision = decideRefund({
      command: { orderId: 'order-1', paymentId: 'pay-missing' },
      existing: null,
      processorResult: null
    });

    expect(decision.payment).toBeNull();
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_REFUND_FAILED);
  });

  it('throws when a processor result is required but missing', () => {
    expect(() =>
      decideRefund({
        command: { orderId: 'order-1', paymentId: 'pay-1' },
        existing: chargedPayment,
        processorResult: null
      })
    ).toThrow(TransientProcessingError);
  });
});
