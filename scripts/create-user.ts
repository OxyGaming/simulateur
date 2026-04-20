// CLI admin — création d'un formateur.
// Usage :
//   npm run create-user                       (prompt interactif)
//   npm run create-user -- --email=... --password=... --name="Jean Dupont"
//
// Le mot de passe est haché (bcrypt cost 12) avant stockage.

import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, argv, exit } from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as schema from '../src/server/db/schema';

function parseArgs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

async function prompt(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return (await rl.question(q)).trim();
}

async function main() {
  const args = parseArgs();
  const rl = createInterface({ input: stdin, output: stdout });

  const email = (args.email ?? await prompt(rl, 'Email : ')).toLowerCase();
  if (!email.includes('@') || email.length < 5) throw new Error('Email invalide.');

  const displayName = args.name ?? await prompt(rl, 'Nom affiché (optionnel) : ');
  const password = args.password ?? await prompt(rl, 'Mot de passe (≥ 8 caractères) : ');
  if (password.length < 8) throw new Error('Mot de passe trop court (≥ 8 caractères requis).');

  rl.close();

  const url = process.env.DATABASE_URL ?? 'file:./data/app.db';
  const filePath = url.startsWith('file:') ? url.slice(5) : url;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const sqlite = new Database(filePath);
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });

  const existing = db.select().from(schema.users).where(eq(schema.users.email, email)).get();
  if (existing) {
    sqlite.close();
    throw new Error(`Un utilisateur existe déjà pour ${email}.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = nanoid();
  const now = Date.now();

  db.insert(schema.users).values({
    id,
    email,
    displayName: displayName || null,
    passwordHash,
    createdAt: now,
    lastLoginAt: null,
  }).run();

  sqlite.close();
  console.log(`✓ Formateur créé : ${email} (id=${id})`);
}

main().catch(err => {
  console.error(`✗ ${err.message}`);
  exit(1);
});
