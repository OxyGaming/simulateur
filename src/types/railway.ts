// ─── Core domain types ────────────────────────────────────────────────────────

export interface LabelOffset {
  x: number;
  y: number;
}

/** Topology node — junction point on the track graph. */
export interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
  labelOffset: LabelOffset;
  hidden?: boolean;
  labelHidden?: boolean;
}

/** Track segment between two nodes (the physical rail). */
export interface Edge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  /** Perpendicular offset (px) of the bezier control point. 0 = straight. */
  curveOffset?: number;
}

/** Logical track section / CDV — aggregate of one or more edges. */
export interface Zone {
  id: string;
  label: string;
  edgeIds: string[];
  labelOffset: LabelOffset;
  /**
   * Simulates any cause of relay drop: manual block, unmodelled train, CDV fault.
   * Effective occupation = occupiedManual || train physically on zone's edges.
   */
  occupiedManual: boolean;
  /** CDV fault — relay dropped without train. Annulation possible. Distinct from occupiedManual (manual block). */
  derangement: boolean;
  /**
   * Ann. Zone — EE neutralized for interlocking.
   * Only meaningful when derangement=true.
   * Does NOT remove visual occupation — zone still appears occupied.
   */
  annulled: boolean;
}

/**
 * Signal states:
 * - 'open'            : signal open, no approach train present
 * - 'maintained_open' : signal open AND held by E.Ap (train in approach zone)
 *                       Cannot be closed until E.Ap releases or DMT completes.
 * - 'closed'          : signal closed
 */
export type SignalState = 'open' | 'maintained_open' | 'closed';
export type SignalDirection = 'AtoB' | 'BtoA';

/** Lineside signal placed on a track edge. */
export interface Signal {
  id: string;
  edgeId: string;
  direction: SignalDirection;
  /** Position along the edge: 0 = fromNode side, 1 = toNode side. */
  position: number;
  state: SignalState;
  label: string;
  labelOffset: LabelOffset;
  /** Drag offset applied to the ZAp/EAp indicator group. */
  zapEapOffset?: LabelOffset;
}

/** Point machine (aiguille) sitting on a topology node. */
export interface Switch {
  id: string;
  name: string;
  nodeId: string;
  entryEdgeId: string | null;
  straightEdgeId: string | null;
  divergingEdgeId: string | null;
  position: 'straight' | 'diverging';
  locked: boolean;
  labelOffset: LabelOffset;
  /**
   * The zone physically covering this switch (zone propre / zone isolée d'aiguille).
   * Physical fact — not route-dependent.
   * When occupied: prevents formation of any incompatible route through this switch.
   */
  zonePropreId: string | null;
  /**
   * Discordance d'aiguille — perte de contrôle de position par branche.
   *
   * discordanceStraight  : le relais de contrôle de la branche directe a chuté.
   *   → CIA échoue pour tout itinéraire requérant position='straight' sur cette aiguille.
   *   → Les itinéraires en branche déviée fonctionnent normalement.
   *
   * discordanceDiverging : le relais de contrôle de la branche déviée a chuté.
   *   → CIA échoue pour tout itinéraire requérant position='diverging'.
   *   → Les itinéraires en branche directe fonctionnent normalement.
   *
   * Les deux actifs simultanément : position indéterminée — tous itinéraires en CIA.
   * (Fiches 306.1 / 306.4)
   */
  discordanceStraight: boolean;
  discordanceDiverging: boolean;
}

export interface TextLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
}

// ─── Route + Pupitre PRS ─────────────────────────────────────────────────────

/**
 * État visible d'un bouton pupitre.
 *
 * idle          — bouton au repos
 * forming       — formation en cours (clignotement, délai avant activation)
 * active        — itinéraire formé et actif
 * conflict      — refus permanent (conflit d'itinéraire ou aiguille verrouillée hors route active)
 * registered    — enregistrement : attente d'une route active qui libérera les tronçons (DA en cours)
 * overregistered — surenregistrement : attente d'une aiguille verrouillée par une route active
 *                  (sera libérée par la libération progressive du transit)
 */
