import { COMMAND_TOPICS } from '@services-sandbox/kafka';
import {
  handleCommandMessage,
  PermanentMessageError,
  type DeadLetterInput,
  type HandleStatus,
  type ParticipantLogger
} from '@services-sandbox/kafka/runtime';
import { MESSAGE_TYPES } from '@services-sandbox/contracts/messages/order-service-workflow';
import type { MessageEnvelope } from '@services-sandbox/contracts';

import type { PaymentsRepository } from '../db/payments-repository.ts';
import type { PaymentProcessor } from '../domain/processor.ts';
import { SERVICE_NAME, SUPPORTED_MESSAGE_VERSION, WORKFLOW_STEPS } from '../domain/types.ts';

export type PaymentLogger = ParticipantLogger;
export type { HandleStatus };

export interface CommandHandlerDependencies {
  repository: PaymentsRepository;
  processor: PaymentProcessor;
  logger: PaymentLogger;
  retryDelaysMs?: readonly number[];
}

export async function handlePaymentCommand(
  deps: CommandHandlerDependencies,
  input: { rawValue: unknown; originalTopic?: string }
): Promise<HandleStatus> {
  const originalTopic = input.originalTopic ?? COMMAND_TOPICS.payments;

  return handleCommandMessage({
    rawValue: input.rawValue,
    originalTopic,
    supportedVersion: SUPPORTED_MESSAGE_VERSION,
    retryDelaysMs: deps.retryDelaysMs,
    logger: deps.logger,
    onReceived: (envelope) => {
      deps.logger.info('Payment command received', {
        workflowStep: WORKFLOW_STEPS.PAYMENT_PROCESSING,
        serviceName: SERVICE_NAME,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        type: envelope.type,
        orderId: (envelope.payload as { orderId?: string }).orderId,
        paymentId: (envelope.payload as { paymentId?: string }).paymentId
      });
    },
    dispatch: async (envelope: MessageEnvelope) => {
      if (envelope.type === MESSAGE_TYPES.PAYMENT_CHARGE_REQUESTED) {
        return deps.repository.processCharge(envelope, deps.processor);
      }

      if (envelope.type === MESSAGE_TYPES.PAYMENT_REFUND_REQUESTED) {
        return deps.repository.processRefund(envelope, deps.processor);
      }

      throw new PermanentMessageError(`unknown message type: ${envelope.type}`);
    },
    onProcessed: (envelope, result) => {
      deps.logger.info('Payment command processed', {
        workflowStep: result.workflowStep,
        serviceName: SERVICE_NAME,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        type: result.messageType,
        orderId: result.orderId,
        paymentId: result.paymentId
      });
    },
    onDeadLetter: (_error, parsedEnvelope, attempts) => {
      const reason =
        _error instanceof Error ? _error.message : 'unhandled payment command failure';
      deps.logger.error('Payment command dead-lettered', {
        workflowStep: WORKFLOW_STEPS.PAYMENT_DEADLETTERED,
        serviceName: SERVICE_NAME,
        reason,
        attempts,
        messageId: parsedEnvelope?.messageId,
        correlationId: parsedEnvelope?.correlationId,
        type: parsedEnvelope?.type
      });
    },
    recordDeadLetter: (deadLetter: DeadLetterInput) => deps.repository.recordDeadLetter(deadLetter)
  });
}
