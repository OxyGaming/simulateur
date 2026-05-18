import { currentUser, notFound, unauthorized } from '@/server/auth/guard';
import { rejectAccessRequest } from '@/server/repositories/accessRequests';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const result = rejectAccessRequest(id, user.id);
  if (!result.ok) {
    if (result.reason === 'not_found')   return notFound('Demande introuvable.');
    if (result.reason === 'not_pending') return Response.json({ error: 'not_pending' }, { status: 409 });
  }
  return Response.json({ ok: true });
}
