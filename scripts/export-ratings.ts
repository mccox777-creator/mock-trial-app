// Writes the published rating files so anyone can check every number. Run with: npm run ratings:export
//
//   public/ratings-data/ratings.csv         every school's current rating
//   public/ratings-data/rating-changes.csv  every rating change, in the order computed, with every input to the formula:
//                                           after = before + k * weight * (ahead - expected) / teams
//   public/ratings-data/events.json         the competition results the ratings are computed from
//
// The site serves these at https://app.mocktrialcentral.com/ratings-data/... . They cover the circuit record; competitions
// run in the app join the ratings in the app as soon as they close.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chronological, computeElo, GAMES_PER_EVENT, START, teamsOf } from '../src/lib/elo.ts';
import type { PastEvent } from '../src/lib/types.ts';

const src = new URL('../src/data/history-law-school.json', import.meta.url);
const out = new URL('../public/ratings-data/', import.meta.url);
const events = JSON.parse(readFileSync(src, 'utf8')) as PastEvent[];
const rows = computeElo(events);

const csv = (cells: (string | number)[][]) =>
  cells.map((r) => r.map((c) => (typeof c === 'number' ? String(c) : /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n') + '\n';
const n = (x: number, d = 4) => Number(x.toFixed(d));

const ranked = [...rows.values()].sort((a, b) => b.rating - a.rating);
const ratings = [
  ['rank', 'school', 'rating', 'competitions', 'provisional', 'peak'],
  ...ranked.map((r, i) => [i + 1, r.school, n(r.rating, 2), r.events, r.provisional ? 'yes' : 'no', n(r.peak, 2)]),
];

const order = chronological(events);
const changes: (string | number)[][] = [
  ['step', 'event_id', 'event', 'term', 'season', 'dates', 'teams_in_field', 'school', 'teams', 'best_tier', 'before', 'k', 'weight', 'ahead', 'behind', 'expected', 'change', 'after'],
];
let step = 0;
for (const e of order) {
  const field = teamsOf(e);
  for (const r of rows.values()) {
    const h = r.history.find((x) => x.eventId === e.id);
    if (!h) continue;
    changes.push([++step, e.id, e.name, e.term, e.season, e.dates ?? '', field.length, r.school, h.teams, h.tier, n(h.before), h.k, n(h.weight, 6), h.ahead, h.behind, n(h.expected, 6), n(h.after - h.before), n(h.after)]);
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(new URL('ratings.csv', out), csv(ratings));
writeFileSync(new URL('rating-changes.csv', out), csv(changes));
writeFileSync(new URL('events.json', out), JSON.stringify(events, null, 1) + '\n');
console.log(`wrote ${ranked.length} ratings and ${step} changes from ${events.length} competitions (start ${START}, up to ${GAMES_PER_EVENT} games per team)`);
