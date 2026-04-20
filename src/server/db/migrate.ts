import 'dotenv/config';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';

const url = process.env.DATABASE_URL ?? 'file:./data/app.db';
const filePath = url.startsWith('file:') ? url.slice(5) : url;
fs.mkdirSync(path.dirname(filePath), { recursive: true });

const sqlite = new Database(filePath);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: './drizzle' });
console.log(`[migrate] ok — ${filePath}`);
sqlite.close();
