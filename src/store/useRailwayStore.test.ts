import { describe, it, expect, beforeEach } from 'vitest';
import { useRailwayStore } from './useRailwayStore';
import { validateLayout } from '@/lib/validation';

// ─── Reset helper ─────────────────────────────────────────────────────────────

beforeEach(() => {
  useRailwayStore.setState({
    zones: [],
    connections: [],
    signals: [],
    mode: 'select',
    selection: null,
    pendingConnection: null,
  });
});

const s = () => useRailwayStore.getState();

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeZones(n: number) {
  for (let i = 0; i < n; i++) s().addZone(i * 120, 0);
  return s().zones;
}

// ─── Zone CRUD ────────────────────────────────────────────────────────────────

describe('Zone — création', () => {
  it('ajoute une zone avec les propriétés par défaut', () => {
    s().addZone(10, 20);
    const z = s().zones[0];
    expect(z.x).toBe(10);
    expect(z.y).toBe(20);
    expect(z.width).toBe(100);
    expect(z.height).toBe(40);
    expect(z.label).toBe('Zone');
    expect(typeof z.id).toBe('string');
    expect(z.id.length).toBeGreaterThan(0);
  });

  it('sélectionne automatiquement la zone créée', () => {
    s().addZone(0, 0);
    const sel = s().selection;
    expect(sel?.type).toBe('zone');
    expect(sel?.id).toBe(s().zones[0].id);
  });

  it('incrémente le nombre de zones', () => {
    s().addZone(0, 0);
    s().addZone(100, 0);
    expect(s().zones).toHaveLength(2);
  });
});

describe('Zone — modification', () => {
  it('met à jour le libellé', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().updateZone(id, { label: 'Voie principale' });
    expect(s().zones[0].label).toBe('Voie principale');
  });

  it('met à jour la position', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().updateZone(id, { x: 50, y: 75 });
    expect(s().zones[0].x).toBe(50);
    expect(s().zones[0].y).toBe(75);
  });

  it('met à jour la taille', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().updateZone(id, { width: 200, height: 60 });
    expect(s().zones[0].width).toBe(200);
    expect(s().zones[0].height).toBe(60);
  });

  it('ne modifie pas les autres champs lors d\'un patch partiel', () => {
    s().addZone(10, 20);
    const id = s().zones[0].id;
    s().updateZone(id, { label: 'X' });
    const z = s().zones[0];
    expect(z.x).toBe(10);
    expect(z.y).toBe(20);
  });

  it('ignore un updateZone avec un ID inconnu', () => {
    s().addZone(0, 0);
    const before = s().zones[0].label;
    s().updateZone('GHOST', { label: 'Changed' });
    expect(s().zones[0].label).toBe(before);
  });
});

describe('Zone — suppression', () => {
  it('supprime la zone', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().deleteZone(id);
    expect(s().zones).toHaveLength(0);
  });

  it('efface la sélection', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().setSelection({ type: 'zone', id });
    s().deleteZone(id);
    expect(s().selection).toBeNull();
  });

  it('ne supprime pas les autres zones', () => {
    const [za, zb] = makeZones(2);
    s().deleteZone(za.id);
    expect(s().zones).toHaveLength(1);
    expect(s().zones[0].id).toBe(zb.id);
  });

  // ── Cascade ─────────────────────────────────────────────────────────────────

  it('[CASCADE] supprime les connexions reliées', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().deleteZone(za.id);
    expect(s().connections).toHaveLength(0);
  });

  it('[CASCADE] supprime les signaux des connexions reliées', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const connId = s().connections[0].id;
    s().addSignal(connId, 'AtoB', 0.5);
    s().deleteZone(za.id);
    expect(s().connections).toHaveLength(0);
    expect(s().signals).toHaveLength(0);
  });

  it('[CASCADE] supprime uniquement les connexions de la zone ciblée', () => {
    const [za, zb, zc] = makeZones(3);
    s().addConnection(za.id, zb.id);  // à supprimer
    s().addConnection(zb.id, zc.id);  // à conserver
    s().deleteZone(za.id);
    expect(s().connections).toHaveLength(1);
    expect(s().connections[0].fromZoneId).toBe(zb.id);
  });

  it('[CASCADE] supprimer B retire A→B et B→C ainsi que leurs signaux', () => {
    const [za, zb, zc] = makeZones(3);
    s().addConnection(za.id, zb.id);
    s().addConnection(zb.id, zc.id);
    const [connAB, connBC] = s().connections;
    s().addSignal(connAB.id, 'AtoB', 0.5);
    s().addSignal(connBC.id, 'AtoB', 0.5);

    s().deleteZone(zb.id);

    expect(s().zones).toHaveLength(2);
    expect(s().connections).toHaveLength(0);
    expect(s().signals).toHaveLength(0);
  });
});

// ─── Connection CRUD ──────────────────────────────────────────────────────────

