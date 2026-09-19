import { and, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { createFollowUpEnvelope, type MessageEnvelope } from '@services-sandbox/contracts';
import { DEADLETTER_TOPICS, EVENT_TOPICS } from '@services-sandbox/kafka';
import {
  MESSAGE_TYPES,
  type InventoryReleaseRequestedPayloadV1
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

import { decideRelease, parseReleaseCommandPayload } from '../domain/release-inventory.ts';
import {
  decideReserve,
  parseReserveCommandPayload,
  planReserve,
  sortedLineItems
} from '../domain/reserve-inventory.ts';
import { InvalidInventoryCommandError, TransientProcessingError } from '../domain/errors.ts';
import {
  SERVICE_NAME,
  type LineItem,
  type ReservationSnapshot
} from '../domain/types.ts';
import {
  deadLetterEvents,
  inboxEvents,
  inventoryReservations,
  outboxEvents,
  products,
  reservationItems,
  stock
} from './schema.ts';
import { seedCatalogItems, type CatalogStockItem } from './seed-catalog.ts';

const LOCK_NOT_AVAILABLE_ERROR_CODE = '55P03';
const SEREALIZATION_FAILURE_ERROR_CODE = '40001';
const DEADLOCK_DECTED_ERROR_CODE = '40P01';

export interface ProcessResult extends CommandDispatchResult {
  orderId?: string;
  reservationId?: string;
}

export {
  DEFAULT_OUTBOX_CLAIM_LIMIT,
  DEFAULT_OUTBOX_LEASE_MS,
  type ClaimUnpublishedOutboxInput,
  type DeadLetterInput,
  type OutboxClaimOwner,
  type OutboxRecord
} from '@services-sandbox/kafka/runtime';

function postgresCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }

  if ('cause' in error) {
    return postgresCode((error as { cause?: unknown }).cause);
  }

  return undefined;
}

function isBusyStockError(error: unknown): boolean {
  const code = postgresCode(error);
  return code === LOCK_NOT_AVAILABLE_ERROR_CODE || code === SEREALIZATION_FAILURE_ERROR_CODE || code === DEADLOCK_DECTED_ERROR_CODE;
}

function wrapTransient(error: unknown): never {
  if (error instanceof InvalidInventoryCommandError || error instanceof TransientProcessingError) {
    throw error;
  }

  if (isBusyStockError(error)) {
    throw new TransientProcessingError('stock row busy', { cause: error });
  }

  const message = error instanceof Error ? error.message : 'processing failed';
  throw new TransientProcessingError(message, { cause: error });
}

function extractReservationId(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const reservationId = (payload as { reservationId?: unknown }).reservationId;
  if (typeof reservationId === 'string' && reservationId.trim() !== '') {
    return reservationId;
  }

  return undefined;
}

export class InventoryRepository implements OutboxStore {
  private readonly db: NodePgDatabase;
  private readonly outbox: ReturnType<typeof createOutboxStore>;

  constructor(db: NodePgDatabase) {
    this.db = db;
    this.outbox = createOutboxStore({ db, outboxEvents });
  }

  async processReserve(envelope: MessageEnvelope): Promise<ProcessResult> {
    const command = parseReserveCommandPayload(envelope.payload);

    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '0'`);

        const duplicate = await this.claimInbox(tx, envelope);
        if (duplicate) return { status: 'duplicate' as const };

        const existing = await this.findReservation(tx, command.reservationId, command.orderId);
        const plan = planReserve(command, existing);

        if (plan.kind === 'skip_stock') {
          return this.writeResult(tx, envelope, plan.decision.reservation, plan.decision.resultEvent);
        }

        await tx.execute(sql`SAVEPOINT stock_attempt`);
        const stockFailureReason = await this.tryReserveStock(tx, command.items);

        if (stockFailureReason) {
          await tx.execute(sql`ROLLBACK TO SAVEPOINT stock_attempt`);
        }

        const decision = decideReserve({
          command,
          existing,
          stockFailureReason
        });

        await this.upsertReservation(tx, decision.reservation);
        return this.writeResult(tx, envelope, decision.reservation, decision.resultEvent);
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  async processRelease(envelope: MessageEnvelope): Promise<ProcessResult> {
    const command = parseReleaseCommandPayload(envelope.payload);

    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '0'`);

