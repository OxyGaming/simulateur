// POST /api/sync/action?session=XXXX — l'apprenant envoie une action
import { syncHub } from '@/lib/syncHub';
import type { LearnerAction } from '@/types/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = new URL(req.url).searchParams.get('session');
  if (!session) return new Response('Missing ?session=', { status: 400 });

  let action: LearnerAction;
  try { action = await req.json() as LearnerAction; }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  syncHub.getSession(session).broadcastAction(action);
  return new Response(null, { status: 204 });
}
