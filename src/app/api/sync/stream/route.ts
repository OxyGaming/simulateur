// GET /api/sync/stream — flux SSE pour les apprenants
// Dès la connexion, le dernier snapshot est envoyé (rattrapage).
// Ensuite, chaque broadcast du formateur est retransmis en temps réel.
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

      // Commentaire initial : force le flush des headers SSE vers le client
      // (certains proxys/navigateurs n'envoient rien tant que le buffer est vide)
      enqueue(': connected\n\n');

      syncHub.registerLearnerClient({ id: clientId, enqueue });

      // Heartbeat toutes les 20 s pour éviter les timeouts proxy/navigateur
      const heartbeat = setInterval(() => enqueue(': heartbeat\n\n'), 20_000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        syncHub.unregisterLearnerClient(clientId);
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
