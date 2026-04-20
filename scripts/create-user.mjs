// Runtime create-user CLI for production containers.
// Usage inside the running app container :
//   docker compose exec app node scripts/create-user.mjs \
//       --email=jean@exemple.fr --password='motdepasseSolide' --name='Jean Dupont'
// Plain ESM (no tsx) so it runs on a minimal prod image.
//
// Validation email identique à l'API (src/lib/schemas/api.ts → LoginSchema) :
// on importe zod et on applique le même z.string().email(). Évite de créer
// un compte CLI-valide mais rejeté au login.

import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import { argv, exit } from 'node:process';
import { z } from 'zod';

function parseArgs() {
  const out = {};
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Source de vérité alignée sur LoginSchema (email) + contrainte password
// légèrement plus stricte côté CLI (min 8) pour la création initiale.
const CreateUserSchema = z.object({
  email:    z.string().trim().toLowerCase().email('Email invalide (format attendu: jean@exemple.fr)'),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
  name:     z.string().trim().max(200).optional(),
});

const args = parseArgs();
const parsed = CreateUserSchema.safeParse({
  email:    args.email ?? '',
  password: args.password ?? '',
  name:     args.name,
});

if (!parsed.success) {
  const issues = parsed.error.issues ?? [];
  for (const issue of issues) {
    const field = issue.path.join('.') || '(racine)';
    console.error(`✗ ${field}: ${issue.message}`);
  }
  console.error('\nUsage: node scripts/create-user.mjs --email=... --password=... [--name=...]');
  exit(1);
}

const { email, password, name: displayName } = parsed.data;

const url = process.env.DATABASE_URL ?? 'file:./data/app.db';
const filePath = url.startsWith('file:') ? url.slice(5) : url;
fs.mkdirSync(path.dirname(filePath), { recursive: true });

const sqlite = new Database(filePath);
sqlite.pragma('foreign_keys = ON');

const existing = sqlite.prepare('SELECT id FROM users WHERE email = ?').get(email);
if (existing) {
  sqlite.close();
  console.error(`✗ Un utilisateur existe déjà pour ${email}.`);
  exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);
const id = nanoid();
const now = Date.now();

sqlite.prepare(
  `INSERT INTO users (id, email, display_name, password_hash, created_at, last_login_at)
   VALUES (?, ?, ?, ?, ?, NULL)`,
).run(id, email, displayName || null, passwordHash, now);

sqlite.close();
console.log(`✓ Formateur créé : ${email} (id=${id})`);
