import { CreateSnapshotSchema } from '@/lib/schemas/api';
import {
  currentUser, badRequest, unauthorized, notFound, forbidden,
} from '@/server/auth/guard';
import {
  loadOwnedLayout, loadAccessibleLayout,
  listSnapshots, addSnapshot,
} from '@/server/repositories/layouts';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  if (!loadAccessibleLayout(id, user.id)) return notFound();

  return Response.json(listSnapshots(id));
}

export async function POST(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  // Ajouter un snapshot = éditer : réservé au propriétaire.
  if (!loadOwnedLayout(id, user.id)) return forbidden();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = CreateSnapshotSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const snapshot = addSnapshot({
    layoutId:  id,
    createdBy: user.id,
    payload:   parsed.data.payload,
    note:      parsed.data.note,
  });

  return Response.json(
    {
      id:            snapshot.id,
      layoutId:      snapshot.layoutId,
      schemaVersion: snapshot.schemaVersion,
      sizeBytes:     snapshot.sizeBytes,
      createdAt:     snapshot.createdAt,
      createdBy:     snapshot.createdBy,
      note:          snapshot.note,
    },
    { status: 201 },
  );
}
