// POST /api/sync/push?session=XXXX — le formateur envoie un snapshot d'état
import { syncHub } from '@/lib/syncHub';
import type { SyncSnapshot } from '@/types/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = new URL(req.url).searchParams.get('session');
  if (!session) return new Response('Missing ?session=', { status: 400 });

  let snapshot: SyncSnapshot;
  try { snapshot = await req.json() as SyncSnapshot; }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  syncHub.getSession(session).broadcastSnapshot(snapshot);
  return new Response(null, { status: 204 });
}
