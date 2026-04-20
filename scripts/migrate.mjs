// Runtime migration runner for production containers.
// Invoked at startup by docker-entrypoint.sh before launching the Next.js server.
// Plain ESM (no tsx) so it runs on a minimal prod image.

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL ?? 'file:./data/app.db';
const filePath = url.startsWith('file:') ? url.slice(5) : url;
fs.mkdirSync(path.dirname(filePath), { recursive: true });

const migrationsFolder = process.env.MIGRATIONS_FOLDER ?? './drizzle';
if (!fs.existsSync(migrationsFolder)) {
  console.error(`[migrate] migrations folder not found: ${migrationsFolder}`);
  process.exit(1);
}

const sqlite = new Database(filePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite);
migrate(db, { migrationsFolder });

sqlite.close();
console.log(`[migrate] ok — ${filePath}`);
