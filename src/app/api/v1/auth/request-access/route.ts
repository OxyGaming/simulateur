import { AccessRequestSchema } from '@/lib/schemas/api';
import { badRequest } from '@/server/auth/guard';
import { createAccessRequest, findPendingByEmail } from '@/server/repositories/accessRequests';
import { findUserByEmail } from '@/server/repositories/users';

export const runtime = 'nodejs';

// Endpoint public : un visiteur soumet une demande de création de compte.
// On répond toujours { ok: true } pour ne pas laisser un attaquant énumérer
// les emails déjà inscrits — la duplication silencieuse côté UI suffit, et
// l'admin verra de toute façon zéro nouvelle demande pour cet email.
export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = AccessRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const email = parsed.data.email.toLowerCase();

  // Email déjà inscrit ou demande déjà en attente : on no-op silencieusement.
  if (findUserByEmail(email) || findPendingByEmail(email)) {
    return Response.json({ ok: true });
  }

  await createAccessRequest({
    email,
    firstName: parsed.data.firstName,
    lastName:  parsed.data.lastName,
    password:  parsed.data.password,
    reason:    parsed.data.reason,
  });

  return Response.json({ ok: true });
}
