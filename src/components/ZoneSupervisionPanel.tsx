'use client';
import { useState } from 'react';
import { useRailwayStore } from '@/store/useRailwayStore';
import { AnnulmentType } from '@/lib/interlocking';

// ─── Procedure descriptions ────────────────────────────────────────────────────

const PROCEDURE: Record<NonNullable<AnnulmentType>, { label: string; color: string; confirm: string; note: string }> = {
  ZI:  {
    label:   'ZI — Zone d\'aiguille',
    color:   '#dc2626',
    confirm: 'Je confirme avoir examiné le terrain et la position de l\'aiguille',
    note:    'Examen terrain obligatoire avant annulation',
  },
  ZP:  {
    label:   'ZP — Zone de Protection',
    color:   '#ea580c',
    confirm: 'Je confirme avoir reconnu le terrain (zone libre)',
    note:    'Reconnaissance terrain obligatoire avant annulation',
  },
  ZEA: {
    label:   'ZEA — Zone d\'Espacement Auto.',
    color:   '#d97706',
    confirm: null as unknown as string, // no terrain check for ZEA
    note:    'Annulation directe — pas de reconnaissance terrain',
  },
};

// ─── Single zone card ──────────────────────────────────────────────────────────

function ZoneDerangementCard({ zoneId }: { zoneId: string }) {
  const [confirmed, setConfirmed] = useState(false);

  const zone              = useRailwayStore(s => s.zones.find(z => z.id === zoneId));
  const routes            = useRailwayStore(s => s.routes);
  const annulType         = useRailwayStore(s => s.getZoneAnnulmentType(zoneId));
  const annulZone         = useRailwayStore(s => s.annulZone);
  const cancelZoneAnnulment = useRailwayStore(s => s.cancelZoneAnnulment);

  if (!zone) return null;

  // Find which routes use this zone (for EE display)
  const affectedRoutes = Object.values(routes).filter(r =>
    r.zoneConditions.some(c => c.zoneId === zoneId && (c.roles.includes('ZP') || c.roles.includes('ZEA')))
  );

  const proc = annulType ? PROCEDURE[annulType] : null;
  const needsConfirm = annulType === 'ZI' || annulType === 'ZP';

  const borderColor = zone.annulled ? '#374151' : (proc?.color ?? '#7f1d1d');

  return (
    <div style={{
      background: '#0a1220', border: `1px solid ${borderColor}`,
      borderRadius: 4, padding: '7px 9px', marginBottom: 6,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                       color: zone.annulled ? '#6b7280' : '#fca5a5' }}>
          {zone.label}
        </span>
        <span style={{
          fontSize: 8, fontFamily: 'monospace', padding: '1px 5px', borderRadius: 2,
          background: zone.annulled ? '#1f2937' : '#450a0a',
          color:      zone.annulled ? '#9ca3af' : '#fca5a5',
        }}>
          {zone.annulled ? 'Ann. Zone active' : 'DÉRANGEMENT'}
        </span>
      </div>

      {/* Annulment type */}
      {proc && (
        <div style={{ fontSize: 8, fontFamily: 'monospace', color: proc.color,
                      marginBottom: 4, letterSpacing: 0.3 }}>
          {proc.label}
        </div>
      )}
      {!proc && (
        <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#6b7280', marginBottom: 4 }}>
          Aucun rôle d'enclenchement connu
        </div>
      )}

      {/* Blocked EE */}
      {affectedRoutes.length > 0 && !zone.annulled && (
        <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#9ca3af', marginBottom: 5, lineHeight: 1.5 }}>
          EE bloqué — itinéraire(s) affecté(s) :<br />
          {affectedRoutes.map(r => {
            const roles = r.zoneConditions
              .find(c => c.zoneId === zoneId)?.roles ?? [];
            return (
              <span key={r.id} style={{ color: '#6b7280' }}>
                · {r.fromZoneId ?? '?'} → {r.toZoneId ?? '?'} ({roles.join(', ')}){' '}
              </span>
            );
          })}
        </div>
      )}

      {/* Actions */}
      {!zone.annulled && proc && (
        <>
          {proc.note && (
            <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#78350f',
                          marginBottom: 4, fontStyle: 'italic' }}>
              {proc.note}
            </div>
          )}

          {needsConfirm && !confirmed && (
            <button
              onClick={() => setConfirmed(true)}
              style={{ ...btnStyle, background: '#1c1107', borderColor: '#92400e', color: '#fbbf24',
                       marginBottom: 4, width: '100%' }}
            >
              ✓ {proc.confirm}
            </button>
          )}

          <button
            disabled={needsConfirm && !confirmed}
            onClick={() => { annulZone(zoneId); setConfirmed(false); }}
            style={{
              ...btnStyle, width: '100%',
              background:  (needsConfirm && !confirmed) ? '#0f172a' : '#1a0505',
              borderColor: (needsConfirm && !confirmed) ? '#1e293b' : '#dc2626',
              color:       (needsConfirm && !confirmed) ? '#334155' : '#fca5a5',
              opacity:     (needsConfirm && !confirmed) ? 0.5 : 1,
            }}
          >
            Ann. Zone
          </button>
        </>
      )}

      {zone.annulled && (
        <>
          <div style={{ fontSize: 8, fontFamily: 'monospace', color: '#4b5563',
                        marginBottom: 4 }}>
            EE neutralisé — zone toujours occupée visuellement
          </div>
          <button
            onClick={() => cancelZoneAnnulment(zoneId)}
            style={{ ...btnStyle, width: '100%', background: '#111827',
                     borderColor: '#374151', color: '#6b7280' }}
          >
            Lever Ann. Zone
          </button>
        </>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────

export function ZoneSupervisionPanel() {
  const zones = useRailwayStore(s => s.zones);
  const derangedZones = zones.filter(z => z.derangement);

  if (derangedZones.length === 0) return null;

  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace',
                    color: '#f97316', letterSpacing: 1, textTransform: 'uppercase',
                    marginBottom: 8 }}>
        Supervision CDV — Dérangements
      </div>
      {derangedZones.map(z => (
        <ZoneDerangementCard key={z.id} zoneId={z.id} />
      ))}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  padding: '4px 8px', fontSize: 9, fontFamily: 'monospace',
  border: '1px solid', borderRadius: 3, cursor: 'pointer',
  background: 'transparent', textAlign: 'center',
};
