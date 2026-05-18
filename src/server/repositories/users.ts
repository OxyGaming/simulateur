import 'server-only';
import { asc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/db/client';
import { accessRequests, layoutSnapshots, layouts, users, type User } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/password';

export type UserSummary = Omit<User, 'passwordHash'>;

export function listUsers(): UserSummary[] {
  return db
    .select({
      id:           users.id,
      email:        users.email,
      displayName:  users.displayName,
      createdAt:    users.createdAt,
      lastLoginAt:  users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.email))
    .all();
}

export function findUserByEmail(email: string): User | null {
  return db.select().from(users).where(eq(users.email, email)).get() ?? null;
}

export async function createUser(opts: {
  email:        string;
  password:     string;
  displayName?: string | null;
}): Promise<UserSummary> {
  const email = opts.email.toLowerCase();
  const passwordHash = await hashPassword(opts.password);
  const id  = nanoid();
  const now = Date.now();

  db.insert(users).values({
    id,
    email,
    displayName:  opts.displayName?.trim() || null,
    passwordHash,
    createdAt:    now,
    lastLoginAt:  null,
  }).run();

  return { id, email, displayName: opts.displayName?.trim() || null, createdAt: now, lastLoginAt: null };
}

export type DeleteUserResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'self_delete' | 'has_layouts' | 'has_contributions';
      layoutsCount?: number; snapshotsCount?: number; reviewsCount?: number };

/**
 * Hard delete d'un user, avec garde-fous :
 *   - self_delete       : on n'autorise pas un user à se supprimer lui-même.
 *   - has_layouts       : refuse si l'user possède des layouts (l'admin doit
 *                         d'abord les supprimer/transférer manuellement, pour
 *                         éviter la perte irréversible via cascade).
 *   - has_contributions : refuse si l'user a créé des snapshots OU revu des
 *                         demandes d'accès (FK no action sur layoutSnapshots
 *                         et accessRequests bloquerait de toute façon, on
 *                         renvoie un message lisible plutôt qu'une erreur SQL).
 */
export function deleteUser(id: string, requesterId: string): DeleteUserResult {
  if (id === requesterId) return { ok: false, reason: 'self_delete' };

  const target = db.select().from(users).where(eq(users.id, id)).get();
  if (!target) return { ok: false, reason: 'not_found' };

  const layoutsCount = db
    .select({ n: sql<number>`count(*)` })
    .from(layouts)
    .where(eq(layouts.ownerId, id))
    .get()?.n ?? 0;
  if (layoutsCount > 0) return { ok: false, reason: 'has_layouts', layoutsCount };

  const snapshotsCount = db
    .select({ n: sql<number>`count(*)` })
    .from(layoutSnapshots)
    .where(eq(layoutSnapshots.createdBy, id))
    .get()?.n ?? 0;
  const reviewsCount = db
    .select({ n: sql<number>`count(*)` })
    .from(accessRequests)
    .where(eq(accessRequests.reviewedBy, id))
    .get()?.n ?? 0;
  if (snapshotsCount > 0 || reviewsCount > 0) {
    return { ok: false, reason: 'has_contributions', snapshotsCount, reviewsCount };
  }

  db.delete(users).where(eq(users.id, id)).run();
  return { ok: true };
}
