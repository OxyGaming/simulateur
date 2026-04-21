'use client';
import { useEffect, useRef, useState } from 'react';
import { useRailwayStore, DMT_DELAY_MS } from '@/store/useRailwayStore';
import { PanelButton, PupitreLabel, ButtonState, ReflexionDevice, ReflexionType } from '@/types/railway';
import { CanFormResult } from '@/lib/interlocking';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_BTN_W    = 72;
const DEFAULT_BTN_H    = 72;
const DEFAULT_GAP      = 10;
const DEFAULT_COLS     = 8;
const MIN_BTN_SIZE     = 40;
const MIN_LABEL_W      = 40;
const MIN_LABEL_H      = 20;
const ACTIVATION_DELAY = 2500;
const BLINK_INTERVAL   =  500;

// ─── Button colors (mirrors PupitrePanel) ─────────────────────────────────────

const ROUTE_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1e293b', border: '#334155',  text: '#64748b' },
  forming:        { bg: '#422006', border: '#d97706',  text: '#fcd34d' },
  active:         { bg: '#1a3a1a', border: '#16a34a',  text: '#4ade80' },
  conflict:       { bg: '#450a0a', border: '#dc2626',  text: '#fca5a5' },
  registered:     { bg: '#1a1500', border: '#ca8a04',  text: '#fbbf24' },
  overregistered: { bg: '#001a1a', border: '#0891b2',  text: '#67e8f9' },
};
const FC_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  forming:        { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  active:         { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  conflict:       { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  registered:     { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
  overregistered: { bg: '#1a0a1a', border: '#581c87', text: '#7c3aed' },
};
const ANN_COLORS: Record<ButtonState, { bg: string; border: string; text: string }> = {
  idle:           { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  forming:        { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  active:         { bg: '#422006', border: '#f59e0b', text: '#fcd34d' },
  conflict:       { bg: '#450a0a', border: '#dc2626', text: '#fca5a5' },
  registered:     { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
  overregistered: { bg: '#1a1400', border: '#854d0e', text: '#a16207' },
};
const REFLEXION_COLORS: Record<ReflexionType, string> = {
  DA: '#dc2626', DSA: '#3b82f6', DR: '#fbbf24',
};
const REFLEXION_CYCLE: (ReflexionType | null)[] = [null, 'DA', 'DSA', 'DR'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Default learner position based on grid col/row when not yet explicitly placed. */
function defaultPos(btn: PanelButton) {
  const col = btn.col ?? 0;
  const row = btn.row ?? 0;
  return {
    x: col * (DEFAULT_BTN_W + DEFAULT_GAP) + DEFAULT_GAP,
    y: row * (DEFAULT_BTN_H + DEFAULT_GAP) + DEFAULT_GAP,
    w: DEFAULT_BTN_W,
    h: DEFAULT_BTN_H,
  };
}

function btnPos(btn: PanelButton) {
  const d = defaultPos(btn);
  return {
    x: btn.learnerX ?? d.x,
    y: btn.learnerY ?? d.y,
    w: btn.learnerW ?? d.w,
    h: btn.learnerH ?? d.h,
  };
}

// ─── Drag state ───────────────────────────────────────────────────────────────

type DragState =
  | { kind: 'move-btn';    id: string; startMX: number; startMY: number; origX: number; origY: number }
  | { kind: 'resize-btn';  id: string; startMX: number; startMY: number; origW: number; origH: number }
  | { kind: 'move-lbl';    id: string; startMX: number; startMY: number; origX: number; origY: number }
  | { kind: 'resize-lbl';  id: string; startMX: number; startMY: number; origW: number; origH: number }
  | null;

// ─── Resize handle ────────────────────────────────────────────────────────────

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={e => { e.stopPropagation(); onMouseDown(e); }}
      style={{
        position: 'absolute', bottom: 0, right: 0,
        width: 12, height: 12, cursor: 'se-resize',
        background: 'transparent',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
        zIndex: 10,
      }}
    >
      <svg width={10} height={10} viewBox="0 0 10 10">
        <line x1="10" y1="0" x2="0" y2="10" stroke="#64748b" strokeWidth={1.5} />
        <line x1="10" y1="4" x2="4" y2="10" stroke="#64748b" strokeWidth={1.5} />
        <line x1="10" y1="8" x2="8" y2="10" stroke="#64748b" strokeWidth={1.5} />
      </svg>
    </div>
  );
}

// ─── Inline text edit for plaques ─────────────────────────────────────────────

function EditableLabel({
  text, onSave, style,
}: { text: string; onSave: (v: string) => void; style?: React.CSSProperties }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(text);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);
  useEffect(() => { setVal(text); }, [text]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { onSave(val); setEditing(false); }}
        onKeyDown={e => { if (e.key === 'Enter') { onSave(val); setEditing(false); } }}
        style={{
          width: '100%', height: '100%',
          border: 'none', outline: 'none',
          background: 'transparent',
          textAlign: 'center',
          fontSize: 'inherit', fontFamily: 'inherit', fontWeight: 'inherit',
          color: 'inherit', cursor: 'text',
          padding: 0, boxSizing: 'border-box',
          ...style,
        }}
        onClick={e => e.stopPropagation()}
      />
    );
  }
  return (
    <span
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      style={{ cursor: 'text', userSelect: 'none', ...style }}
    >
      {text || '—'}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LearnerPupitreCanvas({
  disableActivation  = false,
  onSyncButtonPress,
}: {
  disableActivation?:  boolean;
  /** En mode synchronisé : appelé à la place du pressButton local. */
  onSyncButtonPress?:  (buttonId: string) => void;
} = {}) {
  const panelButtons          = useRailwayStore(s => s.panelButtons);
  const pupitreLabels         = useRailwayStore(s => s.pupitreLabels);
  const blinkPhase            = useRailwayStore(s => s.blinkPhase);
  const conflictDetails       = useRailwayStore(s => s.conflictDetails);
  const routeInterlockingStates = useRailwayStore(s => s.routeInterlockingStates);
  const pressButton           = useRailwayStore(s => s.pressButton);
  const activateButton        = useRailwayStore(s => s.activateButton);
  const toggleBlinkPhase      = useRailwayStore(s => s.toggleBlinkPhase);
  const updatePanelButton     = useRailwayStore(s => s.updatePanelButton);
  const addPupitreLabel       = useRailwayStore(s => s.addPupitreLabel);
  const updatePupitreLabel    = useRailwayStore(s => s.updatePupitreLabel);
  const deletePupitreLabel    = useRailwayStore(s => s.deletePupitreLabel);
  const testZoneActive        = useRailwayStore(s => s.testZoneActive);
  const setTestZoneActive     = useRailwayStore(s => s.setTestZoneActive);
  const testAiguilleActive    = useRailwayStore(s => s.testAiguilleActive);
  const setTestAiguilleActive = useRailwayStore(s => s.setTestAiguilleActive);

  const [arrangeMode, setArrangeMode] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const drag = useRef<DragState>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Activation timer (mirrors PupitrePanel) ────────────────────────────────
  // En mode synchronisé (disableActivation=true), c'est le formateur qui gère
  // le timer via PupitrePanel et diffuse le résultat — on évite le double timer.
  useEffect(() => {
    if (disableActivation) {
      // Annuler tout timer en cours si on passe en mode sync
      Object.keys(timersRef.current).forEach(id => { clearTimeout(timersRef.current[id]); delete timersRef.current[id]; });
      return;
    }
    const formingIds = new Set(
      Object.values(panelButtons)
        .filter(b => b.state === 'forming' && b.type !== 'fc')
        .map(b => b.id)
    );
    Object.keys(timersRef.current).forEach(id => {
      if (!formingIds.has(id)) { clearTimeout(timersRef.current[id]); delete timersRef.current[id]; }
    });
    formingIds.forEach(id => {
      if (!timersRef.current[id]) {
        timersRef.current[id] = setTimeout(() => { delete timersRef.current[id]; activateButton(id); }, ACTIVATION_DELAY);
      }
    });
  }, [panelButtons, activateButton, disableActivation]);

  // ── Blink timer ────────────────────────────────────────────────────────────
  const hasForming = Object.values(panelButtons).some(
    b => b.state === 'forming' || b.state === 'registered' || b.state === 'overregistered',
  );
  useEffect(() => {
    if (!hasForming) return;
    const interval = setInterval(toggleBlinkPhase, BLINK_INTERVAL);
    return () => clearInterval(interval);
  }, [hasForming, toggleBlinkPhase]);

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setCanvasZoom(prev => Math.min(3, Math.max(0.3, prev * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ── Button click : local ou direct-vers-formateur ─────────────────────────
  // En mode synchronisé on NE modifie PAS le store local : on envoie directement
  // l'action au formateur et on attend son snapshot pour mettre à jour l'affichage.
  // Cela évite qu'un snapshot périmé du formateur (keepalive) écrase l'état
  // 'forming' local et incite l'utilisateur à recliquer → double pressButton →
  // annulation involontaire de l'itinéraire côté formateur.
  function handleButtonClick(buttonId: string) {
    if (onSyncButtonPress) { onSyncButtonPress(buttonId); }
    else                   { pressButton(buttonId); }
  }

  // Reflexion cycling (same as PupitrePanel)
  function cycleReflexion(btnId: string, slot: number) {
    const btn = panelButtons[btnId];
    if (!btn) return;
    const reflexions: ReflexionDevice[] = btn.reflexions ?? [];
    const existing = reflexions.find(r => r.slot === slot);
    const currentIdx = existing ? REFLEXION_CYCLE.indexOf(existing.type) : 0;
    const nextType = REFLEXION_CYCLE[(currentIdx + 1) % REFLEXION_CYCLE.length];
    const newReflexions: ReflexionDevice[] = nextType === null
      ? reflexions.filter(r => r.slot !== slot)
      : [...reflexions.filter(r => r.slot !== slot), { slot, type: nextType }];
    updatePanelButton(btnId, { reflexions: newReflexions });
  }

  // ── Global mouse handlers ──────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startMX;
      const dy = e.clientY - d.startMY;

      if (d.kind === 'move-btn') {
        updatePanelButton(d.id, { learnerX: Math.max(0, d.origX + dx), learnerY: Math.max(0, d.origY + dy) });
      } else if (d.kind === 'resize-btn') {
        updatePanelButton(d.id, {
          learnerW: Math.max(MIN_BTN_SIZE, d.origW + dx),
          learnerH: Math.max(MIN_BTN_SIZE, d.origH + dy),
        });
      } else if (d.kind === 'move-lbl') {
        updatePupitreLabel(d.id, { x: Math.max(0, d.origX + dx), y: Math.max(0, d.origY + dy) });
      } else if (d.kind === 'resize-lbl') {
        updatePupitreLabel(d.id, {
          w: Math.max(MIN_LABEL_W, d.origW + dx),
          h: Math.max(MIN_LABEL_H, d.origH + dy),
        });
      }
    };
    const onUp = () => { drag.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [updatePanelButton, updatePupitreLabel]);

  // ── Add plaque at a reasonable position ───────────────────────────────────

  function handleAddLabel() {
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.scrollLeft + canvas.clientWidth  / 2 - 50 : 60;
    const cy = canvas ? canvas.scrollTop  + canvas.clientHeight / 2 - 18 : 20;
    addPupitreLabel(Math.max(0, cx), Math.max(0, cy));
  }

  const sortedButtons = Object.values(panelButtons)
    .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);

  return (
    <div style={s.root}>
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={s.toolbar}>
        <span style={s.toolbarTitle}>PUPITRE PRS</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {arrangeMode && (
            <button onClick={handleAddLabel} style={s.addLabelBtn}>
              + Plaque
            </button>
          )}
          <button
            onPointerDown={() => setTestZoneActive(true)}
            onPointerUp={() => setTestZoneActive(false)}
            onPointerLeave={() => setTestZoneActive(false)}
            title="Test Zone — maintenir enfoncé pour illuminer toutes les zones libres"
            style={{
              ...s.modeBtn,
              background: testZoneActive ? '#422006' : '#0c1220',
              border: `1px solid ${testZoneActive ? '#f59e0b' : '#1e293b'}`,
              color: testZoneActive ? '#fcd34d' : '#475569',
              userSelect: 'none',
            }}
          >
            Test Zone
          </button>
          <button
            onPointerDown={() => setTestAiguilleActive(true)}
            onPointerUp={() => setTestAiguilleActive(false)}
            onPointerLeave={() => setTestAiguilleActive(false)}
            title="Test Aiguille — maintenir enfoncé pour révéler la position confirmée des aiguilles"
            style={{
              ...s.modeBtn,
              background: testAiguilleActive ? '#0c2a1a' : '#0c1220',
              border: `1px solid ${testAiguilleActive ? '#22c55e' : '#1e293b'}`,
              color: testAiguilleActive ? '#4ade80' : '#475569',
              userSelect: 'none',
            }}
          >
            Test Aiguille
          </button>
          <button
            onClick={() => setArrangeMode(v => !v)}
            style={{
              ...s.modeBtn,
              background: arrangeMode ? '#1a2e4a' : '#0c1220',
              border: `1px solid ${arrangeMode ? '#3b82f6' : '#1e293b'}`,
              color: arrangeMode ? '#60a5fa' : '#475569',
            }}
          >
            {arrangeMode ? '✓ Arrangement' : '⠿ Arranger'}
          </button>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div ref={canvasRef} style={{ ...s.canvas, cursor: arrangeMode ? 'default' : 'default' }}>
        {/* Zoom group — all content scales together */}
        <div style={{ transform: `scale(${canvasZoom})`, transformOrigin: 'top left', position: 'relative', width: `${100 / canvasZoom}%`, minHeight: `${100 / canvasZoom}%` }}>

        {/* ── Panel buttons ─────────────────────────────────────────────── */}
        {sortedButtons.map(btn => {
          const pos = btnPos(btn);
          const isFC  = btn.type === 'fc';
          const isAnn = btn.type === 'annulateur';
          const colors = isAnn ? ANN_COLORS[btn.state] : isFC ? FC_COLORS[btn.state] : ROUTE_COLORS[btn.state];
          const ris = btn.routeId ? routeInterlockingStates[btn.routeId] : undefined;
          const isForming    = btn.state === 'forming' || btn.state === 'registered' || btn.state === 'overregistered';
          const isDmtExpired = !!(ris?.EAP_active && ris.DM_startTime !== null && (Date.now() - ris.DM_startTime) >= DMT_DELAY_MS);
          const isBlink = isForming || isDmtExpired;
          const ledOn = !isBlink || blinkPhase;
          const configured = isAnn ? btn.annulateurZoneIds.length > 0 : isFC ? !!btn.fcSignalId : !!btn.routeId;
          // Côté apprenant : seuls les messages formation/enregistrement/surenregistrement sont lisibles.
          const STATE_TAG: Partial<Record<ButtonState, string>> = {
            forming: 'FORM.', registered: 'ENREG.', overregistered: 'SURENR.',
          };
          const stateTag = STATE_TAG[btn.state] ?? '';
          const reflexions = btn.reflexions ?? [];

          return (
            <div
              key={btn.id}
              style={{
                position: 'absolute',
                left: pos.x, top: pos.y,
                width: pos.w, height: pos.h,
                cursor: arrangeMode ? 'grab' : 'default',
                userSelect: 'none',
              }}
              onMouseDown={arrangeMode ? (e) => {
                e.preventDefault();
                drag.current = { kind: 'move-btn', id: btn.id, startMX: e.clientX, startMY: e.clientY, origX: pos.x, origY: pos.y };
              } : undefined}
            >
              {/* Reflexion row top — pas sur les FC */}
              {!isFC && (
                <div style={{ position: 'absolute', top: -9, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', padding: '0 4px', zIndex: 4, pointerEvents: arrangeMode ? 'none' : 'auto' }}>
                  {[0, 1, 2].map(slot => {
                    const device = reflexions.find(r => r.slot === slot);
                    const color = device ? REFLEXION_COLORS[device.type] : null;
                    return (
                      <div key={slot} onClick={e => { e.stopPropagation(); if (!arrangeMode) cycleReflexion(btn.id, slot); }}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: color ?? '#0f172a', border: `1px solid ${color ?? '#334155'}`, boxShadow: color ? `0 0 4px 1px ${color}88` : 'none', cursor: arrangeMode ? 'default' : 'pointer' }} />
                    );
                  })}
                </div>
              )}

              {/* Button body */}
              {isFC ? (
                /* ── FC rotary knob ── */
                <button
                  onClick={arrangeMode ? undefined : () => handleButtonClick(btn.id)}
                  style={{
                    width: '100%', height: '100%',
                    background: 'transparent', border: 'none',
                    cursor: arrangeMode ? 'grab' : (configured ? 'pointer' : 'default'),
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 3,
                    padding: '4px 2px',
                  }}
                >
                  <span style={{
                    fontSize: Math.max(7, pos.w * 0.12), fontWeight: 700, fontFamily: 'monospace',
                    color: configured ? '#e2e8f0' : '#1e3a5f',
                    letterSpacing: 0.5, textAlign: 'center', lineHeight: 1,
                    maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{btn.label}</span>
                  <svg
                    width={Math.min(pos.w, pos.h) * 0.72}
                    height={Math.min(pos.w, pos.h) * 0.72}
                    viewBox="-22 -22 44 44"
                    style={{ display: 'block', flexShrink: 0 }}
                  >
                    <circle cx={0} cy={0} r={21} fill="#0d0a1a" stroke={configured ? '#4a1d96' : '#1e1b2e'} strokeWidth={1.5} />
                    <circle cx={0} cy={0} r={17}
                      fill={btn.state === 'active' ? '#b91c1c' : (configured ? '#450a0a' : '#1a0a1a')}
                      stroke={btn.state === 'active' ? '#ef4444' : '#7c3aed'}
                      strokeWidth={1}
                    />
                    <g transform={`rotate(${btn.state === 'active' ? 0 : 180})`}>
                      <rect x={-3} y={-14} width={6} height={11} rx={3}
                        fill="white" opacity={configured ? 1 : 0.2}
                      />
                    </g>
                    <circle cx={0} cy={0} r={2.5} fill="#1a0a1a" stroke="white" strokeWidth={0.8} opacity={configured ? 0.6 : 0.2} />
                  </svg>
                </button>
              ) : (
                /* ── Standard / ANN button ── */
                <button
                  onClick={arrangeMode ? undefined : () => handleButtonClick(btn.id)}
                  style={{
                    width: '100%', height: '100%',
                    background: colors.bg,
                    border: `2px solid ${isBlink && !blinkPhase ? (isDmtExpired ? '#78350f' : '#3d2000') : colors.border}`,
                    borderRadius: 5, cursor: arrangeMode ? 'grab' : (configured ? 'pointer' : 'default'),
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                    padding: '4px 2px', position: 'relative', overflow: 'hidden',
                    transition: isBlink ? 'border-color 0.1s' : 'opacity 0.15s',
                  }}
                >
                  {isAnn && <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 6, fontFamily: 'monospace', color: '#f59e0b', lineHeight: 1 }}>ANN</span>}
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ledOn && configured ? colors.border : (isForming ? '#3d2000' : '#0f172a'), boxShadow: ledOn && btn.state !== 'idle' && configured ? `0 0 5px 1px ${colors.border}` : 'none' }} />
                  <span style={{ fontSize: Math.max(7, pos.w * 0.13), fontWeight: 700, fontFamily: 'monospace', color: configured ? colors.text : '#1e3a5f', letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.1, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {btn.label}
                  </span>
                  {stateTag && <span style={{ fontSize: 7, fontFamily: 'monospace', color: colors.text, opacity: 0.65, letterSpacing: 0.4 }}>{stateTag}</span>}
                </button>
              )}

              {/* Reflexion row bottom — pas sur les FC */}
              {!isFC && (
                <div style={{ position: 'absolute', bottom: -9, left: 0, right: 0, display: 'flex', justifyContent: 'space-around', padding: '0 4px', zIndex: 4, pointerEvents: arrangeMode ? 'none' : 'auto' }}>
                  {[3, 4, 5].map(slot => {
                    const device = reflexions.find(r => r.slot === slot);
                    const color = device ? REFLEXION_COLORS[device.type] : null;
                    return (
                      <div key={slot} onClick={e => { e.stopPropagation(); if (!arrangeMode) cycleReflexion(btn.id, slot); }}
                        style={{ width: 7, height: 7, borderRadius: '50%', background: color ?? '#0f172a', border: `1px solid ${color ?? '#334155'}`, boxShadow: color ? `0 0 4px 1px ${color}88` : 'none', cursor: arrangeMode ? 'default' : 'pointer' }} />
                    );
                  })}
                </div>
              )}

              {/* Resize handle */}
              {arrangeMode && (
                <ResizeHandle onMouseDown={e => {
                  drag.current = { kind: 'resize-btn', id: btn.id, startMX: e.clientX, startMY: e.clientY, origW: pos.w, origH: pos.h };
                }} />
              )}

              {/* Arrange highlight */}
              {arrangeMode && (
                <div style={{ position: 'absolute', inset: 0, border: '1px dashed #3b82f680', borderRadius: 5, pointerEvents: 'none' }} />
              )}
            </div>
          );
        })}

        {/* ── Plaques ───────────────────────────────────────────────────── */}
        {pupitreLabels.map(lbl => (
          <div
            key={lbl.id}
            style={{
              position: 'absolute',
              left: lbl.x, top: lbl.y,
              width: lbl.w, height: lbl.h,
              background: 'black',
              border: '2px solid white',
              borderRadius: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: arrangeMode ? 'grab' : 'default',
              userSelect: 'none',
              boxSizing: 'border-box',
              zIndex: 5,
            }}
            onMouseDown={arrangeMode ? (e) => {
              e.preventDefault();
              drag.current = { kind: 'move-lbl', id: lbl.id, startMX: e.clientX, startMY: e.clientY, origX: lbl.x, origY: lbl.y };
            } : undefined}
          >
            <EditableLabel
              text={lbl.text}
              onSave={v => updatePupitreLabel(lbl.id, { text: v })}
              style={{
                fontSize: Math.min(14, lbl.h * 0.45),
                fontFamily: 'monospace',
                fontWeight: 700,
                color: 'white',
                width: '100%',
                textAlign: 'center',
                padding: '0 4px',
                boxSizing: 'border-box',
              }}
            />

            {/* Delete button */}
            {arrangeMode && (
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); deletePupitreLabel(lbl.id); }}
                style={{
                  position: 'absolute', top: -8, right: -8,
                  width: 16, height: 16, borderRadius: '50%',
                  background: '#450a0a', border: '1px solid #dc2626',
                  color: '#fca5a5', fontSize: 9, lineHeight: 1,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 20, padding: 0,
                }}
              >✕</button>
            )}

            {/* Resize handle */}
            {arrangeMode && (
              <ResizeHandle onMouseDown={e => {
                drag.current = { kind: 'resize-lbl', id: lbl.id, startMX: e.clientX, startMY: e.clientY, origW: lbl.w, origH: lbl.h };
              }} />
            )}
          </div>
        ))}

        </div>{/* end zoom group */}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex', flexDirection: 'column',
    height: '100%', background: '#080e1a', overflow: 'hidden',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 12px', borderBottom: '1px solid #1e293b',
    background: '#060b14', flexShrink: 0,
  },
  toolbarTitle: {
    color: '#4a90d9', fontSize: 10, fontWeight: 700,
    fontFamily: 'monospace', letterSpacing: 1,
  },
  modeBtn: {
    padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
    fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
  },
  addLabelBtn: {
    padding: '3px 10px', borderRadius: 4, cursor: 'pointer',
    fontSize: 10, fontFamily: 'monospace', fontWeight: 600,
    background: '#0c1a0c', border: '1px solid #166534', color: '#4ade80',
  },
  canvas: {
    flex: 1, position: 'relative', overflow: 'auto',
    background: '#0d1525',
    backgroundImage: 'radial-gradient(circle, #1e293b 1px, transparent 1px)',
    backgroundSize: '20px 20px',
  },
};