export type ButtonState = 'idle' | 'forming' | 'active' | 'conflict' | 'registered' | 'overregistered';

/**
 * Role(s) a zone plays within a specific route.
 *
 * ZP       — Zone de Protection: blocks signal opening if occupied.
 *            Fault procedure: mandatory field recognition.
 * ZEA      — Zone d'Espacement Automatique: same blocking effect.
 *            Fault procedure: no field recognition required.
 * approche — Zone d'Approche: occupation triggers E.Ap (immobilises DM).
 *            Route-specific: sélection d'approche means the same zone may
 *            be in the approach zone for one route but not another.
 * transit  — Zone de transit: locked for the duration of the route;
 *            progressively released as the train clears each zone in order.
 *
 * A single zone may carry multiple roles simultaneously in the same route
 * (e.g. ['ZEA', 'transit'] or ['approche', 'transit']).
 * The same zone may have different roles in different routes.
 */
export type ZoneRole = 'ZP' | 'ZEA' | 'approche' | 'transit';

export interface RouteZoneCondition {
  zoneId: string;
  roles: ZoneRole[];
  /**
   * Required when roles includes 'transit'.
   * 1-based position in the transit sequence — determines the order in which
   * zones are progressively released as the train traverses the route.
   */
  transitIndex?: number;
}

/** Logique métier pure d'un itinéraire — sans état UI */
export interface Route {
  id: string;
  /** Zone d'origine (CDV de départ) */
  fromZoneId?: string;
  /** Zone terminus (CDV d'arrivée) */
  toZoneId?: string;
  /** Tronçons composant l'itinéraire */
  edgeIds: string[];
  /** Position souhaitée pour chaque aiguille traversée */
  switchPositions: Record<string, 'straight' | 'diverging'>;
  /** Signaux à ouvrir à l'activation */
  signalIds: string[];
  /**
   * Zone conditions for this route.
   * Carries all role metadata (ZP, ZEA, approche, transit).
   * A zone absent from this list plays no interlocking role in this route.
   */
  zoneConditions: RouteZoneCondition[];
  /**
   * Type d'itinéraire PRS.
   *
   * DA (Destruction Automatique) — comportement par défaut :
   *   l'itinéraire se libère progressivement avec le passage du train
   *   et est détruit automatiquement en fin de parcours.
   *
   * TP (Tracé Permanent) — l'itinéraire reste maintenu de bout en bout :
   *   pas de destruction automatique, aiguilles verrouillées, signal peut
   *   se refermer puis se rouvrir automatiquement dès que les conditions
   *   (ZP/ZEA libres) sont de nouveau réunies.
   *
   * Omis = équivalent DA (rétrocompatibilité).
   */
  routeType?: 'DA' | 'TP';
}

/**
 * Runtime execution state of an active route.
 *
 * Stores only what cannot be recomputed from Route + current zone occupations
 * + train positions — i.e. information with hysteresis.
 *
 * Must never duplicate route definition data (zone roles, switch positions,
 * signal IDs). Those always come from Route.
 *
 * Reset to initial values when the route returns to 'idle'.
 */
export interface RouteInterlockingState {
  routeId: string;
  buttonState: ButtonState;

  /** Timestamp (ms) when 'forming' started — for auto-activation timer. */
  formingStartTime: number | null;

  /**
   * E.Pa — Enclenchement de Parcours.
   *
   * Set to true when the route is activated (signal opens).
   * While true:
   *   - All switches in route.switchPositions remain locked (sw.locked = true).
   *   - Manual repositioning of those switches is blocked.
   * Cleared only when the route returns to 'idle' (DA or DM).
   */
  EPA_active: boolean;

  /**
   * E.Ap — Enclenchement d'Approche.
   *
   * True while a train occupies the approach zone of this route.
   * Recomputed whenever zone occupation changes (toggleZoneOccupied, train move).
   *
   * While true:
   *   - Normal route destruction (pressButton active→idle) is blocked.
   *   - The signal must remain open.
   * Release path: zone clears naturally, or DMT procedure (future step).
   */
  EAP_active: boolean;

