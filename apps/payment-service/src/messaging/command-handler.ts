import {
  validateMessageEnvelope,
  type MessageEnvelope
} from '@services-sandbox/contracts';
import { COMMAND_TOPICS } from '@services-sandbox/kafka';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';

import type { PaymentsRepository } from '../db/payments-repository.ts';
import {
  PermanentMessageError,
  TransientProcessingError
} from '../domain/errors.ts';
import type { PaymentProcessor } from '../domain/processor.ts';
import { SERVICE_NAME, SUPPORTED_MESSAGE_VERSION, WORKFLOW_STEPS } from '../domain/types.ts';
import { DEFAULT_RETRY_DELAYS_MS, withBoundedBackoff } from './backoff.ts';

export interface PaymentLogger {
  info: (message: string, context?: Record<string, unknown>) => unknown;
  warn: (message: string, context?: Record<string, unknown>) => unknown;
  error: (message: string, context?: Record<string, unknown>) => unknown;
}

export type HandleStatus = 'processed' | 'duplicate' | 'dead_lettered';

export interface CommandHandlerDependencies {
  repository: PaymentsRepository;
  processor: PaymentProcessor;
  logger: PaymentLogger;
  retryDelaysMs?: readonly number[];
}

function isRetryable(error: unknown): boolean {
  return error instanceof TransientProcessingError;
}

function parseEnvelope(rawValue: unknown): MessageEnvelope {
  try {
    return validateMessageEnvelope(rawValue as MessageEnvelope);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invalid envelope';
    throw new PermanentMessageError(message);
  }
}

export async function handlePaymentCommand(
  deps: CommandHandlerDependencies,
  input: { rawValue: unknown; originalTopic?: string }
): Promise<HandleStatus> {
  const originalTopic = input.originalTopic ?? COMMAND_TOPICS.payments;
  const delays = deps.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  let parsedEnvelope: MessageEnvelope | null = null;

  try {
    const envelope = parseEnvelope(input.rawValue);
    parsedEnvelope = envelope;

    if (envelope.version !== SUPPORTED_MESSAGE_VERSION) {
      throw new PermanentMessageError(`unsupported version: ${envelope.version}`);
    }

    const result = await withBoundedBackoff(
      async () => {
        deps.logger.info('Payment command received', {
          workflowStep: WORKFLOW_STEPS.PAYMENT_PROCESSING,
          serviceName: SERVICE_NAME,
          messageId: envelope.messageId,
          correlationId: envelope.correlationId,
          type: envelope.type,
          orderId: (envelope.payload as { orderId?: string }).orderId,
          paymentId: (envelope.payload as { paymentId?: string }).paymentId
        });

        if (envelope.type === MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED) {
          return deps.repository.processCharge(envelope, deps.processor);
        }

        if (envelope.type === MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED) {
          return deps.repository.processRefund(envelope, deps.processor);
        }

        throw new PermanentMessageError(`unknown message type: ${envelope.type}`);
      },
      delays,
      isRetryable
    );

    if (result.status === 'processed') {
      deps.logger.info('Payment command processed', {
        workflowStep: result.workflowStep,
        serviceName: SERVICE_NAME,
        messageId: parsedEnvelope.messageId,
        correlationId: parsedEnvelope.correlationId,
        type: result.messageType,
        orderId: result.orderId,
        paymentId: result.paymentId
      });
    }

    return result.status;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'unhandled payment command failure';
    const attempts = delays.length + 1;

    deps.logger.error('Payment command dead-lettered', {
      workflowStep: WORKFLOW_STEPS.PAYMENT_DEADLETTERED,
      serviceName: SERVICE_NAME,
      reason,
      attempts,
      messageId: parsedEnvelope?.messageId,
      correlationId: parsedEnvelope?.correlationId,
      type: parsedEnvelope?.type
    });

    await deps.repository.recordDeadLetter({
      originalTopic,
      rawValue: input.rawValue,
      parentEnvelope: parsedEnvelope,
      reason,
      attempts
    });

    return 'dead_lettered';
  }
}
