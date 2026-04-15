// GET /api/sync/trainer-stream — flux SSE pour les formateurs
// Chaque action soumise par un apprenant est retransmise en temps réel.
import { syncHub } from '@/lib/syncHub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const clientId = crypto.randomUUID();

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const enqueue = (data: string) => {
        try { controller.enqueue(enc.encode(data)); } catch { /* client déconnecté */ }
      };

      syncHub.registerTrainerClient({ id: clientId, enqueue });

      const heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), 20_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        syncHub.unregisterTrainerClient(clientId);
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
