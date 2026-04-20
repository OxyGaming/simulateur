import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '@/server/db/client';
import {
  layouts, layoutSnapshots,
  type Layout, type LayoutSnapshot,
} from '@/server/db/schema';
import { LAYOUT_SCHEMA_VERSION, type LayoutPayload } from '@/lib/schemas/layout';

// Normalise le payload avant persistance : on ne garde jamais d'état runtime
// dans un snapshot. Tout bouton pupitre est remis à 'idle' — le snapshot est
// une configuration, pas un instantané de simulation.
function normalizeForPersistence(p: LayoutPayload): LayoutPayload {
  const panelButtons = Object.fromEntries(
    Object.entries(p.panelButtons).map(([k, b]) => [k, { ...b, state: 'idle' as const }]),
  );
  return { ...p, panelButtons };
}

export type LayoutWithCount = Layout & {
  snapshotCount:    number;
  latestSnapshotAt: number | null;
};

export type SnapshotMeta = Omit<LayoutSnapshot, 'payloadJson'>;

// ─── Listing / fetch ──────────────────────────────────────────────────────────

export function listLayoutsByOwner(ownerId: string): LayoutWithCount[] {
  return db
    .select({
      id:        layouts.id,
      ownerId:   layouts.ownerId,
      name:      layouts.name,
      createdAt: layouts.createdAt,
      updatedAt: layouts.updatedAt,
      // NB : on écrit les noms de tables/colonnes en clair dans les sous-requêtes
      // corrélées — Drizzle strip le nom de table des références de colonnes dans
      // un `sql` template, ce qui casse la corrélation avec la FROM externe.
      snapshotCount: sql<number>`(
        SELECT COUNT(*) FROM layout_snapshots
        WHERE layout_snapshots.layout_id = layouts.id
      )`,
      latestSnapshotAt: sql<number | null>`(
        SELECT MAX(layout_snapshots.created_at) FROM layout_snapshots
        WHERE layout_snapshots.layout_id = layouts.id
      )`,
    })
    .from(layouts)
    .where(eq(layouts.ownerId, ownerId))
    .orderBy(desc(layouts.updatedAt))
    .all();
}

export function loadOwnedLayout(id: string, ownerId: string): Layout | null {
  return db
    .select()
    .from(layouts)
    .where(and(eq(layouts.id, id), eq(layouts.ownerId, ownerId)))
    .get() ?? null;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function createLayoutWithSnapshot(opts: {
  ownerId: string;
  name:    string;
  payload: LayoutPayload;
  note?:   string;
}): { layout: Layout; snapshot: LayoutSnapshot } {
  const now = Date.now();
  const layoutId   = nanoid();
  const snapshotId = nanoid();
  const json = JSON.stringify(normalizeForPersistence(opts.payload));

  return db.transaction(() => {
    db.insert(layouts).values({
      id:        layoutId,
      ownerId:   opts.ownerId,
      name:      opts.name,
      createdAt: now,
      updatedAt: now,
    }).run();

    db.insert(layoutSnapshots).values({
      id:            snapshotId,
      layoutId,
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      payloadJson:   json,
      sizeBytes:     Buffer.byteLength(json, 'utf8'),
      createdAt:     now,
      createdBy:     opts.ownerId,
      note:          opts.note ?? null,
    }).run();

    const layout   = db.select().from(layouts).where(eq(layouts.id, layoutId)).get()!;
    const snapshot = db.select().from(layoutSnapshots).where(eq(layoutSnapshots.id, snapshotId)).get()!;
    return { layout, snapshot };
  });
}

export function renameLayout(id: string, name: string): Layout | null {
  const now = Date.now();
  db.update(layouts).set({ name, updatedAt: now }).where(eq(layouts.id, id)).run();
  return db.select().from(layouts).where(eq(layouts.id, id)).get() ?? null;
}

export function deleteLayoutById(id: string): void {
  db.delete(layouts).where(eq(layouts.id, id)).run();
}

export function addSnapshot(opts: {
  layoutId:  string;
  createdBy: string;
  payload:   LayoutPayload;
  note?:     string;
}): LayoutSnapshot {
  const now = Date.now();
  const json = JSON.stringify(normalizeForPersistence(opts.payload));
  const id = nanoid();

  return db.transaction(() => {
    db.insert(layoutSnapshots).values({
      id,
      layoutId:      opts.layoutId,
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      payloadJson:   json,
      sizeBytes:     Buffer.byteLength(json, 'utf8'),
      createdAt:     now,
      createdBy:     opts.createdBy,
      note:          opts.note ?? null,
    }).run();

    db.update(layouts).set({ updatedAt: now }).where(eq(layouts.id, opts.layoutId)).run();

    return db.select().from(layoutSnapshots).where(eq(layoutSnapshots.id, id)).get()!;
  });
}

// ─── Snapshots ────────────────────────────────────────────────────────────────

export function listSnapshots(layoutId: string): SnapshotMeta[] {
  return db
    .select({
      id:            layoutSnapshots.id,
      layoutId:      layoutSnapshots.layoutId,
      schemaVersion: layoutSnapshots.schemaVersion,
      sizeBytes:     layoutSnapshots.sizeBytes,
      createdAt:     layoutSnapshots.createdAt,
      createdBy:     layoutSnapshots.createdBy,
      note:          layoutSnapshots.note,
    })
    .from(layoutSnapshots)
    .where(eq(layoutSnapshots.layoutId, layoutId))
    .orderBy(desc(layoutSnapshots.createdAt))
    .all();
}

export function getSnapshot(id: string): LayoutSnapshot | null {
  return db.select().from(layoutSnapshots).where(eq(layoutSnapshots.id, id)).get() ?? null;
}

export function getLatestSnapshot(layoutId: string): LayoutSnapshot | null {
  return db
    .select()
    .from(layoutSnapshots)
    .where(eq(layoutSnapshots.layoutId, layoutId))
    .orderBy(desc(layoutSnapshots.createdAt))
    .limit(1)
    .get() ?? null;
}
