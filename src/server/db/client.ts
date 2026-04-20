import 'server-only';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const url = process.env.DATABASE_URL ?? 'file:./data/app.db';
const filePath = url.startsWith('file:') ? url.slice(5) : url;

fs.mkdirSync(path.dirname(filePath), { recursive: true });

// Singleton résistant au hot-reload Next.js (même logique que syncHub).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
const sqlite: Database.Database =
  g.__prs_sqlite__ ?? (g.__prs_sqlite__ = new Database(filePath));

// WAL = lectures concurrentes pendant une écriture. FK = intégrité référentielle.
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
