import { describe, it, expect } from 'vitest';
import { relativeLuminance, inkFor, scrimFor } from '../../src/lib/color';

describe('color', () => {
  it('luminance ordering: yellow brighter than cobalt', () => {
    expect(relativeLuminance('#f2c80f')).toBeGreaterThan(relativeLuminance('#2f7fd0'));
  });
  it('inkFor picks dark ink on light grounds, light ink on dark grounds', () => {
    expect(inkFor('#f2c80f')).toBe('#141414');   // sulphur → dark ink
    expect(inkFor('#2f7fd0')).toBe('#f4f3ee');    // cobalt → light ink
  });
  it('scrimFor returns an rgba string', () => {
    expect(scrimFor('#17b6c9')).toMatch(/^rgba\(/);
  });
});
