// Sanity checks for school Elo ratings. Run with: npm run check:elo
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeElo, expectedScore, classOf, chronological, startDay, START, SCALE_SHIFT } from '../src/lib/elo.ts';
import type { PastEvent } from '../src/lib/types.ts';

const ev = (id: string, ord: number, results: PastEvent['results'], participants: string[]): PastEvent => ({
  id, level: 'law_school', season: '2025-26', term: 'Fall', name: id, host: null, region: null, dates: null, teamCount: null, schoolCount: null, results, participants, needsReview: false, ord,
});
const W = (s: string) => ({ school: s, team: s, finish: 'winner' as const, place: 1 });
const F = (s: string) => ({ school: s, team: s, finish: 'finalist' as const, place: 2 });

// Everyone starts at START (2300); ratings are zero-sum within an event.
const r1 = computeElo([ev('a', 0, [W('A'), F('B')], ['A', 'B', 'C', 'D'])]);
assert.equal([...r1.values()].reduce((s, r) => s + r.rating, 0), 4 * START);
assert.ok(r1.get('A')!.rating > r1.get('B')!.rating && r1.get('B')!.rating > r1.get('C')!.rating);
assert.equal(r1.get('C')!.rating, r1.get('D')!.rating, 'same round, no change between them');

// Beating a higher-rated school is worth more than beating an equal one.
const seq = computeElo([{ ...ev('late', 0, [W('C'), F('A')], ['A', 'C']), dates: 'November 7-9' }, { ...ev('early', 1, [W('A'), F('B')], ['A', 'B']), dates: 'September 12' }]);
const gainVsStrong = seq.get('C')!.rating - START;
assert.ok(gainVsStrong > 20, `upset gain ${gainVsStrong}`);

assert.ok(Math.abs(expectedScore(1700, 1500) - 0.76) < 0.01);
assert.equal(classOf(2050 + SCALE_SHIFT), 'Expert');
assert.equal(START, 1500 + SCALE_SHIFT);

// A closed in-app competition has full standings: 1st beats 2nd beats 3rd beats 4th.
const P = (s: string, place: number) => ({ school: s, team: s, finish: 'place' as const, place });
const app = { ...ev('app-t1', -20251020, [P('A', 1), P('B', 2), P('C', 3), P('D', 4)], []), tournamentId: 't1' };
const r3 = computeElo([app]);
assert.ok(r3.get('A')!.rating > r3.get('B')!.rating && r3.get('B')!.rating > r3.get('C')!.rating && r3.get('C')!.rating > r3.get('D')!.rating);
// ...and counts after the imported events of the same term, so it moves the ratings they built.
const r4 = computeElo([app, ev('imp', 0, [W('D'), F('C')], ['A', 'B', 'C', 'D'])]);
assert.deepEqual(r4.get('D')!.history.map((h) => h.eventId), ['imp', 'app-t1']);

// Competitions run in date order, whatever order the record lists them in.
const dated = (id: string, ord: number, dates: string | null) => ({ ...ev(id, ord, [W('A'), F('B')], ['A', 'B']), dates });
assert.equal(startDay(dated('x', 0, 'October 2-4')), 20251002);
assert.equal(startDay({ ...dated('y', 0, 'February 6-8'), term: 'Spring' }), 20260206);
assert.deepEqual(chronological([dated('nov', 0, 'November 7-9'), dated('sep', 1, 'September 12'), dated('none', 2, null)]).map((e) => e.id), ['sep', 'none', 'nov'], 'undated takes the date of the one listed before it');

// A competition with no results (everyone in the same round) doesn't count as played.
const empty = computeElo([ev('e', 0, [], ['A', 'B', 'C'])]);
assert.equal(empty.size, 0);
// 4th place finishes ahead of 5th.
const places = computeElo([ev('p', 0, [P('A', 1), P('B', 2), P('C', 3), P('D', 4), P('E', 5)], ['A', 'B', 'C', 'D', 'E', 'F'])]);
assert.ok(places.get('D')!.rating > places.get('E')!.rating && places.get('E')!.rating > places.get('F')!.rating);

// Every team counts: a second team that goes out early pulls its school down.
const one = computeElo([ev('o', 0, [W('A'), F('B')], ['A', 'B', 'C', 'D'])]);
const two = computeElo([ev('t', 0, [W('A'), F('B')], ['A', 'A 2', 'B', 'C', 'D'])]);
assert.ok(two.get('A')!.rating < one.get('A')!.rating, 'a weak second team costs points');
assert.equal(two.get('A')!.history[0].teams, 2);
// ...and two teams from one school never count against each other.
const final = computeElo([ev('f', 0, [{ school: 'A', team: 'A', finish: 'winner', place: 1 }, { school: 'A', team: 'A 2', finish: 'finalist', place: 2 }], ['A', 'A 2', 'B'])]);
assert.ok(final.get('A')!.rating > START && final.get('B')!.rating < START);

// Real data: UCLA first, Drexel second.
const real = JSON.parse(readFileSync(new URL('../src/data/history-law-school.json', import.meta.url), 'utf8')) as PastEvent[];
const ranked = [...computeElo(real).values()].sort((a, b) => b.rating - a.rating);
assert.deepEqual(ranked.slice(0, 2).map((r) => r.school), ['UCLA', 'Drexel']);
console.log('elo checks passed; top 5:', ranked.slice(0, 5).map((r) => `${r.school} ${Math.round(r.rating)}`).join(', '));

// The published files (npm run ratings:export) must match what the app computes.
const published = readFileSync(new URL('../public/ratings-data/ratings.csv', import.meta.url), 'utf8').trim().split('\n').slice(1);
assert.equal(published.length, ranked.length, 'public/ratings-data is out of date: run npm run ratings:export');
for (const [i, line] of published.entries()) {
  const [, school, rating] = line.match(/^\d+,("(?:[^"]|"")*"|[^,]*),([\d.]+)/)!;
  assert.equal(school.replace(/^"|"$/g, '').replace(/""/g, '"'), ranked[i].school, 'public/ratings-data is out of date: run npm run ratings:export');
  assert.ok(Math.abs(Number(rating) - ranked[i].rating) < 0.01, 'public/ratings-data is out of date: run npm run ratings:export');
}
