// Checks for the pairing engine. Run with: npm run check:pairings
import assert from 'node:assert/strict';
import { suggestPairings, type PairingSettings } from '../src/lib/scoring.ts';
import type { Ballot, Match } from '../src/lib/types.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok  ${name}`);
}

const T = (n: number) => Array.from({ length: n }, (_, i) => `t${i + 1}`);
let mid = 0;
/** A played round: winners listed first in each pair, P side first. */
function played(round: number, pairs: [string, string][], winner: 'p' | 'd' = 'p'): { m: Match[]; b: Ballot[] } {
  const m: Match[] = [];
  const b: Ballot[] = [];
  for (const [p, d] of pairs) {
    const id = `m${++mid}`;
    m.push({ id, tournamentId: 'x', round, startsAt: '', courtroom: '', judgeIds: [], pTeamId: p, dTeamId: d });
    b.push({ id: `${id}b`, matchId: id, judge: 'J', judgeId: null, source: 'paper', sheet: null, pScore: winner === 'p' ? 100 : 90, dScore: winner === 'p' ? 90 : 100, enteredBy: '', enteredAt: '' } as Ballot);
  }
  return { m, b };
}
const base: PairingSettings = { method: 'power', randomRounds: 1, sideConstraint: 'none', powerStyle: 'high_high', bracketed: false, avoidSameSchool: true };
const opp = (pairs: { pTeamId: string; dTeamId: string }[], id: string) => {
  const p = pairs.find((x) => x.pTeamId === id || x.dTeamId === id)!;
  return p.pTeamId === id ? p.dTeamId : p.pTeamId;
};

// Round 1 among 8 teams: t1..t4 win (they are P and win). Standings after: t1..t4 1-0, t5..t8 0-1.
// Use distinct ballot counts to fix the order: give winners different margins via extra ballots.
function season() {
  const r1 = played(1, [['t1', 't8'], ['t2', 't7'], ['t3', 't6'], ['t4', 't5']]);
  // Extra ballot to separate: t1 gets 3 ballots, t2 2, ... done by adding ballots to the same match.
  const extra: Ballot[] = [];
  const add = (matchIdx: number, k: number) => {
    for (let i = 0; i < k; i++) extra.push({ ...r1.b[matchIdx], id: `${r1.b[matchIdx].id}-${i}` });
  };
  add(0, 3); add(1, 2); add(2, 1);
  return { m: r1.m, b: [...r1.b, ...extra] };
}

