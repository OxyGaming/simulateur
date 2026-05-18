import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/db/client';
import { accessRequests, users, type AccessRequest } from '@/server/db/schema';
import { hashPassword } from '@/server/auth/password';
import { findUserByEmail } from '@/server/repositories/users';

export type AccessRequestSummary = Omit<AccessRequest, 'passwordHash'>;

function toSummary(r: AccessRequest): AccessRequestSummary {
  const { passwordHash: _ph, ...rest } = r;
  return rest;
}

export function listAccessRequests(status?: 'pending' | 'approved' | 'rejected'): AccessRequestSummary[] {
  const rows = status
    ? db.select().from(accessRequests).where(eq(accessRequests.status, status)).orderBy(desc(accessRequests.createdAt)).all()
    : db.select().from(accessRequests).orderBy(desc(accessRequests.createdAt)).all();
  return rows.map(toSummary);
}

export function findAccessRequestById(id: string): AccessRequest | null {
  return db.select().from(accessRequests).where(eq(accessRequests.id, id)).get() ?? null;
}

export function findPendingByEmail(email: string): AccessRequest | null {
  return db
    .select()
    .from(accessRequests)
    .where(and(eq(accessRequests.email, email), eq(accessRequests.status, 'pending')))
    .get() ?? null;
}

export async function createAccessRequest(opts: {
  email:     string;
  firstName: string;
  lastName:  string;
  password:  string;
  reason:    string;
}): Promise<AccessRequestSummary> {
  const email = opts.email.toLowerCase();
  const passwordHash = await hashPassword(opts.password);
  const id  = nanoid();
  const now = Date.now();

  db.insert(accessRequests).values({
    id,
    email,
    firstName:   opts.firstName.trim(),
    lastName:    opts.lastName.trim(),
    passwordHash,
    reason:      opts.reason.trim(),
    status:      'pending',
    createdAt:   now,
    reviewedAt:  null,
    reviewedBy:  null,
  }).run();

  return toSummary({
    id, email,
    firstName: opts.firstName.trim(),
    lastName:  opts.lastName.trim(),
    passwordHash,
    reason:    opts.reason.trim(),
    status:    'pending',
    createdAt: now,
    reviewedAt: null,
    reviewedBy: null,
  });
}

export type ApproveResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'not_found' | 'not_pending' | 'email_taken' };

/**
 * Approuve une demande : crée le user à partir du hash déjà stocké et marque
 * la demande comme `approved`. Toute la transition est en transaction pour
 * éviter qu'on crée un user puis qu'on échoue à marquer la demande (ce qui
 * laisserait la demande "pending" et casserait l'invariant).
 */
export function approveAccessRequest(requestId: string, reviewerId: string): ApproveResult {
  const req = findAccessRequestById(requestId);
  if (!req) return { ok: false, reason: 'not_found' };
  if (req.status !== 'pending') return { ok: false, reason: 'not_pending' };
  if (findUserByEmail(req.email)) return { ok: false, reason: 'email_taken' };

  const userId = nanoid();
  const now    = Date.now();
  const displayName = `${req.firstName} ${req.lastName}`.trim() || null;

  db.transaction((tx) => {
    tx.insert(users).values({
      id:           userId,
      email:        req.email,
      displayName,
      passwordHash: req.passwordHash,
      createdAt:    now,
      lastLoginAt:  null,
    }).run();

    tx.update(accessRequests)
      .set({ status: 'approved', reviewedAt: now, reviewedBy: reviewerId })
      .where(eq(accessRequests.id, requestId))
      .run();
  });

  return { ok: true, userId };
}

export type RejectResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'not_pending' };

export function rejectAccessRequest(requestId: string, reviewerId: string): RejectResult {
  const req = findAccessRequestById(requestId);
  if (!req) return { ok: false, reason: 'not_found' };
  if (req.status !== 'pending') return { ok: false, reason: 'not_pending' };

  db.update(accessRequests)
    .set({ status: 'rejected', reviewedAt: Date.now(), reviewedBy: reviewerId })
    .where(eq(accessRequests.id, requestId))
    .run();

  return { ok: true };
}
