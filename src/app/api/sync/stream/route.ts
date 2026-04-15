// GET /api/sync/stream?session=XXXX — flux SSE pour les apprenants
import { syncHub } from '@/lib/syncHub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = new URL(req.url).searchParams.get('session');
  if (!session) return new Response('Missing ?session=', { status: 400 });

  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const enqueue = (data: string) => {
        try { controller.enqueue(enc.encode(data)); } catch { /* déconnecté */ }
      };

      // Flush immédiat des headers SSE
      enqueue(': connected\n\n');

      syncHub.getSession(session).registerLearnerClient({ id: clientId, enqueue });

      const heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), 20_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        syncHub.getSession(session).unregisterLearnerClient(clientId);
        try { controller.close(); } catch { /* déjà fermé */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