check('high v high pairs 1 v 2 and 3 v 4', () => {
  const s = season();
  const r = suggestPairings({ ...base, teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  assert.equal(r.order[0], 't1');
  assert.equal(opp(r.pairs, 't1'), 't2');
  assert.equal(opp(r.pairs, 't3'), 't4');
});

check('high v low pairs best with worst', () => {
  const s = season();
  const r = suggestPairings({ ...base, powerStyle: 'high_low', teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  const last = r.order[7];
  // t1 already met t8 in round 1, so it slides to the next-worst team, with a note.
  assert.notEqual(opp(r.pairs, 't1'), 't8');
  assert.equal(r.order.indexOf(opp(r.pairs, 't1')), 6);
  assert.ok(r.notes.some((n) => n.includes('already met')), r.notes.join('\n'));
  assert.ok(last);
});

check('slide pairs top half with bottom half', () => {
  const s = season();
  const r = suggestPairings({ ...base, powerStyle: 'slide', teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  assert.equal(r.order.indexOf(opp(r.pairs, r.order[0])), 4);
});

check('alternate: two teams that both played defense cannot meet', () => {
  const s = season();
  const r = suggestPairings({ ...base, sideConstraint: 'alternate', teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  // t1 and t2 both played P in round 1, so both owe defense; t1 must not play t2.
  assert.notEqual(opp(r.pairs, 't1'), 't2');
  for (const p of r.pairs) {
    assert.ok(['t5', 't6', 't7', 't8'].includes(p.pTeamId), `round 1 defense teams take P now: ${JSON.stringify(p)}`);
  }
  assert.ok(r.notes.some((n) => n.includes('both are due to play defense')), r.notes.join('\n'));
});

check('flip every other round: round 3 is open, round 4 flips', () => {
  const s = season();
  const r3 = suggestPairings({ ...base, sideConstraint: 'flip_even', teamIds: T(8), round: 3, priorMatches: s.m, ballots: s.b, seed: 1 });
  assert.equal(opp(r3.pairs, 't1'), 't2'); // no side rule in odd rounds
  const r2 = suggestPairings({ ...base, sideConstraint: 'flip_even', teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  assert.notEqual(opp(r2.pairs, 't1'), 't2');
});

check('same school never meets when that setting is on', () => {
  const s = season();
  const school = (id: string) => (id === 't1' || id === 't2' ? 'A' : id);
  const on = suggestPairings({ ...base, teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1, schoolOf: school });
  assert.notEqual(opp(on.pairs, 't1'), 't2');
  assert.ok(on.notes.some((n) => n.includes('same school')));
  const off = suggestPairings({ ...base, avoidSameSchool: false, teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1, schoolOf: school });
  assert.equal(opp(off.pairs, 't1'), 't2');
});

check('no rematches across many seeds and settings', () => {
  for (const sideConstraint of ['alternate', 'flip_even', 'balanced', 'none'] as const)
    for (const powerStyle of ['high_high', 'high_low', 'slide'] as const)
      for (const bracketed of [false, true])
        for (let seed = 1; seed <= 15; seed++) {
          const matches: Match[] = [];
          const ballots: Ballot[] = [];
          for (let round = 1; round <= 4; round++) {
            const r = suggestPairings({ ...base, sideConstraint, powerStyle, bracketed, teamIds: T(10), round, priorMatches: matches, ballots, seed: seed * 10 + round });
            assert.equal(r.pairs.length, 5);
            const met = new Set(matches.map((m) => [m.pTeamId, m.dTeamId].sort().join('|')));
            for (const p of r.pairs) assert.ok(!met.has([p.pTeamId, p.dTeamId].sort().join('|')), `rematch ${sideConstraint} ${powerStyle} seed ${seed}`);
            if (sideConstraint === 'alternate' && round > 1)
              for (const p of r.pairs) assert.equal(matches.filter((m) => m.round === round - 1).find((m) => m.pTeamId === p.pTeamId) ? 'p' : 'd', 'd');
            const pr = played(round, r.pairs.map((p) => [p.pTeamId, p.dTeamId]), seed % 2 ? 'p' : 'd');
            matches.push(...pr.m);
            ballots.push(...pr.b);
          }
          if (sideConstraint === 'flip_even' || sideConstraint === 'alternate')
            for (const id of T(10)) assert.equal(matches.filter((m) => m.pTeamId === id).length, 2, `${id} plays P twice in 4 rounds`);
        }
});

check('bracketed: same record plays same record first', () => {
  const s = season();
  const r = suggestPairings({ ...base, powerStyle: 'high_low', bracketed: true, teamIds: T(8), round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  const winners = ['t1', 't2', 't3', 't4'];
  for (const w of winners) assert.ok(winners.includes(opp(r.pairs, w)));
  assert.equal(opp(r.pairs, 't1'), 't4'); // high v low inside the 1-0 group
});

check('odd field: lowest seed gets the bye, and not twice in a row', () => {
  const s = season();
  const teams = [...T(8), 't9'];
  const r = suggestPairings({ ...base, teamIds: teams, round: 2, priorMatches: s.m, ballots: s.b, seed: 1 });
  // t9 sat out round 1, so the bye goes to the lowest seed that has played: t8.
  assert.equal(r.bye, 't8');
  assert.ok(r.pairs.some((p) => p.pTeamId === 't9' || p.dTeamId === 't9'));
  assert.equal(r.pairs.length, 4);
});

console.log(`\n${passed} pairing checks passed`);
