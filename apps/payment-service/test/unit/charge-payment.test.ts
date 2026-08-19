import { createSimulatedPaymentProcessor } from '../../src/domain/processor.ts';
import {
  decideCharge,
  parseChargeCommandPayload,
  planCharge
} from '../../src/domain/charge-payment.ts';
import { PAYMENT_STATUSES } from '../../src/domain/types.ts';
import { InvalidPaymentCommandError, TransientProcessingError } from '../../src/domain/errors.ts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

describe('parseChargeCommandPayload', () => {
  it('accepts a valid charge payload', () => {
    expect(
      parseChargeCommandPayload({
        orderId: 'order-1',
        paymentId: 'pay-1',
        amountCents: 2599,
        currency: 'USD'
      })
    ).toEqual({
      orderId: 'order-1',
      paymentId: 'pay-1',
      amountCents: 2599,
      currency: 'USD'
    });
  });

  it('rejects missing orderId', () => {
    expect(() =>
      parseChargeCommandPayload({
        paymentId: 'pay-1',
        amountCents: 100,
        currency: 'USD'
      })
    ).toThrow(InvalidPaymentCommandError);
  });
});

describe('planCharge', () => {
  const command = {
    orderId: 'order-1',
    paymentId: 'pay-1',
    amountCents: 2599,
    currency: 'USD'
  };

  it('calls the processor for a new payment', () => {
    expect(planCharge(command, null).kind).toBe('call_processor');
  });

  it('replays a charged payment without calling the processor', () => {
    const plan = planCharge(command, {
      id: 'pay-1',
      orderId: 'order-1',
      amountCents: 2599,
      currency: 'USD',
      status: PAYMENT_STATUSES.CHARGED,
      providerReference: 'ch_pay-1',
      failureReason: null,
      chargedAt: '2026-08-18T00:00:00.000Z',
      refundedAt: null
    });

    expect(plan.kind).toBe('skip_processor');
    if (plan.kind === 'skip_processor') {
      expect(plan.decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_CHARGED);
      expect(plan.decision.attempt).toBeNull();
    }
  });
});

describe('decideCharge', () => {
  const command = {
    orderId: 'order-1',
    paymentId: 'pay-1',
    amountCents: 2599,
    currency: 'USD'
  };

  it('maps a successful processor result', async () => {
    const processorResult = await Promise.resolve(
      createSimulatedPaymentProcessor().charge({
        ...command,
        idempotencyKey: 'charge:pay-1'
      })
    );

    const decision = decideCharge({
      command,
      existing: null,
      processorResult
    });

    expect(decision.payment.status).toBe(PAYMENT_STATUSES.CHARGED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_CHARGED);
    expect(decision.attempt?.status).toBe('SUCCEEDED');
  });

  it('publishes payment.failed when the processor declines', () => {
    const decision = decideCharge({
      command,
      existing: null,
      processorResult: { ok: false, reason: 'insufficient_funds' }
    });

    expect(decision.payment.status).toBe(PAYMENT_STATUSES.FAILED);
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_FAILED);
    expect(decision.resultEvent.payload.reason).toBe('insufficient_funds');
  });

  it('replays a charged payment without using a processor result', () => {
    const decision = decideCharge({
      command,
      existing: {
        id: 'pay-1',
        orderId: 'order-1',
        amountCents: 2599,
        currency: 'USD',
        status: PAYMENT_STATUSES.CHARGED,
        providerReference: 'ch_pay-1',
        failureReason: null,
        chargedAt: '2026-08-18T00:00:00.000Z',
        refundedAt: null
      },
      processorResult: null
    });

    expect(decision.attempt).toBeNull();
    expect(decision.resultEvent.type).toBe(MESSAGE_TYPES.PAYMENT_CHARGED);
  });

  it('throws when a processor result is required but missing', () => {
    expect(() =>
      decideCharge({
        command,
        existing: null,
        processorResult: null
      })
    ).toThrow(TransientProcessingError);
  });
});
