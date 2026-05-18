import { currentUser, notFound, unauthorized } from '@/server/auth/guard';
import { deleteUser } from '@/server/repositories/users';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return unauthorized();

  const { id } = await ctx.params;
  const result = deleteUser(id, user.id);
  if (result.ok) return Response.json({ ok: true });

  if (result.reason === 'not_found')   return notFound('Utilisateur introuvable.');
  if (result.reason === 'self_delete') return Response.json({ error: 'self_delete' }, { status: 400 });
  // 409 = conflit d'état : la cible existe mais ne peut pas être supprimée
  // dans son état actuel (a des layouts ou des contributions).
  return Response.json(
    {
      error: result.reason,
      layoutsCount:   result.layoutsCount,
      snapshotsCount: result.snapshotsCount,
      reviewsCount:   result.reviewsCount,
    },
    { status: 409 },
  );
}
