// Schémas Zod partagés client/serveur pour la validation stricte des layouts.
// Source de vérité pour la persistance serveur — tout payload qui entre ou sort
// de l'API passe par ces schémas.
//
// Le champ `schemaVersion` est obligatoire et permet les migrations futures :
// lorsqu'on bump la version, on ajoute une branche dans `migrateLayoutPayload`
// pour convertir depuis l'ancienne forme avant validation.

import { z } from 'zod';

export const LAYOUT_SCHEMA_VERSION = 1 as const;

// ─── Primitives ───────────────────────────────────────────────────────────────

const LabelOffsetSchema = z.object({
  x: z.number(),
  y: z.number(),
});

// ─── Domaine ──────────────────────────────────────────────────────────────────

const NodeSchema = z.object({
  id:          z.string().min(1),
  label:       z.string(),
  x:           z.number(),
  y:           z.number(),
  labelOffset: LabelOffsetSchema,
  hidden:      z.boolean().optional(),
  labelHidden: z.boolean().optional(),
});

const EdgeSchema = z.object({
  id:          z.string().min(1),
  fromNodeId:  z.string().min(1),
  toNodeId:    z.string().min(1),
  curveOffset: z.number().optional(),
});

const ZoneSchema = z.object({
  id:             z.string().min(1),
  label:          z.string(),
  edgeIds:        z.array(z.string()),
  labelOffset:    LabelOffsetSchema,
  occupiedManual: z.boolean(),
  derangement:    z.boolean(),
  annulled:       z.boolean(),
});

const SignalSchema = z.object({
  id:           z.string().min(1),
  edgeId:       z.string().min(1),
  direction:    z.enum(['AtoB', 'BtoA']),
  position:     z.number(),
  state:        z.enum(['open', 'maintained_open', 'closed']),
  label:        z.string(),
  labelOffset:  LabelOffsetSchema,
  zapEapOffset: LabelOffsetSchema.optional(),
});

const SwitchSchema = z.object({
  id:                    z.string().min(1),
  name:                  z.string(),
  nodeId:                z.string().min(1),
  entryEdgeId:           z.string().nullable(),
  straightEdgeId:        z.string().nullable(),
  divergingEdgeId:       z.string().nullable(),
  position:              z.enum(['straight', 'diverging']),
  locked:                z.boolean(),
  labelOffset:           LabelOffsetSchema,
  zonePropreId:          z.string().nullable(),
  discordanceStraight:   z.boolean(),
  discordanceDiverging:  z.boolean(),
});

const TextLabelSchema = z.object({
  id:       z.string().min(1),
  text:     z.string(),
  x:        z.number(),
  y:        z.number(),
  fontSize: z.number().min(6),
});

const PupitreLabelSchema = z.object({
  id:   z.string().min(1),
  text: z.string(),
  x:    z.number(),
  y:    z.number(),
  w:    z.number(),
  h:    z.number(),
});

const RouteZoneConditionSchema = z.object({
  zoneId:       z.string().min(1),
  roles:        z.array(z.enum(['ZP', 'ZEA', 'approche', 'transit'])),
  transitIndex: z.number().int().positive().optional(),
});

const RouteSchema = z.object({
  id:              z.string().min(1),
  fromZoneId:      z.string().optional(),
  toZoneId:        z.string().optional(),
  edgeIds:         z.array(z.string()),
  switchPositions: z.record(z.string(), z.enum(['straight', 'diverging'])),
  signalIds:       z.array(z.string()),
  zoneConditions:  z.array(RouteZoneConditionSchema),
  routeType:       z.enum(['DA', 'TP']).optional(),
});

const ReflexionDeviceSchema = z.object({
  slot: z.number().int().min(0).max(5),
  type: z.enum(['DA', 'DSA', 'DR']),
});

const PanelButtonSchema = z.object({
  id:                z.string().min(1),
  label:             z.string(),
  type:              z.enum(['route', 'fc', 'annulateur']),
  routeId:           z.string().nullable(),
  fcSignalId:        z.string().nullable(),
  annulateurZoneIds: z.array(z.string()),
  col:               z.number(),
  row:               z.number(),
  state:             z.enum(['idle', 'forming', 'active', 'conflict', 'registered', 'overregistered']),
  reflexions:        z.array(ReflexionDeviceSchema),
  learnerX:          z.number().optional(),
  learnerY:          z.number().optional(),
  learnerW:          z.number().optional(),
  learnerH:          z.number().optional(),
});

// ─── Payload complet ──────────────────────────────────────────────────────────

export const LayoutPayloadSchema = z.object({
  schemaVersion: z.literal(LAYOUT_SCHEMA_VERSION),
  nodes:         z.array(NodeSchema),
  edges:         z.array(EdgeSchema),
  zones:         z.array(ZoneSchema),
  signals:       z.array(SignalSchema),
  switches:      z.array(SwitchSchema),
  textLabels:    z.array(TextLabelSchema).default([]),
  pupitreLabels: z.array(PupitreLabelSchema).default([]),
  routes:        z.record(z.string(), RouteSchema).default({}),
  panelButtons:  z.record(z.string(), PanelButtonSchema).default({}),
});

export type LayoutPayload = z.infer<typeof LayoutPayloadSchema>;

// ─── Migration ────────────────────────────────────────────────────────────────
// Appliquée à la lecture d'un snapshot si son schemaVersion est plus ancien
// que la version courante. On ajoute une branche par bump.

export function migrateLayoutPayload(raw: unknown): LayoutPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Payload invalide : racine non-objet.');
  }
  const r = { ...(raw as Record<string, unknown>) };
  let v = typeof r.schemaVersion === 'number' ? r.schemaVersion : 0;

  // v0 → v1 : premiers exports (sans champ schemaVersion)
  if (v === 0) {
    r.schemaVersion = 1;
    v = 1;
  }

  // Ajouter ici les migrations futures (v1 → v2, etc.)

  if (v !== LAYOUT_SCHEMA_VERSION) {
    throw new Error(`Version de schéma ${v} non supportée (courante : ${LAYOUT_SCHEMA_VERSION}).`);
  }

  return LayoutPayloadSchema.parse(r);
}
