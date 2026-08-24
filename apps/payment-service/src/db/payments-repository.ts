import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { createFollowUpEnvelope, type MessageEnvelope } from '@services-sandbox/contracts';
import { EVENT_TOPICS, DEADLETTER_TOPICS } from '@services-sandbox/kafka';
import {
  MESSAGE_TYPES,
  type PaymentChargeRequestedPayloadV1,
  type PaymentRefundRequestedPayloadV1
} from '@services-sandbox/contracts/messages/order-service-workflow';
import {
  claimInboxEvent,
  createOutboxStore,
  recordDeadLetterEvent,
  type ClaimUnpublishedOutboxInput,
  type CommandDispatchResult,
  type DeadLetterInput,
  type OutboxClaimOwner,
  type OutboxRecord,
  type OutboxStore
} from '@services-sandbox/kafka/runtime';

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

export interface ProcessResult extends CommandDispatchResult {
  orderId?: string;
  paymentId?: string;
}

export {
  DEFAULT_OUTBOX_CLAIM_LIMIT,
  DEFAULT_OUTBOX_LEASE_MS,
  type ClaimUnpublishedOutboxInput,
  type DeadLetterInput,
  type OutboxClaimOwner,
  type OutboxRecord
} from '@services-sandbox/kafka/runtime';

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

function extractPaymentId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const paymentId = (payload as { paymentId?: unknown }).paymentId;
  if (typeof paymentId === 'string' && paymentId.trim() !== '') {
    return paymentId;
  }

  return undefined;
}

export class PaymentsRepository implements OutboxStore {
  private readonly db: NodePgDatabase;
  private readonly outbox: ReturnType<typeof createOutboxStore>;

  constructor(db: NodePgDatabase) {
    this.db = db;
    this.outbox = createOutboxStore({ db, outboxEvents });
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
    const paymentId = extractPaymentId(input.parentEnvelope?.payload ?? input.rawValue);

    return recordDeadLetterEvent({
      db: this.db,
      deadLetterEvents,
      outboxEvents,
      originalTopic: input.originalTopic,
      rawValue: input.rawValue,
      parentEnvelope: input.parentEnvelope,
      reason: input.reason,
      attempts: input.attempts,
      deadLetterType: MESSAGE_TYPES.PAYMENT_DEADLETTERED,
      source: SERVICE_NAME,
      deadLetterTopic: DEADLETTER_TOPICS.payments,
      extraPayload: paymentId ? { paymentId } : undefined,
      workflowStep: 'payment_deadlettered'
    });
  }

  listUnpublishedOutbox(limit?: number): Promise<OutboxRecord[]> {
    return this.outbox.listUnpublishedOutbox(limit);
  }

  claimUnpublishedOutbox(input: ClaimUnpublishedOutboxInput): Promise<OutboxRecord[]> {
    return this.outbox.claimUnpublishedOutbox(input);
  }

  markOutboxPublished(input: OutboxClaimOwner): Promise<void> {
    return this.outbox.markOutboxPublished(input);
  }

  releaseOutboxClaim(input: OutboxClaimOwner): Promise<void> {
    return this.outbox.releaseOutboxClaim(input);
  }

  releaseAllOutboxClaims(instanceId: string): Promise<void> {
    return this.outbox.releaseAllOutboxClaims(instanceId);
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
    return claimInboxEvent(tx, inboxEvents, envelope);
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
