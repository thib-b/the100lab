import { describe, it, expect } from 'vitest';
import { hourlySeed, pickPlateColor, PLATE_PALETTE } from '../../src/lib/seed';

describe('seed', () => {
  it('hourlySeed changes with the hour and is stable within it', () => {
    const a = new Date('2026-08-29T10:15:00Z');
    const b = new Date('2026-08-29T10:59:00Z');
    const c = new Date('2026-08-29T11:00:00Z');
    expect(hourlySeed(a)).toBe(hourlySeed(b));
    expect(hourlySeed(a)).not.toBe(hourlySeed(c));
  });
  it('pickPlateColor is deterministic and in-palette', () => {
    const s = hourlySeed(new Date('2026-08-29T11:00:00Z'));
    const first = pickPlateColor(s);
    expect(pickPlateColor(s)).toEqual(first);
    expect(PLATE_PALETTE).toContainEqual(first);
  });
});