describe('Connexion — création', () => {
  it('crée une connexion entre deux zones', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    expect(s().connections).toHaveLength(1);
    expect(s().connections[0].fromZoneId).toBe(za.id);
    expect(s().connections[0].toZoneId).toBe(zb.id);
  });

  it('sélectionne automatiquement la connexion créée', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const sel = s().selection;
    expect(sel?.type).toBe('connection');
    expect(sel?.id).toBe(s().connections[0].id);
  });

  it('empêche les boucles sur soi-même', () => {
    const [za] = makeZones(1);
    s().addConnection(za.id, za.id);
    expect(s().connections).toHaveLength(0);
  });

  it('empêche les doublons A→B', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addConnection(za.id, zb.id);
    expect(s().connections).toHaveLength(1);
  });

  it('empêche les doublons B→A (connexion bidirectionnelle)', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addConnection(zb.id, za.id);
    expect(s().connections).toHaveLength(1);
  });

  it('efface pendingConnection après création', () => {
    const [za, zb] = makeZones(2);
    s().setPendingConnection({ fromZoneId: za.id });
    s().addConnection(za.id, zb.id);
    expect(s().pendingConnection).toBeNull();
  });
});

describe('Connexion — suppression', () => {
  it('supprime la connexion', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const id = s().connections[0].id;
    s().deleteConnection(id);
    expect(s().connections).toHaveLength(0);
  });

  it('efface la sélection', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const id = s().connections[0].id;
    s().setSelection({ type: 'connection', id });
    s().deleteConnection(id);
    expect(s().selection).toBeNull();
  });

  it('[CASCADE] supprime les signaux de la connexion', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const connId = s().connections[0].id;
    s().addSignal(connId, 'AtoB', 0.3);
    s().addSignal(connId, 'BtoA', 0.7);
    s().deleteConnection(connId);
    expect(s().signals).toHaveLength(0);
  });

  it('[CASCADE] ne supprime pas les signaux des autres connexions', () => {
    const [za, zb, zc] = makeZones(3);
    s().addConnection(za.id, zb.id);
    s().addConnection(zb.id, zc.id);
    const [c1, c2] = s().connections;
    s().addSignal(c1.id, 'AtoB', 0.5);
    s().addSignal(c2.id, 'AtoB', 0.5);
    s().deleteConnection(c1.id);
    expect(s().signals).toHaveLength(1);
    expect(s().signals[0].connectionId).toBe(c2.id);
  });
});

// ─── Signal CRUD ──────────────────────────────────────────────────────────────

describe('Signal — création', () => {
  it('crée un signal avec les propriétés correctes', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const connId = s().connections[0].id;
    s().addSignal(connId, 'AtoB', 0.5);
    const sig = s().signals[0];
    expect(sig.connectionId).toBe(connId);
    expect(sig.direction).toBe('AtoB');
    expect(sig.position).toBe(0.5);
    expect(sig.state).toBe('closed');
    expect(sig.label).toBe('S');
  });

  it('sélectionne automatiquement le signal créé', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    expect(s().selection?.type).toBe('signal');
    expect(s().selection?.id).toBe(s().signals[0].id);
  });

  it('accepte la direction BtoA', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'BtoA', 0.5);
    expect(s().signals[0].direction).toBe('BtoA');
  });

  it('clamp la position à 0.1 minimum', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0);
    expect(s().signals[0].position).toBe(0.1);
  });

  it('clamp la position à 0.9 maximum', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 1);
    expect(s().signals[0].position).toBe(0.9);
  });

  it('conserve une position valide inchangée', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.65);
    expect(s().signals[0].position).toBe(0.65);
  });
});

describe('Signal — modification', () => {
  it('change l\'état ouvert/fermé', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().updateSignal(id, { state: 'open' });
    expect(s().signals[0].state).toBe('open');
  });

  it('change le sens de circulation', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().updateSignal(id, { direction: 'BtoA' });
    expect(s().signals[0].direction).toBe('BtoA');
  });

  it('change la position', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().updateSignal(id, { position: 0.75 });
    expect(s().signals[0].position).toBe(0.75);
  });
});

describe('Signal — suppression', () => {
  it('supprime le signal', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().deleteSignal(id);
    expect(s().signals).toHaveLength(0);
  });

  it('efface la sélection', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().setSelection({ type: 'signal', id });
    s().deleteSignal(id);
    expect(s().selection).toBeNull();
  });

  it('ne supprime pas les autres signaux', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const connId = s().connections[0].id;
    s().addSignal(connId, 'AtoB', 0.3);
    s().addSignal(connId, 'BtoA', 0.7);
    const [s1, s2] = s().signals;
    s().deleteSignal(s1.id);
    expect(s().signals).toHaveLength(1);
    expect(s().signals[0].id).toBe(s2.id);
  });
});

// ─── Switch ───────────────────────────────────────────────────────────────────
// Not yet implemented in V1. Tests documentent le comportement attendu.

describe('Switch (aiguille) — non implémenté en V1', () => {
  it.todo('crée un switch sur une connexion avec branche de déviation');
  it.todo('supprime un switch');
  it.todo('supprime les switches lors de la suppression de leur connexion');
  it.todo('supprime les switches lors de la suppression d\'une zone reliée');
  it.todo('change l\'état droit/dévié d\'un switch');
});

// ─── Sélection ────────────────────────────────────────────────────────────────