        const duplicate = await this.claimInbox(tx, envelope);
        if (duplicate) {
          return { status: 'duplicate' as const };
        }

        const existing = await this.findReservation(tx, command.reservationId, command.orderId);
        const decision = decideRelease({ command, existing });

        if (decision.restoreStock && decision.reservation) {
          await this.restoreStock(tx, decision.reservation.items);
        }

        if (decision.reservation) {
          await this.upsertReservation(tx, decision.reservation);
        }

        return this.writeResult(tx, envelope, decision.reservation, decision.resultEvent, command);
      });
    } catch (error) {
      wrapTransient(error);
    }
  }

  async recordDeadLetter(input: DeadLetterInput): Promise<ProcessResult> {
    const reservationId = extractReservationId(
      input.parentEnvelope?.payload ?? input.rawValue
    );

    return recordDeadLetterEvent({
      db: this.db,
      deadLetterEvents,
      outboxEvents,
      originalTopic: input.originalTopic,
      rawValue: input.rawValue,
      parentEnvelope: input.parentEnvelope,
      reason: input.reason,
      attempts: input.attempts,
      deadLetterType: MESSAGE_TYPES.INVENTORY_DEADLETTERED,
      source: SERVICE_NAME,
      deadLetterTopic: DEADLETTER_TOPICS.inventory,
      extraPayload: reservationId ? { reservationId } : undefined,
      workflowStep: 'inventory_deadlettered'
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

  async seedCatalog(items: readonly CatalogStockItem[]): Promise<void> {
    await seedCatalogItems(this.db, items, { mode: 'reset' });
  }

  async getStock(productId: string): Promise<{ onHand: number; reservedQty: number } | null> {
    const [row] = await this.db.select().from(stock).where(eq(stock.productId, productId)).limit(1);
    if (!row) {
      return null;
    }

    return { onHand: row.onHand, reservedQty: row.reservedQty };
  }

  async getReservation(reservationId: string): Promise<ReservationSnapshot | null> {
    return this.findReservation(this.db, reservationId, '');
  }

  private async writeResult(
    tx: NodePgDatabase,
    envelope: MessageEnvelope,
    reservation: ReservationSnapshot | null,
    resultEvent: {
      type: string;
      payload: Record<string, unknown>;
      workflowStep: string;
    },
    command?: InventoryReleaseRequestedPayloadV1
  ): Promise<ProcessResult> {
    const resultEnvelope = createFollowUpEnvelope(envelope, {
      type: resultEvent.type,
      source: SERVICE_NAME,
      payload: resultEvent.payload
    });

    const orderId = reservation?.orderId ?? command?.orderId;
    const reservationId = reservation?.id ?? command?.reservationId;

    await tx.insert(outboxEvents).values({
      messageId: resultEnvelope.messageId,
      topic: EVENT_TOPICS.inventory,
      partitionKey: orderId ?? resultEnvelope.messageId,
      envelope: resultEnvelope
    });

    return {
      status: 'processed' as const,
      workflowStep: resultEvent.workflowStep,
      orderId,
      reservationId,
      messageType: resultEvent.type
    };
  }

  private async tryReserveStock(tx: NodePgDatabase, items: LineItem[]): Promise<string | null> {
    for (const item of sortedLineItems(items)) {
      const [product] = await tx
        .select({ id: products.id, deletedAt: products.deletedAt })
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product || product.deletedAt) {
        return `product not found: ${item.productId}`;
      }

      const updated = await tx
        .update(stock)
        .set({
          reservedQty: sql`${stock.reservedQty} + ${item.quantity}`
        })
        .where(
          and(
            eq(stock.productId, item.productId),
            sql`${stock.onHand} - ${stock.reservedQty} >= ${item.quantity}`
          )
        )
        .returning({ productId: stock.productId });

      if (updated.length > 0) {
        continue;
      }

      const [row] = await tx
        .select()
        .from(stock)
        .where(eq(stock.productId, item.productId))
        .limit(1);

      if (!row) {
        return `product not found: ${item.productId}`;
      }

      return `insufficient stock for ${item.productId}`;
    }

    return null;
  }

  private async restoreStock(tx: NodePgDatabase, items: LineItem[]): Promise<void> {
    for (const item of sortedLineItems(items)) {
      const updated = await tx
        .update(stock)
        .set({
          reservedQty: sql`${stock.reservedQty} - ${item.quantity}`
        })
        .where(
          and(
            eq(stock.productId, item.productId),
            sql`${stock.reservedQty} >= ${item.quantity}`
          )
        )
        .returning({ productId: stock.productId });

      if (updated.length === 0) {
        throw new TransientProcessingError(`could not restore stock for ${item.productId}`);
      }
    }
  }

  private async claimInbox(tx: NodePgDatabase, envelope: MessageEnvelope): Promise<boolean> {
    return claimInboxEvent(tx, inboxEvents, envelope);
  }

  private async findReservation(
    tx: NodePgDatabase,
    reservationId: string,
    orderId: string
  ): Promise<ReservationSnapshot | null> {
    const [byId] = await tx
      .select()
      .from(inventoryReservations)
      .where(eq(inventoryReservations.id, reservationId))
      .limit(1);

    if (byId) return this.toSnapshot(tx, byId);

    if (!orderId) return null;

    const [byOrder] = await tx
      .select()
      .from(inventoryReservations)
      .where(eq(inventoryReservations.orderId, orderId))
      .limit(1);

    return byOrder ? this.toSnapshot(tx, byOrder) : null;
  }

  private async toSnapshot(
    tx: NodePgDatabase,
    row: typeof inventoryReservations.$inferSelect
  ): Promise<ReservationSnapshot> {
    const itemRows = await tx
      .select()
      .from(reservationItems)
      .where(eq(reservationItems.reservationId, row.id));

    return {
      id: row.id,
      orderId: row.orderId,
      status: row.status as ReservationSnapshot['status'],
      failureReason: row.failureReason,
      reservedAt: row.reservedAt,
      releasedAt: row.releasedAt,
      items: itemRows.map((item) => ({
        productId: item.productId,
        quantity: item.quantity
      }))
    };
  }

  private async upsertReservation(
    tx: NodePgDatabase,
    reservation: ReservationSnapshot
  ): Promise<void> {
    const [existing] = await tx
      .select({ id: inventoryReservations.id })
      .from(inventoryReservations)
      .where(eq(inventoryReservations.id, reservation.id))
      .limit(1);

    if (!existing) {
      await tx.insert(inventoryReservations).values({
        id: reservation.id,
        orderId: reservation.orderId,
        status: reservation.status,
        failureReason: reservation.failureReason,
        reservedAt: reservation.reservedAt,
        releasedAt: reservation.releasedAt
      });

      if (reservation.items.length > 0) {
        await tx.insert(reservationItems).values(
          reservation.items.map((item) => ({
            reservationId: reservation.id,
            productId: item.productId,
            quantity: item.quantity
          }))
        );
      }

      return;
    }

    await tx
      .update(inventoryReservations)
      .set({
        status: reservation.status,
        failureReason: reservation.failureReason,
        reservedAt: reservation.reservedAt,
        releasedAt: reservation.releasedAt,
        updatedAt: new Date().toISOString()
      })
      .where(eq(inventoryReservations.id, reservation.id));
  }
}
