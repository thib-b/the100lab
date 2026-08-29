export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function inkFor(hex: string): '#141414' | '#f4f3ee' {
  return relativeLuminance(hex) > 0.42 ? '#141414' : '#f4f3ee';
}
export function scrimFor(hex: string): string {
  return relativeLuminance(hex) > 0.5 ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.26)';
}
