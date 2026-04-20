import { CreateLayoutSchema } from '@/lib/schemas/api';
import { currentUser, badRequest, unauthorized } from '@/server/auth/guard';
import { createLayoutWithSnapshot, listLayoutsByOwner } from '@/server/repositories/layouts';

export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  if (!user) return unauthorized();
  return Response.json(listLayoutsByOwner(user.id));
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return unauthorized();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest('json_invalid'); }

  const parsed = CreateLayoutSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const { layout, snapshot } = createLayoutWithSnapshot({
    ownerId: user.id,
    name:    parsed.data.name,
    payload: parsed.data.payload,
    note:    parsed.data.note,
  });

  return Response.json({ layout, snapshotId: snapshot.id }, { status: 201 });
}
