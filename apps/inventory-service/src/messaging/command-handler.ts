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

import type { InventoryRepository } from '../db/inventory-repository.ts';
import { SERVICE_NAME, SUPPORTED_MESSAGE_VERSION, WORKFLOW_STEPS } from '../domain/types.ts';

export type InventoryLogger = ParticipantLogger;
export type { HandleStatus };

export interface CommandHandlerDependencies {
  repository: InventoryRepository;
  logger: InventoryLogger;
  retryDelaysMs?: readonly number[];
}

export async function handleInventoryCommand(
  deps: CommandHandlerDependencies,
  input: { rawValue: unknown; originalTopic?: string }
): Promise<HandleStatus> {
  const originalTopic = input.originalTopic ?? COMMAND_TOPICS.inventory;

  return handleCommandMessage({
    rawValue: input.rawValue,
    originalTopic,
    supportedVersion: SUPPORTED_MESSAGE_VERSION,
    retryDelaysMs: deps.retryDelaysMs,
    logger: deps.logger,
    onReceived: (envelope) => {
      deps.logger.info('Inventory command received', {
        workflowStep: WORKFLOW_STEPS.INVENTORY_PROCESSING,
        serviceName: SERVICE_NAME,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        type: envelope.type,
        orderId: (envelope.payload as { orderId?: string }).orderId,
        reservationId: (envelope.payload as { reservationId?: string }).reservationId
      });
    },
    dispatch: async (envelope: MessageEnvelope) => {
      if (envelope.type === MESSAGE_TYPES.INVENTORY_RESERVE_REQUESTED) {
        return deps.repository.processReserve(envelope);
      }

      if (envelope.type === MESSAGE_TYPES.INVENTORY_RELEASE_REQUESTED) {
        return deps.repository.processRelease(envelope);
      }

      throw new PermanentMessageError(`unknown message type: ${envelope.type}`);
    },
    onProcessed: (envelope, result) => {
      deps.logger.info('Inventory command processed', {
        workflowStep: result.workflowStep,
        serviceName: SERVICE_NAME,
        messageId: envelope.messageId,
        correlationId: envelope.correlationId,
        type: result.messageType,
        orderId: result.orderId,
        reservationId: result.reservationId
      });
    },
    onDeadLetter: (_error, parsedEnvelope, attempts) => {
      const reason =
        _error instanceof Error ? _error.message : 'unhandled inventory command failure';
      deps.logger.error('Inventory command dead-lettered', {
        workflowStep: WORKFLOW_STEPS.INVENTORY_DEADLETTERED,
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
