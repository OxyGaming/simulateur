// POST /api/sync/action — l'apprenant envoie une action (pressButton, updateReflexion…)
// L'action est broadcastée à tous les formateurs connectés.
import { syncHub } from '@/lib/syncHub';
import type { LearnerAction } from '@/types/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let action: LearnerAction;
  try {
    action = await req.json() as LearnerAction;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  syncHub.broadcastAction(action);
  return new Response(null, { status: 204 });
}
