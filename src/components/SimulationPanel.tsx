'use client';
import { useEffect, useRef, useState } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { Train, TrainState } from '@/types/railway';

const TICK_MS = 50;

const STATE_COLOR: Record<TrainState, string> = {
  running:        '#22d3ee',
  waiting_signal: '#f59e0b',
  blocked:        '#ef4444',
  terminated:     '#475569',
};

const STATE_LABEL: Record<TrainState, string> = {
  running:        '▶ En marche',
  waiting_signal: '⏸ Signal fermé',
  blocked:        '✕ Bloqué',
  terminated:     '⬛ Terminé',
};

function TrainRow({ train }: { train: Train }) {
  const signals          = useRailwayStore(s => s.signals);
  const removeTrain      = useRailwayStore(s => s.removeTrain);
  const startSimulation  = useRailwayStore(s => s.startSimulation);
  const stopSimulation   = useRailwayStore(s => s.stopSimulation);
  const setTrainNumber   = useRailwayStore(s => s.setTrainNumber);
  const setTrainDirection= useRailwayStore(s => s.setTrainDirection);
  const setTrainSpeed    = useRailwayStore(s => s.setTrainSpeed);
  const grantAF          = useRailwayStore(s => s.grantAF);
  const revokeAF         = useRailwayStore(s => s.revokeAF);

  const [selectedSigId, setSelectedSigId] = useState<string>('');

  const af        = train.afSignalIds ?? [];
  const available = signals.filter(s => !af.includes(s.id));
  const effectiveSelected = available.find(s => s.id === selectedSigId)
    ? selectedSigId
    : (available[0]?.id ?? '');

  return (
    <div style={styles.trainCard}>
      <div style={styles.trainHeader}>
        <span style={{ color: '#22d3ee', fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>
          Train N° {train.number}
        </span>
        <span style={{ ...styles.stateTag, color: STATE_COLOR[train.state] }}>
          {STATE_LABEL[train.state]}
        </span>
        <button onClick={() => removeTrain(train.id)} style={styles.removeBtn} title="Supprimer">✕</button>
      </div>

      <div style={styles.controls}>
        {/* Number */}
        <label style={styles.label}>
          N°&nbsp;
          <input
            type="text"
            value={train.number}
            onChange={e => setTrainNumber(train.id, e.target.value)}
            style={styles.input}
            maxLength={6}
          />
        </label>

        {/* Direction */}
        <label style={styles.label}>
          Dir.&nbsp;
          <select
            value={train.direction}
            onChange={e => setTrainDirection(train.id, e.target.value as 'AtoB' | 'BtoA')}
            style={styles.select}
          >
            <option value="AtoB">A → B</option>
            <option value="BtoA">B → A</option>
          </select>
        </label>

        {/* Speed */}
        <label style={styles.label}>
          Vitesse&nbsp;
          <input
            type="range" min={0.01} max={0.4} step={0.01}
            value={train.speed}
            onChange={e => setTrainSpeed(train.id, parseFloat(e.target.value))}
            style={{ width: 72, accentColor: '#22d3ee' }}
          />
        </label>

        {/* Start / Pause */}
        <button
          onClick={() => train.running ? stopSimulation(train.id) : startSimulation(train.id)}
          disabled={train.state === 'blocked' || train.state === 'terminated'}
          style={{
            ...styles.btn,
            background: train.running ? '#7c2d12' : '#14532d',
            color:      train.running ? '#fca5a5' : '#86efac',
            opacity:    (train.state === 'blocked' || train.state === 'terminated') ? 0.4 : 1,
          }}
        >
          {train.running ? '⏸ Pause' : '▶ Démarrer'}
        </button>
      </div>

      {/* AF section */}
      <div style={styles.afSection}>
        <div style={styles.afTitle}>Autorisations de Franchissement (AF)</div>
        <div style={styles.afRow}>
          <select
            value={effectiveSelected}
            onChange={e => setSelectedSigId(e.target.value)}
            style={styles.afSelect}
            disabled={available.length === 0}
          >
            {available.length === 0
              ? <option value="">— tous les signaux ont une AF —</option>
              : available.map(sig => (
                  <option key={sig.id} value={sig.id}>{sig.label || sig.id}</option>
                ))
            }
          </select>
          <button
            onClick={() => { const id = effectiveSelected; if (id) { grantAF(train.id, id); setSelectedSigId(''); } }}
            disabled={!effectiveSelected}
            style={{ ...styles.afBtn, opacity: effectiveSelected ? 1 : 0.4 }}
          >
            + Accorder
          </button>
        </div>
        {af.length > 0 && (
          <div style={styles.afList}>
            {af.map(sigId => {
              const sig = signals.find(s => s.id === sigId);
              return (
                <div key={sigId} style={styles.afChip}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{sig?.label || sigId}</span>
                  <button onClick={() => revokeAF(train.id, sigId)} style={styles.afRevoke} title="Révoquer">✕</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function SimulationPanel() {
  const trains           = useRailwayStore(s => s.trains);
  const mode             = useRailwayStore(s => s.mode);
  const setMode          = useRailwayStore(s => s.setMode);
  const tickSimulation   = useRailwayStore(s => s.tickSimulation);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const anyRunning = trains.some(t => t.running);

  useEffect(() => {
    if (anyRunning) {
      intervalRef.current = setInterval(() => tickSimulation(TICK_MS / 1000), TICK_MS);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyRunning]);

  if (trains.length === 0 && mode !== 'addTrain') return null;

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>◈ SIMULATION TRAIN</span>
        {mode === 'addTrain' ? (
          <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>
            Cliquez sur un tronçon pour placer le train…
          </span>
        ) : (
          <button
            onClick={() => setMode('addTrain')}
            style={styles.addBtn}
          >
            + Ajouter un train
          </button>
        )}
      </div>

      {trains.map(train => <TrainRow key={train.id} train={train} />)}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flexShrink: 0,
    background: '#080e1a',
    borderTop: '1px solid #1e293b',
    padding: '7px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 'min(320px, 40vh)',
    overflowY: 'auto',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    position: 'sticky', top: 0, background: '#080e1a', zIndex: 1, paddingBottom: 4,
  },
  title: {
    color: '#22d3ee', fontWeight: 700, fontSize: 11,
    fontFamily: 'monospace', letterSpacing: 1,
  },
  addBtn: {
    background: '#0c1a2e', border: '1px solid #1e3a5f', borderRadius: 4,
    cursor: 'pointer', color: '#4a90d9', fontSize: 11,
    padding: '3px 8px', fontFamily: 'monospace',
  },
  trainCard: {
    background: '#0d1625', border: '1px solid #1e293b', borderRadius: 6,
    padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6,
  },
  trainHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  removeBtn: {
    marginLeft: 'auto',
    background: '#1a0a0a', border: '1px solid #7f1d1d', borderRadius: 4,
    cursor: 'pointer', color: '#f87171', fontSize: 11,
    padding: '2px 6px', fontFamily: 'monospace',
  },
  controls: {
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  label: {
    display: 'flex', alignItems: 'center',
    color: '#64748b', fontSize: 11, fontFamily: 'monospace',
  },
  input: {
    width: 44, background: '#1e293b', border: '1px solid #334155',
    borderRadius: 3, color: 'white', fontSize: 11, padding: '2px 5px',
  },
  select: {
    background: '#1e293b', border: '1px solid #334155',
    borderRadius: 3, color: 'white', fontSize: 11, padding: '2px 4px',
  },
  stateTag: {
    fontSize: 11, fontFamily: 'monospace', fontWeight: 700,
  },
  btn: {
    padding: '4px 14px', borderRadius: 4, border: 'none',
    cursor: 'pointer', fontSize: 11, fontWeight: 700,
    fontFamily: 'monospace',
  },
  afSection: {
    borderTop: '1px solid #1e293b',
    paddingTop: 6,
    display: 'flex', flexDirection: 'column', gap: 4,
  },
  afTitle: {
    color: '#7c3aed', fontSize: 10, fontFamily: 'monospace',
    fontWeight: 700, letterSpacing: 0.5,
  },
  afRow: {
    display: 'flex', alignItems: 'center', gap: 6,
  },
  afSelect: {
    flex: 1, background: '#1e293b', border: '1px solid #334155',
    borderRadius: 3, color: 'white', fontSize: 11, padding: '3px 5px',
  },
  afBtn: {
    padding: '3px 10px', borderRadius: 4,
    border: '1px solid #7c3aed', background: '#3b0764',
    color: '#c4b5fd', fontSize: 11, cursor: 'pointer',
    fontFamily: 'monospace', whiteSpace: 'nowrap',
  },
  afList: {
    display: 'flex', flexWrap: 'wrap', gap: 5,
  },
  afChip: {
    display: 'flex', alignItems: 'center', gap: 5,
    background: '#2e1065', border: '1px solid #7c3aed',
    borderRadius: 12, padding: '2px 8px',
    color: '#c4b5fd',
  },
  afRevoke: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#a78bfa', fontSize: 10, padding: 0, lineHeight: 1,
  },
};
