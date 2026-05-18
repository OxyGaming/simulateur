import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// ─── users (formateurs) ───────────────────────────────────────────────────────
export const users = sqliteTable('users', {
  id:           text('id').primaryKey(),             // nanoid
  email:        text('email').notNull().unique(),
  displayName:  text('display_name'),
  passwordHash: text('password_hash').notNull(),     // bcrypt
  createdAt:    integer('created_at').notNull(),     // unix ms
  lastLoginAt:  integer('last_login_at'),
});

// ─── layouts (métadonnées, un par projet TCO) ─────────────────────────────────
export const layouts = sqliteTable('layouts', {
  id:        text('id').primaryKey(),
  ownerId:   text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name:      text('name').notNull(),
  // Bibliothèque partagée : un layout public est visible (lecture + export) par
  // tous les formateurs. Seul son propriétaire peut l'éditer ou le supprimer.
  isPublic:  integer('is_public').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => ({
  ownerIdx:  index('idx_layouts_owner').on(t.ownerId),
  publicIdx: index('idx_layouts_public').on(t.isPublic),
}));

// ─── layout_snapshots (append-only, un par "Sauvegarder") ─────────────────────
// On ne met jamais à jour ni ne supprime un snapshot individuellement.
// "Restaurer" = cloner un snapshot vers un nouveau head.
export const layoutSnapshots = sqliteTable('layout_snapshots', {
  id:            text('id').primaryKey(),
  layoutId:      text('layout_id').notNull().references(() => layouts.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull(),
  payloadJson:   text('payload_json').notNull(),
  sizeBytes:     integer('size_bytes').notNull(),
  createdAt:     integer('created_at').notNull(),
  createdBy:     text('created_by').notNull().references(() => users.id),
  note:          text('note'),
}, (t) => ({
  layoutTimeIdx: index('idx_snapshots_layout_time').on(t.layoutId, t.createdAt),
}));

// ─── access_requests (demandes de création de compte) ────────────────────────
// Une demande contient déjà le hash du mot de passe choisi par le demandeur :
// à l'approbation, on crée le user sans devoir lui renvoyer un mot de passe
// initial. Statut : pending → approved | rejected (transition unique).
export const accessRequests = sqliteTable('access_requests', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull(),
  firstName:    text('first_name').notNull(),
  lastName:     text('last_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  reason:       text('reason').notNull(),
  status:       text('status').notNull().default('pending'),
  createdAt:    integer('created_at').notNull(),
  reviewedAt:   integer('reviewed_at'),
  reviewedBy:   text('reviewed_by').references(() => users.id),
}, (t) => ({
  statusIdx: index('idx_access_requests_status').on(t.status),
  emailIdx:  index('idx_access_requests_email').on(t.email),
}));

export type User            = typeof users.$inferSelect;
export type NewUser         = typeof users.$inferInsert;
export type Layout          = typeof layouts.$inferSelect;
export type NewLayout       = typeof layouts.$inferInsert;
export type LayoutSnapshot  = typeof layoutSnapshots.$inferSelect;
export type NewSnapshot     = typeof layoutSnapshots.$inferInsert;
export type AccessRequest   = typeof accessRequests.$inferSelect;
export type NewAccessRequest = typeof accessRequests.$inferInsert;
