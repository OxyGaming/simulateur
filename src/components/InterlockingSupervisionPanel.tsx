'use client';
import { useState, useEffect } from 'react';
import { useRailwayStore, DMT_DELAY_MS } from '@/store/useRailwayStore';
import { RouteInterlockingState, Route, Signal, Switch, Zone } from '@/types/railway';

// ─── Phase helpers ────────────────────────────────────────────────────────────

type Phase = 'formation' | 'registered' | 'overregistered' | 'epa' | 'eap' | 'dmt' | 'transit';

function getPhase(ris: RouteInterlockingState): Phase {
  if (ris.buttonState === 'registered')    return 'registered';
  if (ris.buttonState === 'overregistered') return 'overregistered';
  if (ris.buttonState === 'forming') return 'formation';
  if (ris.buttonState === 'active' && ris.DM_startTime !== null) return 'dmt';
  if (ris.buttonState === 'active' && ris.EAP_active) return 'eap';
  if (ris.buttonState === 'active' && ris.transitCleared.length > 0) return 'transit';
  return 'epa';
}

const PHASE_COLOR: Record<Phase, string> = {
  formation:      '#3b82f6',
  registered:     '#ca8a04',
  overregistered: '#0891b2',
  epa:            '#f59e0b',
  eap:            '#f97316',
  dmt:            '#ef4444',
  transit:        '#14b8a6',
};

const PHASE_BG: Record<Phase, string> = {
  formation:      '#0d1e3d',
  registered:     '#1a1500',
  overregistered: '#001a1a',
  epa:            '#1a1200',
  eap:            '#1a0d00',
  dmt:            '#1a0000',
  transit:   '#001a18',
};

const PHASE_LABEL: Record<Phase, string> = {
  formation:      'FORMATION',
  registered:     'ENREGISTRÉ',
  overregistered: 'SURENREGISTRÉ',
  epa:            'E.Pa',
  eap:            'E.Ap',
  dmt:            'DMT',
  transit:        'TRANSIT',
};

const PHASE_DESC: Record<Phase, string> = {
  formation:      'Mise en place des aiguilles en cours\u2026',
  registered:     'Enregistrement \u2014 en attente de lib\u00e9ration des tron\u00e7ons (DA en cours).',
  overregistered: 'Surenregistrement \u2014 en attente de lib\u00e9ration de l\u2019aiguille (transit progressif).',
  epa:            'E.Pa actif \u2014 aiguilles verrouill\u00e9es. Train non encore en approche.',
  eap:            'E.Ap actif \u2014 train en zone d\u2019approche. Signal maintenu ouvert.',
  dmt:            'Destruction manuelle temporis\u00e9e \u2014 1er geste enregistr\u00e9.',
  transit:        '', // filled dynamically
};

// ─── DMT Countdown ────────────────────────────────────────────────────────────

function DmtCountdown({ startTime }: { startTime: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - startTime;
  const remaining = DMT_DELAY_MS - elapsed;

  if (remaining <= 0) {
    return (
      <div style={{ fontSize: 10, color: '#f97316', fontFamily: 'monospace', marginTop: 4 }}>
        &#9889; 2e geste autoris\u00e9 \u2014 Ann. E.Ap
      </div>
    );
  }

  const totalSec = Math.ceil(remaining / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const display = `${mins}:${secs.toString().padStart(2, '0')}`;

  return (
    <div style={{ fontSize: 10, color: '#ef4444', fontFamily: 'monospace', marginTop: 4 }}>
      DMT : {display} restant
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, color: '#475569', textTransform: 'uppercase',
      letterSpacing: 0.5, marginBottom: 4, marginTop: 8,
    }}>
      {children}
    </div>
  );
}

function MiniDivider() {
  return <div style={{ height: 1, background: '#1e2d45', margin: '6px 0' }} />;
}

// ─── Route Card ───────────────────────────────────────────────────────────────

