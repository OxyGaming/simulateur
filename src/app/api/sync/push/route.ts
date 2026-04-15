// POST /api/sync/push — le formateur envoie un snapshot d'état
// Ce snapshot est immédiatement broadcasté à tous les apprenants connectés.
import { syncHub } from '@/lib/syncHub';
import type { SyncSnapshot } from '@/types/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let snapshot: SyncSnapshot;
  try {
    snapshot = await req.json() as SyncSnapshot;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  syncHub.broadcastSnapshot(snapshot);
  return new Response(null, { status: 204 });
}
