import type { SyncSnapshot, LearnerAction } from '@/types/sync';

// ─── Client SSE générique ─────────────────────────────────────────────────────

type SseClient = {
  id:      string;
  enqueue: (data: string) => void;
};

// ─── Hub bidirectionnel ───────────────────────────────────────────────────────

class SyncHub {
  // Clients apprenant — reçoivent les snapshots du formateur
  private learnerClients = new Map<string, SseClient>();
  // Clients formateur — reçoivent les actions de l'apprenant
  private trainerClients = new Map<string, SseClient>();

  private lastSnapshot: SyncSnapshot | null = null;
  private stateSeq     = 0;
  private actionSeq    = 0;

  // ── Formateur → Apprenants ─────────────────────────────────────────────────

  registerLearnerClient(client: SseClient) {
    this.learnerClients.set(client.id, client);
    // Envoi immédiat du dernier snapshot pour rattrapage
    if (this.lastSnapshot) {
      client.enqueue(
        `data: ${JSON.stringify({ seq: this.stateSeq, snapshot: this.lastSnapshot })}\n\n`,
      );
    }
  }

  unregisterLearnerClient(id: string) {
    this.learnerClients.delete(id);
  }

  broadcastSnapshot(snapshot: SyncSnapshot) {
    this.lastSnapshot = snapshot;
    this.stateSeq++;
    const msg = `data: ${JSON.stringify({ seq: this.stateSeq, snapshot })}\n\n`;
    for (const client of this.learnerClients.values()) {
      client.enqueue(msg);
    }
  }

  // ── Apprenants → Formateurs ────────────────────────────────────────────────

  registerTrainerClient(client: SseClient) {
    this.trainerClients.set(client.id, client);
  }

  unregisterTrainerClient(id: string) {
    this.trainerClients.delete(id);
  }

  broadcastAction(action: LearnerAction) {
    this.actionSeq++;
    const msg = `data: ${JSON.stringify({ seq: this.actionSeq, action })}\n\n`;
    for (const client of this.trainerClients.values()) {
      client.enqueue(msg);
    }
  }
}

// ─── Singleton résistant au hot-reload Next.js ────────────────────────────────
// En dev, Next.js recharge les modules mais globalThis persiste dans le process.

const GLOBAL_KEY = '__prs_sync_hub__';
export const syncHub: SyncHub =
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] instanceof SyncHub
    ? (globalThis as Record<string, unknown>)[GLOBAL_KEY] as SyncHub
    : ((globalThis as Record<string, unknown>)[GLOBAL_KEY] = new SyncHub());
