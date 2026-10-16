import { describe, it, expect } from 'vitest';
// @ts-expect-error plain .mjs script without type declarations
import { toArchiveDate, toArchiveEntry, newGigs, prependToSource } from '../../scripts/add-past-gigs.mjs';

const perf = (date: string, venue: string, city: string, country: string, extra: Record<string, unknown> = {}) => ({
  event: {
    start: { date },
    type: 'Concert',
    status: 'ok',
    displayName: `Robocobra Quartet at ${venue}`,
    venue: { displayName: venue, metroArea: { displayName: city, country: { displayName: country } } },
    ...extra,
  },
});

describe('add-past-gigs', () => {
  it('converts ISO dates to the archive DD/MM/YY format', () => {
    expect(toArchiveDate('2026-10-10')).toBe('10/10/26');
  });
  it('formats a concert as "Venue, City, CC"', () => {
    expect(toArchiveEntry(perf('2026-10-10', 'Spirit Store', 'Dundalk', 'Ireland')))
      .toEqual({ date: '10/10/26', location: 'Spirit Store, Dundalk, IE' });
  });
  it('writes Northern Irish cities as NI', () => {
    expect(toArchiveEntry(perf('2026-04-17', 'Black Box', 'Belfast', 'UK')).location).toBe('Black Box, Belfast, NI');
  });
  it('uses the festival name without its year for festivals', () => {
    const p = perf('2026-05-16', 'Juniper Barn', 'Sligo', 'Ireland', { type: 'Festival', displayName: 'Love Is A Stranger 2026' });
    expect(toArchiveEntry(p).location).toBe('Love Is A Stranger, Sligo, IE');
  });
  it('keeps only gigs newer than the newest archived date, newest first, skipping cancelled', () => {
    const gigs = newGigs([
      perf('2026-10-10', 'Spirit Store', 'Dundalk', 'Ireland'),
      perf('2026-11-19', 'ICA', 'London', 'UK'),
      perf('2026-11-01', 'Gone', 'Paris', 'France', { status: 'cancelled' }),
      perf('2026-05-16', 'Old', 'Sligo', 'Ireland'),
    ], '16/05/26');
    expect(gigs.map((g: { date: string }) => g.date)).toEqual(['19/11/26', '10/10/26']);
  });
  it('compares across years correctly', () => {
    expect(newGigs([perf('2027-01-05', 'X', 'Cork', 'Ireland')], '10/10/26')).toHaveLength(1);
  });
  it('prepends new rows at the top of the array', () => {
    const src = 'export const pastTourDates: PastTourDate[] = [\n  { date: "10/10/26", location: "A" },\n];\n';
    expect(prependToSource(src, [{ date: '19/11/26', location: 'ICA, London, UK' }]))
      .toBe('export const pastTourDates: PastTourDate[] = [\n  { date: "19/11/26", location: "ICA, London, UK" },\n  { date: "10/10/26", location: "A" },\n];\n');
  });
});
