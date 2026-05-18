import { currentUser, notFound, unauthorized } from '@/server/auth/guard';
import { approveAccessRequest } from '@/server/repositories/accessRequests';

export const runtime = 'nodejs';

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const result = approveAccessRequest(id, user.id);
  if (!result.ok) {
    if (result.reason === 'not_found')   return notFound('Demande introuvable.');
    if (result.reason === 'not_pending') return Response.json({ error: 'not_pending' }, { status: 409 });
    if (result.reason === 'email_taken') return Response.json({ error: 'email_taken' }, { status: 409 });
  }
  return Response.json({ ok: true });
}
