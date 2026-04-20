import { eq } from 'drizzle-orm';
import { LoginSchema } from '@/lib/schemas/api';
import { getSession } from '@/server/auth/session';
import { verifyPassword } from '@/server/auth/password';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import { badRequest, unauthorized } from '@/server/auth/guard';

export const runtime = 'nodejs';

// Hash valide mais jamais attribué — sert à équilibrer le temps de réponse
// quand l'email n'existe pas (anti-énumération par timing).
const DUMMY_HASH = '$2a$12$K3VQ5Kyp.rDwS.8h4kB1n.UsZs7N3hKmJOvQfKn.HDAZuGmQmTyny';

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const email = parsed.data.email.toLowerCase();
  const user = db.select().from(users).where(eq(users.email, email)).get();

  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) return unauthorized('Email ou mot de passe incorrect.');

  const session = await getSession();
  session.userId      = user.id;
  session.email       = user.email;
  session.displayName = user.displayName;
  await session.save();

  db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id)).run();

  return Response.json({ id: user.id, email: user.email, displayName: user.displayName });
}
