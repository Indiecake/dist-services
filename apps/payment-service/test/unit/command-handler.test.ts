import { createCommandEnvelope } from '@services-sandbox/contracts';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import type { PaymentsRepository } from '../../src/db/payments-repository.ts';
import { TransientProcessingError } from '../../src/domain/errors.ts';
import { createSimulatedPaymentProcessor } from '../../src/domain/processor.ts';
import { handlePaymentCommand, type PaymentLogger } from '../../src/messaging/command-handler.ts';

function silentLogger(): PaymentLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  };
}

describe('handlePaymentCommand', () => {
  const chargeEnvelope = createCommandEnvelope({
    type: MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED,
    source: 'test',
    correlationId: 'corr-1',
    payload: {
      orderId: 'order-1',
      paymentId: 'pay-1',
      amountCents: 1000,
      currency: 'USD'
    }
  });

  it('routes a charge command to the repository', async () => {
    const calls: unknown[] = [];
    const deadLetters: unknown[] = [];
    const repository = {
      processCharge: async (envelope: unknown) => {
        calls.push(envelope);
        return {
          status: 'processed' as const,
          workflowStep: 'payment_charged',
          orderId: 'order-1',
          paymentId: 'pay-1',
          messageType: MESSAGE_TYPES.PAYMENT_CHARGED
        };
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handlePaymentCommand(
      {
        repository: repository as unknown as PaymentsRepository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger()
      },
      { rawValue: chargeEnvelope }
    );

    expect(status).toBe('processed');
    expect(calls).toHaveLength(1);
    expect(deadLetters).toHaveLength(0);
  });

  it('treats duplicate inbox hits as a no-op', async () => {
    const deadLetters: unknown[] = [];
    const repository = {
      processCharge: async () => ({ status: 'duplicate' as const }),
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handlePaymentCommand(
      {
        repository: repository as unknown as PaymentsRepository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger()
      },
      { rawValue: chargeEnvelope }
    );

    expect(status).toBe('duplicate');
    expect(deadLetters).toHaveLength(0);
  });

  it('dead-letters an unknown message type', async () => {
    const deadLetters: unknown[] = [];
    const repository = {
      processCharge: async () => {
        throw new Error('should not charge');
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const envelope = createCommandEnvelope({
      type: 'payment.unknown',
      source: 'test',
      correlationId: 'corr-2',
      payload: { orderId: 'order-1' }
    });

    const status = await handlePaymentCommand(
      {
        repository: repository as unknown as PaymentsRepository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger()
      },
      { rawValue: envelope }
    );

    expect(status).toBe('dead_lettered');
    expect(deadLetters).toHaveLength(1);
  });

  it('retries transient errors then dead-letters', async () => {
    let chargeCalls = 0;
    const deadLetters: unknown[] = [];
    const repository = {
      processCharge: async () => {
        chargeCalls += 1;
        throw new TransientProcessingError('db down');
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handlePaymentCommand(
      {
        repository: repository as unknown as PaymentsRepository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger(),
        retryDelaysMs: [0, 0]
      },
      { rawValue: chargeEnvelope }
    );

    expect(status).toBe('dead_lettered');
    expect(chargeCalls).toBe(3);
    expect(deadLetters).toHaveLength(1);
  });

  it('dead-letters a malformed envelope', async () => {
    let chargeCalls = 0;
    const deadLetters: unknown[] = [];
    const repository = {
      processCharge: async () => {
        chargeCalls += 1;
        return { status: 'processed' as const };
      },
      recordDeadLetter: async (input: unknown) => {
        deadLetters.push(input);
        return { status: 'processed' as const };
      }
    };

    const status = await handlePaymentCommand(
      {
        repository: repository as unknown as PaymentsRepository,
        processor: createSimulatedPaymentProcessor(),
        logger: silentLogger()
      },
      { rawValue: { not: 'an envelope' } }
    );

    expect(status).toBe('dead_lettered');
    expect(chargeCalls).toBe(0);
    expect(deadLetters).toHaveLength(1);
  });
});
