import { PLATE_PALETTE, type PlateColor } from '../data/palette';
export { PLATE_PALETTE };

export function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hourlySeed(d: Date = new Date()): number {
  const days = Math.floor(d.getTime() / 86400000);
  return days * 24 + d.getUTCHours();
}
export function pickPlateColor(seed: number, palette: readonly PlateColor[] = PLATE_PALETTE): PlateColor {
  const i = Math.floor(mulberry32(seed + 11)() * palette.length);
  return palette[i];
}
