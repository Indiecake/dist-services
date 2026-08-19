import { eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  createEventEnvelope,
  createFollowUpEnvelope,
  type MessageEnvelope
} from '@services-sandbox/contracts';
import { EVENT_TOPICS, DEADLETTER_TOPICS } from '@services-sandbox/kafka';
import {
  MESSAGE_TYPES,
  type PaymentChargeRequestedPayloadV1,
  type PaymentRefundRequestedPayloadV1
} from '@services-sandbox/contracts/messages/order-service-workflow';

import {
  createPendingChargePayment,
  decideCharge,
  parseChargeCommandPayload,
  planCharge
} from '../domain/charge-payment.ts';
import { InvalidPaymentCommandError, TransientProcessingError } from '../domain/errors.ts';
import { commitAfterProcessor } from '../domain/processor-commit.ts';
import {
  chargeIdempotencyKey,
  refundIdempotencyKey,
  type ChargeProcessorResult,
  type PaymentProcessor,
  type RefundProcessorResult
} from '../domain/processor.ts';
import {
  decideRefund,
  parseRefundCommandPayload,
  planRefund
} from '../domain/refund-payment.ts';
import { SERVICE_NAME, type PaymentSnapshot } from '../domain/types.ts';
import {
  deadLetterEvents,
  inboxEvents,
  outboxEvents,
  paymentAttempts,
  payments
} from './schema.ts';

export interface ProcessResult {
  status: 'processed' | 'duplicate';
  workflowStep?: string;
  orderId?: string;
  paymentId?: string;
  messageType?: string;
}

export interface OutboxRecord {
  id: string;
  topic: string;
  partitionKey: string;
  envelope: MessageEnvelope;
}

export interface DeadLetterInput {
  originalTopic: string;
  rawValue: unknown;
  parentEnvelope: MessageEnvelope | null;
  reason: string;
  attempts: number;
}

function wrapTransient(error: unknown): never {
  if (error instanceof InvalidPaymentCommandError) {
    throw error;
  }

  const message = error instanceof Error ? error.message : 'processing failed';
  throw new TransientProcessingError(message, { cause: error });
}

