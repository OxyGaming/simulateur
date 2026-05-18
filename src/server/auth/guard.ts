import 'server-only';
import { eq } from 'drizzle-orm';
import { getSession } from './session';
import { db } from '@/server/db/client';
import { users, type User } from '@/server/db/schema';

/**
 * Charge l'utilisateur courant depuis la session.
 * Retourne null si session absente ou invalidée (utilisateur supprimé).
 */
export async function currentUser(): Promise<User | null> {
  const session = await getSession();
  if (!session.userId) return null;

  const row = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!row) {
    // Session orpheline — user supprimé mais cookie toujours présent.
    // Next.js 15 interdit la modification de cookies depuis un Server Component
    // (et currentUser est appelé depuis page.tsx). On tente la destruction sans
    // bloquer le rendu : si on n'est pas dans une Route Handler / Server Action,
    // la session restera jusqu'à expiration ou prochain logout — inoffensif.
    try { await session.destroy(); } catch { /* read-only cookie context */ }
    return null;
  }
  return row;
}

export function unauthorized(message = 'Authentification requise.') {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Accès refusé.') {
  return Response.json({ error: message }, { status: 403 });
}

export function badRequest(details: unknown) {
  return Response.json({ error: 'bad_request', details }, { status: 400 });
}

export function notFound(message = 'Introuvable.') {
  return Response.json({ error: message }, { status: 404 });
}
