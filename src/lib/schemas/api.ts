// Schémas Zod pour les corps de requête API — validation stricte à l'entrée.
import { z } from 'zod';
import { LayoutPayloadSchema } from './layout';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ─── Layouts ──────────────────────────────────────────────────────────────────

export const CreateLayoutSchema = z.object({
  name:    z.string().min(1).max(200),
  payload: LayoutPayloadSchema,
  note:    z.string().max(500).optional(),
});
export type CreateLayoutInput = z.infer<typeof CreateLayoutSchema>;

export const PatchLayoutSchema = z.object({
  name: z.string().min(1).max(200),
});
export type PatchLayoutInput = z.infer<typeof PatchLayoutSchema>;

export const CreateSnapshotSchema = z.object({
  payload: LayoutPayloadSchema,
  note:    z.string().max(500).optional(),
});
export type CreateSnapshotInput = z.infer<typeof CreateSnapshotSchema>;
