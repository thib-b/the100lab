export const PLATE_PALETTE = [
  { name: 'Turquoise', hex: '#17b6c9' }, { name: 'Sulphur', hex: '#f2c80f' },
  { name: 'Coral', hex: '#e8743f' },     { name: 'Cobalt', hex: '#2f7fd0' },
  { name: 'Chartreuse', hex: '#9fb833' },{ name: 'Fuchsia', hex: '#d15a86' },
  { name: 'Violet', hex: '#8163a6' },    { name: 'Rust', hex: '#bd5230' },
  { name: 'Magenta', hex: '#c8347a' },
] as const;
export type PlateColor = { name: string; hex: string };
