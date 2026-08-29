import { describe, it, expect } from 'vitest';
import { hexToRgb, relativeLuminance, inkFor, scrimFor } from '../../src/lib/color';

describe('color', () => {
  it('luminance ordering: yellow brighter than cobalt', () => {
    expect(relativeLuminance('#f2c80f')).toBeGreaterThan(relativeLuminance('#2f7fd0'));
  });
  it('inkFor picks dark ink on light grounds, light ink on dark grounds', () => {
    expect(inkFor('#f2c80f')).toBe('#141414');   // sulphur → dark ink
    expect(inkFor('#2f7fd0')).toBe('#f4f3ee');    // cobalt → light ink
  });
  it('scrimFor returns correct rgba values for light and dark grounds', () => {
    expect(scrimFor('#f2c80f')).toBe('rgba(255,255,255,0.34)');  // light ground (luminance ~0.60 > 0.5) → light scrim
    expect(scrimFor('#2f7fd0')).toBe('rgba(0,0,0,0.26)');        // dark ground (luminance ~0.20 < 0.5) → dark scrim
  });
  it('hexToRgb converts hex to RGB tuple', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });
});
