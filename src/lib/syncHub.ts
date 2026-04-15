import type { SyncSnapshot, LearnerAction } from '@/types/sync';

// ─── Client SSE générique ─────────────────────────────────────────────────────

type SseClient = {
  id:      string;
  enqueue: (data: string) => void;
};

// ─── Session individuelle ─────────────────────────────────────────────────────

class SyncSession {
  readonly code: string;

  private learnerClients = new Map<string, SseClient>();
  private trainerClients = new Map<string, SseClient>();

  lastSnapshot: SyncSnapshot | null = null;
  private stateSeq  = 0;
  private actionSeq = 0;

  constructor(code: string) { this.code = code; }

  // ── Formateur → Apprenants ───────────────────────────────────────────────

  registerLearnerClient(client: SseClient) {
    this.learnerClients.set(client.id, client);
    if (this.lastSnapshot) {
      client.enqueue(
        `data: ${JSON.stringify({ seq: this.stateSeq, snapshot: this.lastSnapshot })}\n\n`,
      );
    }
  }

  unregisterLearnerClient(id: string) { this.learnerClients.delete(id); }

  broadcastSnapshot(snapshot: SyncSnapshot) {
    this.lastSnapshot = snapshot;
    this.stateSeq++;
    const msg = `data: ${JSON.stringify({ seq: this.stateSeq, snapshot })}\n\n`;
    for (const c of this.learnerClients.values()) c.enqueue(msg);
  }

  // ── Apprenants → Formateurs ──────────────────────────────────────────────

  registerTrainerClient(client: SseClient) { this.trainerClients.set(client.id, client); }
  unregisterTrainerClient(id: string)      { this.trainerClients.delete(id); }

  broadcastAction(action: LearnerAction) {
    this.actionSeq++;
    const msg = `data: ${JSON.stringify({ seq: this.actionSeq, action })}\n\n`;
    for (const c of this.trainerClients.values()) c.enqueue(msg);
  }

  get clientCount() {
    return this.learnerClients.size + this.trainerClients.size;
  }
}

// ─── Gestionnaire de sessions ─────────────────────────────────────────────────

class SyncHub {
  private sessions = new Map<string, SyncSession>();

  getSession(code: string): SyncSession {
    let session = this.sessions.get(code);
    if (!session) {
      session = new SyncSession(code);
      this.sessions.set(code, session);
    }
    return session;
  }

  /** Supprime les sessions sans aucun client connecté (nettoyage mémoire). */
  cleanup() {
    for (const [code, session] of this.sessions) {
      if (session.clientCount === 0 && !session.lastSnapshot) {
        this.sessions.delete(code);
      }
    }
  }

  get sessionCount() { return this.sessions.size; }
}

// ─── Singleton résistant au hot-reload Next.js ────────────────────────────────
// On utilise ?? (et non instanceof) car en production Next.js peut bundler les
// routes dans des chunks séparés : la référence à la classe peut différer,
// rendant instanceof faux même si l'objet est bien un SyncHub.

const GLOBAL_KEY = '__prs_sync_hub__';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
export const syncHub: SyncHub = g[GLOBAL_KEY] ?? (g[GLOBAL_KEY] = new SyncHub());
