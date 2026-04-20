import { PatchLayoutSchema } from '@/lib/schemas/api';
import {
  currentUser, badRequest, unauthorized, notFound,
} from '@/server/auth/guard';
import {
  loadOwnedLayout, renameLayout, deleteLayoutById, getLatestSnapshot,
} from '@/server/repositories/layouts';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const layout = loadOwnedLayout(id, user.id);
  if (!layout) return notFound();

  const latest = getLatestSnapshot(id);
  if (!latest) return notFound('Aucun snapshot.');

  return Response.json({
    layout,
    latestSnapshot: {
      id:            latest.id,
      schemaVersion: latest.schemaVersion,
      sizeBytes:     latest.sizeBytes,
      createdAt:     latest.createdAt,
      createdBy:     latest.createdBy,
      note:          latest.note,
      payload:       JSON.parse(latest.payloadJson),
    },
  });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  if (!loadOwnedLayout(id, user.id)) return notFound();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = PatchLayoutSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const updated = renameLayout(id, parsed.data.name);
  return Response.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await currentUser();
  if (!user) return unauthorized();
  const { id } = await params;

  if (!loadOwnedLayout(id, user.id)) return notFound();

  deleteLayoutById(id);
  return Response.json({ ok: true });
}