describe('Sélection d\'objet', () => {
  it('sélectionne une zone', () => {
    s().addZone(0, 0);
    const id = s().zones[0].id;
    s().setSelection({ type: 'zone', id });
    expect(s().selection).toEqual({ type: 'zone', id });
  });

  it('sélectionne une connexion', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    const id = s().connections[0].id;
    s().setSelection({ type: 'connection', id });
    expect(s().selection).toEqual({ type: 'connection', id });
  });

  it('sélectionne un signal', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const id = s().signals[0].id;
    s().setSelection({ type: 'signal', id });
    expect(s().selection).toEqual({ type: 'signal', id });
  });

  it('efface la sélection', () => {
    s().addZone(0, 0);
    s().setSelection({ type: 'zone', id: s().zones[0].id });
    s().setSelection(null);
    expect(s().selection).toBeNull();
  });

  it('setMode efface sélection et pendingConnection', () => {
    s().addZone(0, 0);
    s().setSelection({ type: 'zone', id: s().zones[0].id });
    s().setPendingConnection({ fromZoneId: s().zones[0].id });
    s().setMode('addZone');
    expect(s().selection).toBeNull();
    expect(s().pendingConnection).toBeNull();
  });
});

// ─── Unicité des IDs ──────────────────────────────────────────────────────────

describe('Unicité des IDs', () => {
  it('génère des IDs uniques pour 200 zones créées en rafale', () => {
    for (let i = 0; i < 200; i++) s().addZone(i, i);
    const ids = s().zones.map(z => z.id);
    expect(new Set(ids).size).toBe(200);
  });

  it('génère des IDs uniques entre zones, connexions et signaux', () => {
    const [za, zb, zc] = makeZones(3);
    s().addConnection(za.id, zb.id);
    s().addConnection(zb.id, zc.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    s().addSignal(s().connections[1].id, 'AtoB', 0.5);

    const all = [
      ...s().zones.map(z => z.id),
      ...s().connections.map(c => c.id),
      ...s().signals.map(sig => sig.id),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});

// ─── Immutabilité — aucune mutation illégale ──────────────────────────────────

describe('Immutabilité du state', () => {
  it('addZone crée une nouvelle référence de tableau', () => {
    const ref = s().zones;
    s().addZone(0, 0);
    expect(s().zones).not.toBe(ref);
    expect(ref).toHaveLength(0); // original non muté
  });

  it('updateZone crée un nouvel objet zone', () => {
    s().addZone(0, 0);
    const original = s().zones[0];
    s().updateZone(original.id, { label: 'Modifié' });
    const updated = s().zones[0];
    expect(updated).not.toBe(original);        // nouvelle référence
    expect(original.label).toBe('Zone');        // original inchangé
    expect(updated.label).toBe('Modifié');
  });

  it('deleteZone crée une nouvelle référence de tableau', () => {
    s().addZone(0, 0);
    const ref = s().zones;
    s().deleteZone(s().zones[0].id);
    expect(s().zones).not.toBe(ref);
  });

  it('addConnection crée une nouvelle référence de tableau', () => {
    const [za, zb] = makeZones(2);
    const ref = s().connections;
    s().addConnection(za.id, zb.id);
    expect(s().connections).not.toBe(ref);
    expect(ref).toHaveLength(0);
  });

  it('updateSignal crée un nouvel objet signal', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const original = s().signals[0];
    s().updateSignal(original.id, { state: 'open' });
    expect(s().signals[0]).not.toBe(original);
    expect(original.state).toBe('closed'); // original inchangé
  });
});

// ─── Persistance ─────────────────────────────────────────────────────────────

describe('Persistance (export/import)', () => {
  it('exporte un JSON parseable', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);
    const json = s().exportLayout();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('loadLayout remplace intégralement l\'état', () => {
    makeZones(3);
    s().loadLayout({
      zones: [{ id: 'z99', label: 'Importée', x: 0, y: 0, width: 100, height: 40 }],
      connections: [],
      signals: [],
    });
    expect(s().zones).toHaveLength(1);
    expect(s().zones[0].id).toBe('z99');
    expect(s().connections).toHaveLength(0);
    expect(s().signals).toHaveLength(0);
  });

  it('loadLayout passe en mode select et efface la sélection', () => {
    s().setMode('addZone');
    s().addZone(0, 0);
    s().loadLayout({ zones: [], connections: [], signals: [] });
    expect(s().mode).toBe('select');
    expect(s().selection).toBeNull();
  });

  it('un export suivi d\'un import restitue les mêmes données', () => {
    const [za, zb] = makeZones(2);
    s().addConnection(za.id, zb.id);
    s().addSignal(s().connections[0].id, 'AtoB', 0.5);

    const exported = s().exportLayout();
    s().loadLayout({ zones: [], connections: [], signals: [] });

    const result = validateLayout(exported);
    expect(result.fatalError).toBeUndefined();
    s().loadLayout(result.data);

    expect(s().zones).toHaveLength(2);
    expect(s().connections).toHaveLength(1);
    expect(s().signals).toHaveLength(1);
  });
});
