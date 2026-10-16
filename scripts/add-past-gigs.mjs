// Daily job (see .github/workflows/add-past-gigs.yml): pull the band's past gigs from the
// same public JSON endpoint the Songkick widget uses, and prepend any gig newer than the
// newest entry in src/data/pastTourDates.ts. The workflow then opens a PR for review, so
// the generated wording can be tweaked before it goes live.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ARTIST_ID = '8269433';
const FEED = `https://widget-app.songkick.com/api/calendar/${ARTIST_ID}?past_performances=true`;
const DATA_FILE = fileURLToPath(new URL('../src/data/pastTourDates.ts', import.meta.url));

const COUNTRY_CODES = {
  Ireland: 'IE', UK: 'UK', France: 'FR', Germany: 'DE', Netherlands: 'NL', Belgium: 'BE',
  Switzerland: 'CH', Italy: 'IT', Austria: 'AT', Hungary: 'HU', Poland: 'PL',
  'Czech Republic': 'CZ', Czechia: 'CZ', Sweden: 'SE', Norway: 'NO', Denmark: 'DK',
  Luxembourg: 'LU', Spain: 'ES', Portugal: 'PT', US: 'USA',
};
// Songkick files Northern Ireland under "UK"; the archive writes it as NI.
const NI_CITIES = new Set(['Belfast', 'Derry', 'Londonderry', 'Limavady', 'Bangor', 'Portrush', 'Hillsborough', 'Newry', 'Lisburn']);

// "2026-10-10" → "10/10/26"
export const toArchiveDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

// Archive dates are DD/MM/YY; turn them into a sortable YYMMDD key.
const sortKey = (ddmmyy) => ddmmyy.slice(6, 8) + ddmmyy.slice(3, 5) + ddmmyy.slice(0, 2);

export function toArchiveEntry({ event }) {
  const venue = event.venue?.displayName;
  const city = event.venue?.metroArea?.displayName ?? event.location?.city?.split(',')[0];
  const country = event.venue?.metroArea?.country?.displayName;
  const code = NI_CITIES.has(city) ? 'NI' : COUNTRY_CODES[country] ?? country;
  const parts = [venue];
  // Festivals are listed by festival name in the archive, e.g. "Love Is A Stranger Festival".
  if (event.type === 'Festival' && event.displayName) {
    parts[0] = event.displayName.replace(/\s+\d{4}$/, '');
  }
  parts.push(city, code);
  return { date: toArchiveDate(event.start.date), location: parts.filter(Boolean).join(', ') };
}

// Gigs strictly newer than the newest archived date, newest first, cancelled ones dropped.
export function newGigs(performances, newestArchived) {
  return performances
    .filter((p) => p.event.status !== 'cancelled')
    .map(toArchiveEntry)
    .filter((g) => sortKey(g.date) > sortKey(newestArchived))
    .sort((a, b) => sortKey(b.date).localeCompare(sortKey(a.date)));
}

export function prependToSource(source, gigs) {
  const marker = 'export const pastTourDates: PastTourDate[] = [\n';
  if (!source.includes(marker)) throw new Error('pastTourDates array not found');
  const lines = gigs.map((g) => `  { date: ${JSON.stringify(g.date)}, location: ${JSON.stringify(g.location)} },\n`);
  return source.replace(marker, marker + lines.join(''));
}

async function main() {
  const res = await fetch(FEED);
  if (!res.ok) throw new Error(`Songkick feed returned ${res.status}`);
  const performances = (await res.json()).resultsPage?.results?.performance ?? [];

  const source = await readFile(DATA_FILE, 'utf8');
  const newest = source.match(/date: "(\d\d\/\d\d\/\d\d)"/)?.[1];
  if (!newest) throw new Error('could not read the newest archived date');

  const gigs = newGigs(performances, newest);
  if (!gigs.length) {
    console.log(`No new past gigs since ${newest}.`);
    return;
  }
  await writeFile(DATA_FILE, prependToSource(source, gigs));
  for (const g of gigs) console.log(`Added ${g.date} — ${g.location}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
