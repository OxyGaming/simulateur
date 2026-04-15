import type {
  Node, Edge, Zone, Signal, Switch, TextLabel,
  PupitreLabel, Route, PanelButton, RouteInterlockingState, Train,
  ReflexionDevice,
} from './railway';
import type { CanFormResult } from '@/lib/interlocking';

// ─── Trainer → Learner : snapshot complet de l'état simulé ───────────────────

export interface SyncSnapshot {
  // Topologie (modifiée par le formateur en mode édition)
  nodes:         Node[];
  edges:         Edge[];
  zones:         Zone[];
  signals:       Signal[];
  switches:      Switch[];
  textLabels:    TextLabel[];
  pupitreLabels: PupitreLabel[];
  routes:        Record<string, Route>;
  panelButtons:  Record<string, PanelButton>;

  // État runtime (change à chaque tick de simulation)
  trains:                  Train[];
  routeInterlockingStates: Record<string, RouteInterlockingState>;
  conflictDetails:         Record<string, CanFormResult>;
  blinkPhase:              boolean;
  diAlarmActive:           boolean;
  diIndicatorPos:          { x: number; y: number };
}

export interface SyncStateEvent {
  seq:      number;  // numéro de séquence monotone (détection de pertes)
  snapshot: SyncSnapshot;
}

// ─── Learner → Trainer : actions de l'apprenant ───────────────────────────────

export type LearnerAction =
  | { type: 'pressButton';      buttonId: string }
  | { type: 'updateReflexion';  buttonId: string; reflexions: ReflexionDevice[] };

export interface LearnerActionEvent {
  seq:    number;
  action: LearnerAction;
}
