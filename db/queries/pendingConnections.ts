import { eq, and } from 'drizzle-orm';
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { db } from '../index';
import { pendingConnections } from '../schema';

export type PendingConnection = InferSelectModel<typeof pendingConnections>;
export type NewPendingConnection = InferInsertModel<typeof pendingConnections>;

export const pendingConnectionsRepo = {
  create: (data: NewPendingConnection): Promise<PendingConnection> =>
    (async () => {
      const [row] = await db.insert(pendingConnections).values(data).returning();
      if (!row) throw new Error('pendingConnections.create: insert returned no row');
      return row;
    })(),

  consume: (key: string, userId: string): Promise<PendingConnection | null> =>
    (async () => {
      const [row] = await db
        .delete(pendingConnections)
        .where(and(eq(pendingConnections.id, key), eq(pendingConnections.userId, userId)))
        .returning();
      return row && row.expiresAt > new Date() ? row : null;
    })(),
};
