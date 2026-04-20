import { currentUser, unauthorized, notFound } from '@/server/auth/guard';
import { loadOwnedLayout, getSnapshot } from '@/server/repositories/layouts';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string; sid: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id, sid } = await params;

  if (!loadOwnedLayout(id, user.id)) return notFound();

  const snap = getSnapshot(sid);
  if (!snap || snap.layoutId !== id) return notFound();

  return Response.json({
    id:            snap.id,
    layoutId:      snap.layoutId,
    schemaVersion: snap.schemaVersion,
    sizeBytes:     snap.sizeBytes,
    createdAt:     snap.createdAt,
    createdBy:     snap.createdBy,
    note:          snap.note,
    payload:       JSON.parse(snap.payloadJson),
  });
}
