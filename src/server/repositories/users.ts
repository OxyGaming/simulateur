import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/db/client';
import { users, type User } from '@/server/db/schema';
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
