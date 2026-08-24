import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  createEventEnvelope,
  createFollowUpEnvelope,
  type MessageEnvelope
} from '@services-sandbox/contracts';

import { TransientProcessingError } from './errors.ts';
import type { DeadLetterEventsTable, OutboxEventsTable } from './schema.ts';

export interface RecordDeadLetterEventInput {
  db: NodePgDatabase;
  deadLetterEvents: DeadLetterEventsTable;
  outboxEvents: OutboxEventsTable;
  originalTopic: string;
  rawValue: unknown;
  parentEnvelope: MessageEnvelope | null;
  reason: string;
  attempts: number;
  deadLetterType: string;
  source: string;
  deadLetterTopic: string;
  extraPayload?: Record<string, unknown>;
  workflowStep?: string;
}

function wrapTransient(error: unknown): never {
  const message = error instanceof Error ? error.message : 'processing failed';
  throw new TransientProcessingError(message, { cause: error });
}

function extractOrderId(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const orderId = (payload as { orderId?: unknown }).orderId;
  if (typeof orderId === 'string' && orderId.trim() !== '') {
    return orderId;
  }

  return null;
}

function extractCorrelationId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const correlationId = (value as { correlationId?: unknown }).correlationId;
  if (typeof correlationId === 'string' && correlationId.trim() !== '') {
    return correlationId;
  }

  return null;
}

export async function recordDeadLetterEvent(input: RecordDeadLetterEventInput): Promise<{
  status: 'processed' | 'duplicate';
  workflowStep?: string;
  messageType?: string;
}> {
  const failedAt = new Date().toISOString();
  const originalMessageId =
    input.parentEnvelope?.messageId ??
    (typeof input.rawValue === 'object' &&
    input.rawValue !== null &&
    'messageId' in input.rawValue &&
    typeof (input.rawValue as { messageId?: unknown }).messageId === 'string'
      ? (input.rawValue as { messageId: string }).messageId
      : `unparseable-${failedAt}`);

  const orderId = extractOrderId(input.parentEnvelope?.payload ?? input.rawValue);
  const correlationId = extractCorrelationId(input.rawValue);
  const deadLetterPayload = {
    originalTopic: input.originalTopic,
    originalEnvelope: input.parentEnvelope ?? input.rawValue,
    reason: input.reason,
    attempts: input.attempts,
    failedAt,
    ...(orderId ? { orderId } : {}),
    ...input.extraPayload
  };

  const deadLetterEnvelope = input.parentEnvelope
    ? createFollowUpEnvelope(input.parentEnvelope, {
        type: input.deadLetterType,
        source: input.source,
        payload: deadLetterPayload
      })
    : createEventEnvelope({
        type: input.deadLetterType,
        source: input.source,
        correlationId: correlationId ?? 'unknown',
        payload: deadLetterPayload
      });

  const partitionKey = orderId ?? deadLetterEnvelope.messageId;

  try {
    return await input.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ messageId: input.deadLetterEvents.messageId })
        .from(input.deadLetterEvents)
        .where(eq(input.deadLetterEvents.messageId, originalMessageId))
        .limit(1);

      if (existing) {
        return { status: 'duplicate' as const };
      }

      await tx.insert(input.deadLetterEvents).values({
        messageId: originalMessageId,
        originalTopic: input.originalTopic,
        envelope: input.parentEnvelope ?? input.rawValue,
        reason: input.reason,
        attempts: input.attempts,
        failedAt
      });

      await tx.insert(input.outboxEvents).values({
        messageId: deadLetterEnvelope.messageId,
        topic: input.deadLetterTopic,
        partitionKey,
        envelope: deadLetterEnvelope
      });

      return {
        status: 'processed' as const,
        workflowStep: input.workflowStep,
        messageType: input.deadLetterType
      };
    });
  } catch (error) {
    wrapTransient(error);
  }
}