  /**
   * Transit progress: IDs of transit zones already cleared by the train,
   * in traversal order. Has hysteresis: a cleared zone stays cleared even
   * if the train were to reverse.
   */
  transitCleared: string[];

  /**
   * Destruction Manuelle state.
   * DM requires two operator gestures separated by a mandatory delay.
   */
  DM_startTime: number | null;   // timestamp of the first DM gesture
  DM_confirmed: boolean;          // true after the second gesture
}

/**
 * Dispositif de réflexion apposé sur un bouton pupitre.
 * Aide-mémoire visuel : l'agent pose ces pastilles pour s'interdire une action.
 * N'empêche pas techniquement le bouton de fonctionner.
 *
 * slot  : 0-2 = rangée haute (gauche→droite), 3-5 = rangée basse (gauche→droite)
 * type  : DA = rouge · DSA = bleu · DR = jaune
 */
export type ReflexionType = 'DA' | 'DSA' | 'DR';
export interface ReflexionDevice {
  slot: number;
  type: ReflexionType;
}

/** Bouton physique du pupitre PRS */
export interface PanelButton {
  id: string;
  label: string;
  /** Type : bouton d'itinéraire (route), fermeture de contrôle (fc) ou annulateur */
  type: 'route' | 'fc' | 'annulateur';
  /** Identifiant de la route associée — uniquement pour type='route' */
  routeId: string | null;
  /** Signal bloqué par ce bouton FC — uniquement pour type='fc' */
  fcSignalId: string | null;
  /** Zones CDV annulées par ce bouton — uniquement pour type='annulateur' */
  annulateurZoneIds: string[];
  /** Position dans la grille pupitre (vue formateur) */
  col: number;
  row: number;
  state: ButtonState;
  /** Dispositifs de réflexion apposés sur ce bouton (0 à 6). */
  reflexions: ReflexionDevice[];
  /** Position et taille libres dans la vue apprenante (px). */
  learnerX?: number;
  learnerY?: number;
  learnerW?: number;
  learnerH?: number;
}

/**
 * Plaque d'identification — étiquette rectangulaire libre dans la vue apprenante.
 * Fond blanc, texte noir, bordure noire — comme les plaques physiques d'un vrai pupitre PRS.
 */
export interface PupitreLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── UI state ─────────────────────────────────────────────────────────────────

export type EditorMode =
  | 'select'
  | 'addNode'    // place a topology node           (Z)
  | 'addEdge'    // connect two nodes with an edge  (C)
  | 'addSignal'  // place a signal on an edge       (S)
  | 'addSwitch'  // place a switch on a node        (A)
  | 'addText'    // free text annotation            (T)
  | 'editZone'   // assign edges to CDV zones       (W)
  | 'addTrain';  // place simulation train on edge  (X)

// ─── Train simulation ─────────────────────────────────────────────────────────

export type TrainState = 'running' | 'waiting_signal' | 'blocked' | 'terminated';

export interface Train {
  id: string;
  number: string;
  edgeId: string;
  /** Position along the edge: 0 = fromNode side, 1 = toNode side */
  t: number;
  direction: SignalDirection;
  state: TrainState;
  /** Units of t per second */
  speed: number;
  /** True when the simulation is actively advancing this train. */
  running: boolean;
  /**
   * Autorisations de Franchissement accordées par l'agent.
   * Liste des IDs de signaux que ce train est autorisé à franchir sans s'arrêter,
   * même si le signal est fermé. Chaque autorisation est consommée au franchissement.
   */
  afSignalIds: string[];
}

export type SelectedObject =
  | { type: 'node';      id: string }
  | { type: 'edge';      id: string }
  | { type: 'zone';      id: string }
  | { type: 'signal';    id: string }
  | { type: 'switch';    id: string }
  | { type: 'textLabel'; id: string }
  | null;
