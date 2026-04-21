import {
  currentUser, unauthorized, notFound,
} from '@/server/auth/guard';
import {
  loadAccessibleLayout, cloneLayoutLatestSnapshot,
} from '@/server/repositories/layouts';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  // Clone autorisé sur tout layout accessible (possédé ou public).
  const src = loadAccessibleLayout(id, user.id);
  if (!src) return notFound();

  const result = cloneLayoutLatestSnapshot({
    sourceLayoutId: id,
    newOwnerId:     user.id,
    newName:        `${src.name} (copie)`,
  });
  if (!result) return notFound('Aucun snapshot source à cloner.');

  return Response.json(
    { layout: result.layout, snapshotId: result.snapshot.id },
    { status: 201 },
  );
}