function RouteCard({
  ris,
  route,
  routeLabel,
  signals,
  switches,
  zones,
}: {
  ris: RouteInterlockingState;
  route: Route;
  routeLabel: string;
  signals: Signal[];
  switches: Switch[];
  zones: Zone[];
}) {
  const phase = getPhase(ris);
  const phaseColor = PHASE_COLOR[phase];
  const phaseBg = PHASE_BG[phase];

  // Transit conditions
  const transitConds = route.zoneConditions
    .filter(c => c.roles.includes('transit'))
    .sort((a, b) => (a.transitIndex ?? 0) - (b.transitIndex ?? 0));

  // Approach zone
  const approachCond = route.zoneConditions.find(c => c.roles.includes('approche'));
  const approachZone = approachCond ? zones.find(z => z.id === approachCond.zoneId) : null;

  // Protection zones (ZP, ZEA) — not transit, not approche
  const protectionConds = route.zoneConditions.filter(
    c => (c.roles.includes('ZP') || c.roles.includes('ZEA')) && !c.roles.includes('transit') && !c.roles.includes('approche')
  );

  // Phase description
  let phaseDesc = PHASE_DESC[phase];
  if (phase === 'transit') {
    const cleared = ris.transitCleared.length;
    const total = transitConds.length;
    phaseDesc = `E.Pa \u00b7 ${cleared}/${total} zone(s) de transit lib\u00e9r\u00e9e(s).`;
  }

  return (
    <div style={{
      background: phaseBg,
      border: `1px solid ${phaseColor}`,
      borderRadius: 4,
      padding: '8px 10px',
      marginBottom: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'white', fontFamily: 'monospace' }}>
          {routeLabel}
        </span>
        <span style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
          padding: '1px 5px', borderRadius: 2,
          background: phaseColor + '22',
          color: phaseColor,
          border: `1px solid ${phaseColor}55`,
        }}>
          {PHASE_LABEL[phase]}
        </span>
      </div>

      {/* Phase description */}
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
        {phaseDesc}
      </div>

      {/* DMT countdown */}
      {ris.DM_startTime !== null && (
        <DmtCountdown startTime={ris.DM_startTime} />
      )}

      <MiniDivider />

      {/* Signaux */}
      {route.signalIds.length > 0 && (
        <>
          <SectionLabel>Signaux</SectionLabel>
          {route.signalIds.map(sigId => {
            const sig = signals.find(s => s.id === sigId);
            if (!sig) return null;
            const stateColor = sig.state === 'open' ? '#22c55e' : sig.state === 'maintained_open' ? '#f97316' : '#ef4444';
            const stateLabel = sig.state === 'open' ? 'OUVERT' : sig.state === 'maintained_open' ? 'MAINTENU' : 'FERM\u00c9';
            return (
              <div key={sigId} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{sig.label}</span>
                  <span style={{
                    fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                    padding: '1px 4px', borderRadius: 2,
                    background: stateColor + '22', color: stateColor,
                  }}>
                    {stateLabel}
                  </span>
                </div>
                {ris.EAP_active && (
                  <div style={{ fontSize: 9, color: '#f97316', marginTop: 2 }}>
                    &#8857; Signal maintenu par E.Ap{approachZone ? ` \u2014 zone approche\u00a0: ${approachZone.label}` : ''}
                  </div>
                )}
              </div>
            );
          })}
          <MiniDivider />
        </>
      )}

      {/* Aiguilles · E.Pa */}
      {Object.keys(route.switchPositions).length > 0 && (
        <>
          <SectionLabel>Aiguilles &middot; E.Pa</SectionLabel>
          {Object.entries(route.switchPositions).map(([swId, pos]) => {
            const sw = switches.find(s => s.id === swId);
            if (!sw) return null;
            const posLabel = pos === 'straight' ? 'DIR' : 'D\u00c9V';
            const lockIcon = sw.locked ? '\uD83D\uDD12' : '\uD83D\uDD13';
            const isTransitZone = sw.zonePropreId
              ? route.zoneConditions.some(c => c.zoneId === sw.zonePropreId && c.roles.includes('transit'))
              : false;
            const zpZone = sw.zonePropreId ? zones.find(z => z.id === sw.zonePropreId) : null;
            const isCleared = sw.zonePropreId ? ris.transitCleared.includes(sw.zonePropreId) : false;

            return (
              <div key={swId} style={{ marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{sw.name}</span>
                  <span style={{ fontSize: 9, color: '#64748b' }}>{posLabel}</span>
                  <span style={{ fontSize: 10 }}>{lockIcon}</span>
                </div>
                {zpZone && (
                  <div style={{ fontSize: 9, marginTop: 2,
                    color: isTransitZone ? (isCleared ? '#14b8a6' : '#64748b') : '#94a3b8',
                  }}>
                    Zone propre\u00a0: {zpZone.label}
                    {isTransitZone ? (isCleared ? ' \u2713 lib\u00e9r\u00e9e' : ' \u2014 non lib\u00e9r\u00e9e') : ''}
                  </div>
                )}
              </div>
            );
          })}
          <MiniDivider />
        </>
      )}

      {/* Transit progressif */}
      {transitConds.length > 0 && (
        <>
          <SectionLabel>Transit progressif</SectionLabel>
          {(() => {
            const cleared = transitConds.filter(c => ris.transitCleared.includes(c.zoneId)).length;
            const total = transitConds.length;
            const complete = cleared === total;
            const pct = total > 0 ? Math.round((cleared / total) * 100) : 0;
            return (
              <>
                {/* Progress bar */}
                <div style={{ height: 4, background: '#1e293b', borderRadius: 2, marginBottom: 6 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${pct}%`,
                    background: complete ? '#14b8a6' : '#3b82f6',
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 9, color: complete ? '#14b8a6' : '#64748b', marginBottom: 4 }}>
                  {cleared}/{total} zones lib\u00e9r\u00e9es
                </div>
                {/* Zone list */}
                {transitConds.map((cond, idx) => {
                  const z = zones.find(zz => zz.id === cond.zoneId);
                  const isClr = ris.transitCleared.includes(cond.zoneId);
                  return (
                    <div key={cond.zoneId} style={{
                      display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3,
                    }}>
                      <span style={{
                        fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
                        padding: '0 4px', borderRadius: 2,
                        background: isClr ? '#14b8a6' : '#1e293b',
                        color: isClr ? '#0f172a' : '#475569',
                        minWidth: 16, textAlign: 'center',
                      }}>
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: 10, color: isClr ? '#14b8a6' : '#94a3b8', fontFamily: 'monospace' }}>
                        {z?.label ?? cond.zoneId}
                      </span>
                      {isClr && <span style={{ fontSize: 9, color: '#14b8a6' }}>\u2713</span>}
                    </div>
                  );
                })}
              </>
            );
          })()}
          <MiniDivider />
        </>
      )}

      {/* Zone d'approche */}
      {approachZone && (
        <>
          <SectionLabel>Zone d&apos;approche</SectionLabel>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
              {approachZone.label}
            </span>
            <span style={{
              fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
              padding: '1px 4px', borderRadius: 2,
              background: ris.EAP_active ? '#f9731622' : '#22c55e22',
              color: ris.EAP_active ? '#f97316' : '#22c55e',
            }}>
              {ris.EAP_active ? 'OCCUP\u00c9E' : 'LIBRE'}
            </span>
          </div>
          <MiniDivider />
        </>
      )}

      {/* Zones de protection */}
      {protectionConds.length > 0 && (
        <>
          <SectionLabel>Zones de protection</SectionLabel>
          {protectionConds.map(cond => {
            const z = zones.find(zz => zz.id === cond.zoneId);
            return (
              <div key={cond.zoneId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 3,
              }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>
                  {z?.label ?? cond.zoneId}
                </span>
                <span style={{ fontSize: 8, color: '#475569', fontFamily: 'monospace' }}>
                  {cond.roles.filter(r => r === 'ZP' || r === 'ZEA').join(' \u00b7 ')}
                </span>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function InterlockingSupervisionPanel() {
  const ris          = useRailwayStore(s => s.routeInterlockingStates);
  const routes       = useRailwayStore(s => s.routes);
  const panelButtons = useRailwayStore(s => s.panelButtons);
  const signals      = useRailwayStore(s => s.signals);
  const switches     = useRailwayStore(s => s.switches);
  const zones        = useRailwayStore(s => s.zones);

  // Show active/forming/registered/overregistered routes
  const activeRis = Object.values(ris).filter(
    r => r.buttonState === 'active'
      || r.buttonState === 'forming'
      || r.buttonState === 'registered'
      || r.buttonState === 'overregistered'
  );

  if (activeRis.length === 0) return null;

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
        color: '#4a90d9', letterSpacing: 1, textTransform: 'uppercase',
        marginBottom: 8,
      }}>
        Supervision Enclenchements
      </div>
      {activeRis.map(r => {
        const route = routes[r.routeId];
        if (!route) return null;
        const btn = Object.values(panelButtons).find(b => b.routeId === r.routeId);
        const routeLabel = btn?.label ?? r.routeId.slice(-6);
        return (
          <RouteCard
            key={r.routeId}
            ris={r}
            route={route}
            routeLabel={routeLabel}
            signals={signals}
            switches={switches}
            zones={zones}
          />
        );
      })}
    </div>
  );
}
