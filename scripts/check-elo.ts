// Sanity checks for school Elo ratings. Run with: npm run check:elo
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeElo, expectedScore, classOf } from '../src/lib/elo.ts';
import type { PastEvent } from '../src/lib/types.ts';

const ev = (id: string, ord: number, results: PastEvent['results'], participants: string[]): PastEvent => ({
  id, level: 'law_school', season: '2025-26', term: 'Fall', name: id, host: null, region: null, dates: null, teamCount: null, schoolCount: null, results, participants, needsReview: false, ord,
});
const W = (s: string) => ({ school: s, team: s, finish: 'winner' as const, place: 1 });
const F = (s: string) => ({ school: s, team: s, finish: 'finalist' as const, place: 2 });

// Everyone starts at 1500; ratings are zero-sum within an event.
const r1 = computeElo([ev('a', 0, [W('A'), F('B')], ['A', 'B', 'C', 'D'])]);
assert.equal([...r1.values()].reduce((s, r) => s + r.rating, 0), 6000);
assert.ok(r1.get('A')!.rating > r1.get('B')!.rating && r1.get('B')!.rating > r1.get('C')!.rating);
assert.equal(r1.get('C')!.rating, r1.get('D')!.rating, 'same round, no change between them');

// Beating a higher-rated school is worth more than beating an equal one.
const seq = computeElo([ev('late', 0, [W('C'), F('A')], ['A', 'C']), ev('early', 1, [W('A'), F('B')], ['A', 'B'])]);
const gainVsStrong = seq.get('C')!.rating - 1500;
assert.ok(gainVsStrong > 20, `upset gain ${gainVsStrong}`);

assert.ok(Math.abs(expectedScore(1700, 1500) - 0.76) < 0.01);
assert.equal(classOf(2050), 'Expert');

// Real data: UCLA first, Drexel second.
const real = JSON.parse(readFileSync(new URL('../src/data/history-law-school.json', import.meta.url), 'utf8')) as PastEvent[];
const ranked = [...computeElo(real).values()].sort((a, b) => b.rating - a.rating);
assert.deepEqual(ranked.slice(0, 2).map((r) => r.school), ['UCLA', 'Drexel']);
console.log('elo checks passed; top 5:', ranked.slice(0, 5).map((r) => `${r.school} ${Math.round(r.rating)}`).join(', '));
