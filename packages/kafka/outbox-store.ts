import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { MessageEnvelope } from '@services-sandbox/contracts';

import type { OutboxEventsTable } from './schema.ts';

export const DEFAULT_OUTBOX_CLAIM_LIMIT = 50;
export const DEFAULT_OUTBOX_LEASE_MS = 30_000;

export interface OutboxRecord {
  id: string;
  topic: string;
  partitionKey: string;
  envelope: MessageEnvelope;
}

export interface ClaimUnpublishedOutboxInput {
  instanceId: string;
  limit?: number;
  leaseMs?: number;
}

export interface OutboxClaimOwner {
  id: string;
  instanceId: string;
}

export interface OutboxStore {
  claimUnpublishedOutbox: (input: ClaimUnpublishedOutboxInput) => Promise<OutboxRecord[]>;
  markOutboxPublished: (input: OutboxClaimOwner) => Promise<void>;
  releaseOutboxClaim: (input: OutboxClaimOwner) => Promise<void>;
  releaseAllOutboxClaims: (instanceId: string) => Promise<void>;
}

function toOutboxRecord(row: {
  id: string;
  topic: string;
  partitionKey: string;
  envelope: MessageEnvelope;
}): OutboxRecord {
  return {
    id: row.id,
    topic: row.topic,
    partitionKey: row.partitionKey,
    envelope: row.envelope
  };
}

export function createOutboxStore(input: {
  db: NodePgDatabase;
  outboxEvents: OutboxEventsTable;
}): OutboxStore & { listUnpublishedOutbox: (limit?: number) => Promise<OutboxRecord[]> } {
  const { db, outboxEvents } = input;

  async function listUnpublishedOutbox(
    limit = DEFAULT_OUTBOX_CLAIM_LIMIT
  ): Promise<OutboxRecord[]> {
    const rows = await db
      .select()
      .from(outboxEvents)
      .where(isNull(outboxEvents.publishedAt))
      .orderBy(outboxEvents.createdAt)
      .limit(limit);

    return rows.map(toOutboxRecord);
  }

  async function claimUnpublishedOutbox(
    claimInput: ClaimUnpublishedOutboxInput
  ): Promise<OutboxRecord[]> {
    const limit = claimInput.limit ?? DEFAULT_OUTBOX_CLAIM_LIMIT;
    const leaseMs = claimInput.leaseMs ?? DEFAULT_OUTBOX_LEASE_MS;

    return db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(outboxEvents)
        .where(
          and(
            isNull(outboxEvents.publishedAt),
            or(isNull(outboxEvents.leaseUntil), sql`${outboxEvents.leaseUntil} < now()`)
          )
        )
        .orderBy(outboxEvents.createdAt)
        .limit(limit)
        .for('update', { skipLocked: true });

      if (rows.length === 0) {
        return [];
      }

      await tx
        .update(outboxEvents)
        .set({
          claimedBy: claimInput.instanceId,
          leaseUntil: sql`now() + (${leaseMs} * interval '1 millisecond')`
        })
        .where(
          inArray(
            outboxEvents.id,
            rows.map((row) => row.id)
          )
        );

      return rows.map(toOutboxRecord);
    });
  }

  async function markOutboxPublished(owner: OutboxClaimOwner): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        publishedAt: sql`now()`,
        claimedBy: null,
        leaseUntil: null
      })
      .where(
        and(
          eq(outboxEvents.id, owner.id),
          eq(outboxEvents.claimedBy, owner.instanceId),
          isNull(outboxEvents.publishedAt)
        )
      );
  }

  async function releaseOutboxClaim(owner: OutboxClaimOwner): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        claimedBy: null,
        leaseUntil: null
      })
      .where(
        and(
          eq(outboxEvents.id, owner.id),
          eq(outboxEvents.claimedBy, owner.instanceId),
          isNull(outboxEvents.publishedAt)
        )
      );
  }

  async function releaseAllOutboxClaims(instanceId: string): Promise<void> {
    await db
      .update(outboxEvents)
      .set({
        claimedBy: null,
        leaseUntil: null
      })
      .where(and(eq(outboxEvents.claimedBy, instanceId), isNull(outboxEvents.publishedAt)));
  }

  return {
    listUnpublishedOutbox,
    claimUnpublishedOutbox,
    markOutboxPublished,
    releaseOutboxClaim,
    releaseAllOutboxClaims
  };
}
