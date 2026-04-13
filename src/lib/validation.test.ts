import { describe, it, expect } from 'vitest';
import { validateLayout } from './validation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validZone = (id: string) => ({ id, label: 'Z', x: 0, y: 0, width: 100, height: 40 });
const validConn = (id: string, from: string, to: string) => ({ id, fromZoneId: from, toZoneId: to });
const validSig = (id: string, connId: string) => ({
  id, connectionId: connId, direction: 'AtoB', position: 0.5, state: 'closed', label: 'S',
});
const json = (obj: unknown) => JSON.stringify(obj);

// ─── Fatal errors ─────────────────────────────────────────────────────────────

describe('fatalError', () => {
  it('rejects a non-JSON string', () => {
    const r = validateLayout('not json {{{');
    expect(r.fatalError).toBeDefined();
    expect(r.data.zones).toHaveLength(0);
  });

  it('rejects a JSON array at root', () => {
    const r = validateLayout(json([1, 2, 3]));
    expect(r.fatalError).toBeDefined();
  });

  it('rejects a JSON number at root', () => {
    expect(validateLayout('42').fatalError).toBeDefined();
  });

  it('rejects null', () => {
    expect(validateLayout('null').fatalError).toBeDefined();
  });
});

// ─── Warnings (non-fatal) ─────────────────────────────────────────────────────

describe('warnings', () => {
  it('warns when zones key is missing', () => {
    const r = validateLayout(json({ connections: [], signals: [] }));
    expect(r.fatalError).toBeUndefined();
    expect(r.warnings.some(w => w.includes('"zones"'))).toBe(true);
  });

  it('warns when connections key is missing', () => {
    const r = validateLayout(json({ zones: [], signals: [] }));
    expect(r.warnings.some(w => w.includes('"connections"'))).toBe(true);
  });

  it('warns about duplicate IDs', () => {
    const r = validateLayout(json({
      zones: [validZone('same'), validZone('same')],
      connections: [],
      signals: [],
    }));
    expect(r.warnings.some(w => w.includes('dupliqué'))).toBe(true);
  });

  it('warns about skipped invalid objects', () => {
    const r = validateLayout(json({
      zones: [{ id: '', label: 'no id' }], // invalid: empty id
      connections: [],
      signals: [],
    }));
    expect(r.warnings.some(w => w.includes('ignoré'))).toBe(true);
  });
});

// ─── Valid layout ─────────────────────────────────────────────────────────────

describe('clean layout', () => {
  it('accepts an empty layout', () => {
    const r = validateLayout(json({ zones: [], connections: [], signals: [] }));
    expect(r.fatalError).toBeUndefined();
    expect(r.warnings).toHaveLength(0);
    expect(r.data).toEqual({ zones: [], connections: [], signals: [] });
  });

  it('accepts a valid layout with all object types', () => {
    const r = validateLayout(json({
      zones: [validZone('z1'), validZone('z2')],
      connections: [validConn('c1', 'z1', 'z2')],
      signals: [validSig('s1', 'c1')],
    }));
    expect(r.fatalError).toBeUndefined();
    expect(r.warnings).toHaveLength(0);
    expect(r.data.zones).toHaveLength(2);
    expect(r.data.connections).toHaveLength(1);
    expect(r.data.signals).toHaveLength(1);
  });
});

// ─── Cross-reference validation ───────────────────────────────────────────────

describe('cross-reference cleanup', () => {
  it('drops connections referencing unknown zones', () => {
    const r = validateLayout(json({
      zones: [validZone('z1')],
      connections: [validConn('c1', 'z1', 'GHOST')], // GHOST doesn't exist
      signals: [],
    }));
    expect(r.data.connections).toHaveLength(0);
    expect(r.warnings.some(w => w.includes('ignoré'))).toBe(true);
  });

  it('drops signals referencing unknown connections', () => {
    const r = validateLayout(json({
      zones: [validZone('z1'), validZone('z2')],
      connections: [],
      signals: [validSig('s1', 'GHOST_CONN')],
    }));
    expect(r.data.signals).toHaveLength(0);
    expect(r.warnings.some(w => w.includes('ignoré'))).toBe(true);
  });

  it('drops self-loop connections', () => {
    const r = validateLayout(json({
      zones: [validZone('z1')],
      connections: [validConn('c1', 'z1', 'z1')], // self-loop
      signals: [],
    }));
    expect(r.data.connections).toHaveLength(0);
  });

  it('keeps valid signal when its connection is valid', () => {
    const r = validateLayout(json({
      zones: [validZone('z1'), validZone('z2')],
      connections: [validConn('c1', 'z1', 'z2')],
      signals: [validSig('s1', 'c1')],
    }));
    expect(r.data.signals).toHaveLength(1);
    expect(r.warnings).toHaveLength(0);
  });
});

// ─── Field-level validation ───────────────────────────────────────────────────

describe('field-level validation', () => {
  it('rejects a zone with non-positive width', () => {
    const r = validateLayout(json({
      zones: [{ id: 'z1', label: 'Z', x: 0, y: 0, width: 0, height: 40 }],
      connections: [],
      signals: [],
    }));
    expect(r.data.zones).toHaveLength(0);
  });

  it('rejects a signal with invalid direction', () => {
    const r = validateLayout(json({
      zones: [validZone('z1'), validZone('z2')],
      connections: [validConn('c1', 'z1', 'z2')],
      signals: [{ id: 's1', connectionId: 'c1', direction: 'INVALID', position: 0.5, state: 'closed', label: 'S' }],
    }));
    expect(r.data.signals).toHaveLength(0);
  });

  it('rejects a signal with invalid state', () => {
    const r = validateLayout(json({
      zones: [validZone('z1'), validZone('z2')],
      connections: [validConn('c1', 'z1', 'z2')],
      signals: [{ id: 's1', connectionId: 'c1', direction: 'AtoB', position: 0.5, state: 'INVALID', label: 'S' }],
    }));
    expect(r.data.signals).toHaveLength(0);
  });
});
