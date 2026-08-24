import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { InboxEventsTable } from './schema.ts';

export async function claimInboxEvent(
  tx: NodePgDatabase,
  inboxEvents: InboxEventsTable,
  envelope: { messageId: string; type: string }
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