function toSnapshot(row: typeof payments.$inferSelect): PaymentSnapshot {
  return {
    id: row.id,
    orderId: row.orderId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: row.status as PaymentSnapshot['status'],
    providerReference: row.providerReference,
    failureReason: row.failureReason,
    chargedAt: row.chargedAt,
    refundedAt: row.refundedAt
  };
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

export class PaymentsRepository {
  private readonly db: NodePgDatabase;

  constructor(db: NodePgDatabase) {
    this.db = db;
  }

  async processCharge(
    envelope: MessageEnvelope,
    processor: PaymentProcessor
  ): Promise<ProcessResult> {
    const command = parseChargeCommandPayload(envelope.payload);
    const needsProcessor = await this.prepareCharge(command);

    return commitAfterProcessor({
      needsProcessor,
      runProcessor: async () => {
        try {
          return await processor.charge({
            orderId: command.orderId,
            paymentId: command.paymentId,
            amountCents: command.amountCents,
            currency: command.currency,
            idempotencyKey: chargeIdempotencyKey(command.paymentId)
          });
        } catch (error) {
          wrapTransient(error);
        }
      },
      commit: (processorResult) => this.commitCharge(envelope, command, processorResult)
    });
  }

  async processRefund(
    envelope: MessageEnvelope,
    processor: PaymentProcessor
  ): Promise<ProcessResult> {
    const command = parseRefundCommandPayload(envelope.payload);
    const needsProcessor = await this.prepareRefund(command);

    return commitAfterProcessor({
      needsProcessor,
      runProcessor: async () => {
        try {
          return await processor.refund({
            orderId: command.orderId,
            paymentId: command.paymentId,
            idempotencyKey: refundIdempotencyKey(command.paymentId)
          });
        } catch (error) {
          wrapTransient(error);
        }
      },
      commit: (processorResult) => this.commitRefund(envelope, command, processorResult)
    });
  }

  async recordDeadLetter(input: DeadLetterInput): Promise<ProcessResult> {
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
      ...(orderId ? { orderId } : {})
    };

    const deadLetterEnvelope = input.parentEnvelope
      ? createFollowUpEnvelope(input.parentEnvelope, {
          type: MESSAGE_TYPES.PAYMENT_DEADLETTERED,
          source: SERVICE_NAME,
          payload: deadLetterPayload
        })
      : createEventEnvelope({
          type: MESSAGE_TYPES.PAYMENT_DEADLETTERED,
          source: SERVICE_NAME,
          correlationId: correlationId ?? 'unknown',
          payload: deadLetterPayload
        });

    const partitionKey = orderId ?? deadLetterEnvelope.messageId;

    try {
      return await this.db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ messageId: deadLetterEvents.messageId })
          .from(deadLetterEvents)
          .where(eq(deadLetterEvents.messageId, originalMessageId))
          .limit(1);

        if (existing) {
          return { status: 'duplicate' as const };
        }

        await tx.insert(deadLetterEvents).values({
          messageId: originalMessageId,
          originalTopic: input.originalTopic,
          envelope: input.parentEnvelope ?? input.rawValue,
          reason: input.reason,
          attempts: input.attempts,
          failedAt
        });

        await tx.insert(outboxEvents).values({
          messageId: deadLetterEnvelope.messageId,
          topic: DEADLETTER_TOPICS.payments,
          partitionKey,
          envelope: deadLetterEnvelope
        });

        return {
          status: 'processed' as const,
          workflowStep: 'payment_deadlettered',
          messageType: MESSAGE_TYPES.PAYMENT_DEADLETTERED
        };
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  async listUnpublishedOutbox(limit = 50): Promise<OutboxRecord[]> {
    const rows = await this.db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .orderBy(outboxEvents.createdAt)
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      topic: row.topic,
      partitionKey: row.partitionKey,
      envelope: row.envelope
    }));
  }

  async markOutboxPublished(id: string): Promise<void> {
    await this.db
      .update(outboxEvents)
      .set({ publishedAt: new Date().toISOString() })
      .where(eq(outboxEvents.id, id));
  }

  private async prepareCharge(command: PaymentChargeRequestedPayloadV1): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.findPayment(tx, command.paymentId, command.orderId);
        const plan = planCharge(command, existing);

        if (plan.kind === 'call_processor' && !existing) {
          await this.upsertPayment(tx, createPendingChargePayment(command));
        }

        return plan.kind === 'call_processor';
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  private async prepareRefund(command: PaymentRefundRequestedPayloadV1): Promise<boolean> {
    try {
      return await this.db.transaction(async (tx) => {
        const existing = await this.findPayment(tx, command.paymentId, command.orderId);
        return planRefund(command, existing).kind === 'call_processor';
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  private async commitCharge(
    envelope: MessageEnvelope,
    command: PaymentChargeRequestedPayloadV1,
    processorResult: ChargeProcessorResult | null
  ): Promise<ProcessResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const duplicate = await this.claimInbox(tx, envelope);
        if (duplicate) {
          return { status: 'duplicate' as const };
        }

        const existing = await this.findPayment(tx, command.paymentId, command.orderId);
        const decision = decideCharge({ command, existing, processorResult });

        await this.upsertPayment(tx, decision.payment);

        if (decision.attempt) {
          await tx.insert(paymentAttempts).values({
            paymentId: decision.payment.id,
            attemptType: decision.attempt.attemptType,
            status: decision.attempt.status,
            providerReference: decision.attempt.providerReference,
            reason: decision.attempt.reason
          });
        }

        const resultEnvelope = createFollowUpEnvelope(envelope, {
          type: decision.resultEvent.type,
          source: SERVICE_NAME,
          payload: decision.resultEvent.payload
        });

        await tx.insert(outboxEvents).values({
          messageId: resultEnvelope.messageId,
          topic: EVENT_TOPICS.payments,
          partitionKey: decision.payment.orderId,
          envelope: resultEnvelope
        });

        return {
          status: 'processed' as const,
          workflowStep: decision.resultEvent.workflowStep,
          orderId: decision.payment.orderId,
          paymentId: decision.payment.id,
          messageType: decision.resultEvent.type
        };
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  private async commitRefund(
    envelope: MessageEnvelope,
    command: PaymentRefundRequestedPayloadV1,
    processorResult: RefundProcessorResult | null
  ): Promise<ProcessResult> {
    try {
      return await this.db.transaction(async (tx) => {
        const duplicate = await this.claimInbox(tx, envelope);
        if (duplicate) {
          return { status: 'duplicate' as const };
        }

        const existing = await this.findPayment(tx, command.paymentId, command.orderId);
        const decision = decideRefund({ command, existing, processorResult });

        if (decision.payment) {
          await this.upsertPayment(tx, decision.payment);
        }

        if (decision.attempt && decision.payment) {
          await tx.insert(paymentAttempts).values({
            paymentId: decision.payment.id,
            attemptType: decision.attempt.attemptType,
            status: decision.attempt.status,
            providerReference: decision.attempt.providerReference,
            reason: decision.attempt.reason
          });
        }

        const resultEnvelope = createFollowUpEnvelope(envelope, {
          type: decision.resultEvent.type,
          source: SERVICE_NAME,
          payload: decision.resultEvent.payload
        });

        await tx.insert(outboxEvents).values({
          messageId: resultEnvelope.messageId,
          topic: EVENT_TOPICS.payments,
          partitionKey: command.orderId,
          envelope: resultEnvelope
        });

        return {
          status: 'processed' as const,
          workflowStep: decision.resultEvent.workflowStep,
          orderId: command.orderId,
          paymentId: command.paymentId,
          messageType: decision.resultEvent.type
        };
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  private async claimInbox(
    tx: NodePgDatabase,
    envelope: MessageEnvelope
  ): Promise<boolean> {
    const [existing] = await tx
      .select({ messageId: inboxEvents.messageId })
      .from(inboxEvents)
      .where(eq(inboxEvents.messageId, envelope.messageId))
      .limit(1);

    if (existing) {
      return true;
    }

    await tx.insert(inboxEvents).values({
      messageId: envelope.messageId,
      messageType: envelope.type
    });

    return false;
  }

  private async findPayment(
    tx: NodePgDatabase,
    paymentId: string,
    orderId: string
  ): Promise<PaymentSnapshot | null> {
    const [byId] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId))
      .limit(1)
      .for('update');
    if (byId) {
      return toSnapshot(byId);
    }

    const [byOrder] = await tx
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1)
      .for('update');
    return byOrder ? toSnapshot(byOrder) : null;
  }

  private async upsertPayment(tx: NodePgDatabase, payment: PaymentSnapshot): Promise<void> {
    const [existing] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1);

    if (!existing) {
      await tx.insert(payments).values({
        id: payment.id,
        orderId: payment.orderId,
        amountCents: payment.amountCents,
        currency: payment.currency,
        status: payment.status,
        providerReference: payment.providerReference,
        failureReason: payment.failureReason,
        chargedAt: payment.chargedAt,
        refundedAt: payment.refundedAt
      });
      return;
    }

    await tx
      .update(payments)
      .set({
        status: payment.status,
        providerReference: payment.providerReference,
        failureReason: payment.failureReason,
        chargedAt: payment.chargedAt,
        refundedAt: payment.refundedAt,
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.id, payment.id));
  }
}
