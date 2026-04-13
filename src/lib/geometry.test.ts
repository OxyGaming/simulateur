import { describe, it, expect } from 'vitest';
import { zoneCenter, rectBorderPoint, projectOnSegment } from './geometry';
import { Zone } from '@/types/railway';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const zone = (x: number, y: number, w = 100, h = 40): Zone => ({
  id: 'z', label: 'Z', x, y, width: w, height: h,
});

// ─── zoneCenter ───────────────────────────────────────────────────────────────

describe('zoneCenter', () => {
  it('returns center of a zone at origin', () => {
    expect(zoneCenter(zone(0, 0))).toEqual({ x: 50, y: 20 });
  });

  it('returns center of an offset zone', () => {
    expect(zoneCenter(zone(100, 200, 60, 40))).toEqual({ x: 130, y: 220 });
  });
});

// ─── rectBorderPoint ──────────────────────────────────────────────────────────

describe('rectBorderPoint', () => {
  const z = zone(0, 0); // center (50, 20), half-width 50, half-height 20

  it('returns right border for rightward direction', () => {
    const p = rectBorderPoint(z, 200, 20); // target to the right at same y
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(20);
  });

  it('returns left border for leftward direction', () => {
    const p = rectBorderPoint(z, -100, 20);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(20);
  });

  it('returns top border for upward direction', () => {
    const p = rectBorderPoint(z, 50, -100); // target directly above
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0);
  });

  it('returns bottom border for downward direction', () => {
    const p = rectBorderPoint(z, 50, 200);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(40);
  });

  it('returns center when target equals center (degenerate)', () => {
    const p = rectBorderPoint(z, 50, 20);
    expect(p).toEqual({ x: 50, y: 20 });
  });
});

// ─── projectOnSegment ─────────────────────────────────────────────────────────

describe('projectOnSegment', () => {
  it('returns 0.5 for the midpoint of a horizontal segment', () => {
    expect(projectOnSegment(5, 0, 0, 0, 10, 0)).toBe(0.5);
  });

  it('returns 0 for a point before the segment start', () => {
    expect(projectOnSegment(-5, 0, 0, 0, 10, 0)).toBe(0);
  });

  it('returns 1 for a point past the segment end', () => {
    expect(projectOnSegment(15, 0, 0, 0, 10, 0)).toBe(1);
  });

  it('returns 0.5 for a degenerate (zero-length) segment', () => {
    expect(projectOnSegment(5, 5, 3, 3, 3, 3)).toBe(0.5);
  });

  it('respects custom min/max bounds', () => {
    expect(projectOnSegment(-10, 0, 0, 0, 10, 0, 0.1, 0.9)).toBe(0.1);
    expect(projectOnSegment(100, 0, 0, 0, 10, 0, 0.1, 0.9)).toBe(0.9);
    expect(projectOnSegment(5, 0, 0, 0, 10, 0, 0.1, 0.9)).toBe(0.5);
  });

  it('works on a diagonal segment', () => {
    // Segment (0,0)→(10,10), point (5,5) is exactly at t=0.5
    expect(projectOnSegment(5, 5, 0, 0, 10, 10)).toBeCloseTo(0.5);
  });
});
