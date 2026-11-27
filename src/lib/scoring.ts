import type { Ballot, Match, Team, Tournament } from './types';

export interface MatchResult {
  pBallots: number;
  dBallots: number;
  pointDiff: number; // P total minus D total
  ballotCount: number;
  winner: 'p' | 'd' | 'tie' | null; // null = no ballots yet
}

/** Ballots are won by the side with the higher score; a tied ballot splits 0.5 / 0.5. */
export function resultFor(matchId: string, ballots: Ballot[]): MatchResult {
  const mine = ballots.filter((b) => b.matchId === matchId);
  let p = 0;
  let d = 0;
  let diff = 0;
  for (const b of mine) {
    if (b.pScore > b.dScore) p += 1;
    else if (b.dScore > b.pScore) d += 1;
    else {
      p += 0.5;
      d += 0.5;
    }
    diff += b.pScore - b.dScore;
  }
  const winner = mine.length === 0 ? null : p > d ? 'p' : d > p ? 'd' : 'tie';
  return { pBallots: p, dBallots: d, pointDiff: diff, ballotCount: mine.length, winner };
}

export interface Standing {
  teamId: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  ballots: number;
  ballotsPossible: number;
  /** Combined strength: sum of opponents' wins (AMTA-style tiebreak). */
  cs: number;
  pointDiff: number;
  rounds: number;
  pRounds: number;
  dRounds: number;
}

/**
 * Standings ordered by wins, then ballots won, then combined strength,
 * then point differential. Teams with no scored rounds are left out.
 */
export function computeStandings(matches: Match[], ballots: Ballot[], rankBy: 'ballots' | 'wins' = 'ballots'): Standing[] {
  const table = new Map<string, Standing & { opps: string[] }>();
  const row = (id: string) => {
    let r = table.get(id);
    if (!r) {
      r = { teamId: id, rank: 0, wins: 0, losses: 0, ties: 0, ballots: 0, ballotsPossible: 0, cs: 0, pointDiff: 0, rounds: 0, pRounds: 0, dRounds: 0, opps: [] };
      table.set(id, r);
    }
    return r;
  };

  for (const m of matches) {
    const res = resultFor(m.id, ballots);
    if (res.winner === null) continue;
    const P = row(m.pTeamId);
    const D = row(m.dTeamId);
    P.ballots += res.pBallots;
    D.ballots += res.dBallots;
    P.ballotsPossible += res.ballotCount;
    D.ballotsPossible += res.ballotCount;
    P.pointDiff += res.pointDiff;
    D.pointDiff -= res.pointDiff;
    P.rounds += 1;
    D.rounds += 1;
    P.pRounds += 1;
    D.dRounds += 1;
    P.opps.push(m.dTeamId);
    D.opps.push(m.pTeamId);
    if (res.winner === 'p') {
      P.wins += 1;
      D.losses += 1;
    } else if (res.winner === 'd') {
      D.wins += 1;
      P.losses += 1;
    } else {
      P.ties += 1;
      D.ties += 1;
    }
  }

  const rows = [...table.values()];
  for (const r of rows) r.cs = r.opps.reduce((sum, o) => sum + (table.get(o)?.wins ?? 0), 0);
  // Ranked continuously as ballots arrive: ballots won (or trials won) first, then the other, then combined strength, then point differential.
  rows.sort((a, b) =>
    rankBy === 'ballots'
      ? b.ballots - a.ballots || b.wins - a.wins || b.cs - a.cs || b.pointDiff - a.pointDiff
      : b.wins - a.wins || b.ballots - a.ballots || b.cs - a.cs || b.pointDiff - a.pointDiff,
  );

  let prevKey = '';
  rows.forEach((r, i) => {
    const key = `${r.wins}|${r.ballots}|${r.cs}|${r.pointDiff}`;
    r.rank = key === prevKey ? rows[i - 1].rank : i + 1;
    prevKey = key;
  });
  return rows.map(({ opps, ...rest }) => rest);
}

export type PowerStyle = 'high_high' | 'high_low' | 'slide';
export type SideRule = 'alternate' | 'flip_even' | 'balanced' | 'none';

export interface PairingSettings {
  method: 'power' | 'random';
  /** Rounds up to and including this one are drawn at random. */
  randomRounds?: number;
  sideConstraint: SideRule;
  /** high_high: 1 v 2, 3 v 4. high_low: best v worst. slide: top half v bottom half (1 v 5 of 8). */
  powerStyle?: PowerStyle;
  /** Pair inside groups with the same record first, moving one team down when a group is odd. */
  bracketed?: boolean;
  /** Never pair two teams from the same school. */
  avoidSameSchool?: boolean;
  rankBy?: 'ballots' | 'wins';
}

export interface PairingResult {
  pairs: { pTeamId: string; dTeamId: string }[];
  /** The team sitting out, when the number of teams is odd. */
  bye: string | null;
  /** Teams in the order they were seeded for this round. */
  order: string[];
  /** Plain-language reasons for each place the draw moved away from the straight power match. */
  notes: string[];
}

/**
 * Suggest pairings for the next round.
 *
 * The first `randomRounds` rounds are random. Later rounds are power-matched (or random) using the
 * chosen style. Hard rules: no rematches, no two teams from the same school (when on), and each team
 * plays the side it is owed (alternate: every round flips; flip_even: rounds 2, 4, 6 flip from the round
 * before). When a straight match breaks a rule, the team swaps to the nearest-ranked opponent that fits,
 * and a note says why. If no pairing satisfies every rule, side rules give way first, then rematches,
 * then same school, and the notes say so.
 */
export function suggestPairings(
  opts: PairingSettings & {
    teamIds: string[];
    round: number;
    priorMatches: Match[];
    ballots: Ballot[];
    seed?: number;
    schoolOf?: (teamId: string) => string | undefined;
    nameOf?: (teamId: string) => string;
  },
): PairingResult {
  const { teamIds, round, priorMatches, ballots, method, sideConstraint } = opts;
  const style: PowerStyle = opts.powerStyle ?? 'high_high';
  const avoidSchool = opts.avoidSameSchool ?? true;
  const name = opts.nameOf ?? ((id: string) => id);
  const rand = mulberry32(opts.seed ?? round * 7919);
  const powered = method === 'power' && round > Math.max(1, opts.randomRounds ?? 1);
  const notes: string[] = [];

  // Seed order: random, or by standings when power-matching.
  let order = shuffle([...teamIds], rand);
  const standings = computeStandings(priorMatches, ballots, opts.rankBy ?? 'ballots');
  const pos = new Map(standings.map((s, i) => [s.teamId, i]));
  const wins = new Map(standings.map((s) => [s.teamId, s.wins + s.ties / 2]));
  if (powered) order = order.sort((a, b) => (pos.get(a) ?? 999) - (pos.get(b) ?? 999));
  const rank = (id: string) => order.indexOf(id) + 1;
  const label = (id: string) => (powered ? `${name(id)} (#${rank(id)})` : name(id));

  // History: who met whom, sides played, byes.
  const faced = new Map<string, number>(); // "a|b" -> round
  const lastSide = new Map<string, 'p' | 'd'>();
  const lastRound = new Map<string, number>();
  const pCount = new Map<string, number>();
  const dCount = new Map<string, number>();
  for (const m of [...priorMatches].sort((a, b) => a.round - b.round)) {
    faced.set(`${m.pTeamId}|${m.dTeamId}`, m.round);
    faced.set(`${m.dTeamId}|${m.pTeamId}`, m.round);
    lastSide.set(m.pTeamId, 'p');
    lastSide.set(m.dTeamId, 'd');
    lastRound.set(m.pTeamId, m.round);
    lastRound.set(m.dTeamId, m.round);
    pCount.set(m.pTeamId, (pCount.get(m.pTeamId) ?? 0) + 1);
    dCount.set(m.dTeamId, (dCount.get(m.dTeamId) ?? 0) + 1);
  }
  const roundsPlayed = (id: string) => (pCount.get(id) ?? 0) + (dCount.get(id) ?? 0);

  /** The side a team is owed this round, or null when either side is fine. */
  const owed = (id: string): 'p' | 'd' | null => {
    const last = lastSide.get(id);
    if (!last || round === 1) return null;
    if (sideConstraint === 'alternate') return last === 'p' ? 'd' : 'p';
    if (sideConstraint === 'flip_even' && round % 2 === 0 && lastRound.get(id) === round - 1) return last === 'p' ? 'd' : 'p';
    return null;
  };

  // Odd field: the lowest seed who hasn't had a bye sits out.
  let bye: string | null = null;
  let pool = [...order];
  if (pool.length % 2 === 1) {
    const maxPlayed = Math.max(0, ...pool.map(roundsPlayed));
    const candidates = [...pool].reverse();
    bye = candidates.find((id) => roundsPlayed(id) >= maxPlayed) ?? candidates[0];
    pool = pool.filter((id) => id !== bye);
    notes.push(`${name(bye)} has the bye this round.`);
  }

  type Rule = 'side' | 'rematch' | 'school';
  const breaks = (a: string, b: string): Rule[] => {
    const out: Rule[] = [];
    const sa = owed(a);
    const sb = owed(b);
    if (sa && sb && sa === sb) out.push('side');
    if (faced.has(`${a}|${b}`)) out.push('rematch');
    if (avoidSchool && opts.schoolOf) {
      const x = opts.schoolOf(a);
      if (x && x === opts.schoolOf(b)) out.push('school');
    }
    return out;
  };
  const why = (a: string, b: string, r: Rule[]) =>
    r
      .map((x) =>
        x === 'side'
          ? `both are due to play ${owed(a) === 'p' ? 'plaintiff/prosecution' : 'defense'}`
          : x === 'rematch'
            ? `they already met in Round ${faced.get(`${a}|${b}`)}`
            : 'they are from the same school',
      )
      .join(' and ');

  /** Opponents for `a`, best first, given the teams still unpaired (a excluded, in seed order). */
  const preference = (a: string, rest: string[]): string[] => {
    let group = rest;
    if (powered && opts.bracketed) {
      const w = wins.get(a) ?? 0;
      const same = rest.filter((x) => (wins.get(x) ?? 0) === w);
      // An odd team at the bottom of its bracket is pulled down into the next one.
      if (same.length > 0) group = same;
      else {
        const below = rest.filter((x) => (wins.get(x) ?? 0) < w);
        const next = below.length ? Math.max(...below.map((x) => wins.get(x) ?? 0)) : null;
        group = next === null ? rest : rest.filter((x) => (wins.get(x) ?? 0) === next);
      }
    }
    const n = group.length;
    const ideal = !powered || style === 'high_high' ? 0 : style === 'high_low' ? n - 1 : Math.floor(n / 2);
    const inGroup = group
      .map((x, i) => ({ x, d: Math.abs(i - ideal), up: i < ideal ? 1 : 0 }))
      .sort((p, q) => p.d - q.d || p.up - q.up)
      .map((p) => p.x);
    const outside = rest.filter((x) => !group.includes(x)).sort((p, q) => Math.abs(rank(p) - rank(a)) - Math.abs(rank(q) - rank(a)));
    return [...inGroup, ...outside];
  };

  // Depth-first search in seed order. Try with every rule, then let rules give way one at a time.
  const levels: Rule[][] = [[], ['side'], ['side', 'rematch'], ['side', 'rematch', 'school']];
  let found: [string, string][] | null = null;
  for (const allowed of levels) {
    let budget = 20000;
    const solve = (rest: string[]): [string, string][] | null => {
      if (rest.length === 0) return [];
      if (--budget < 0) return null;
      const [a, ...others] = rest;
      const prefs = preference(a, others);
      const ranked = allowed.length ? [...prefs].sort((p, q) => breaks(a, p).length - breaks(a, q).length) : prefs;
      for (const b of ranked) {
        if (breaks(a, b).some((r) => !allowed.includes(r))) continue;
        const tail = solve(others.filter((x) => x !== b));
        if (tail) return [[a, b], ...tail];
      }
      return null;
    };
    found = solve(pool);
    if (found) break;
  }
  if (!found) found = [];

  // Explain each place the draw moved away from the straight match.
  if (powered) {
    const rest = [...pool];
    for (const [a, b] of found) {
      const others = rest.filter((x) => x !== a);
      const first = preference(a, others)[0];
      if (first && first !== b) {
        const r = breaks(a, first);
        notes.push(
          r.length
            ? `${label(a)} would have played ${label(first)}, but ${why(a, first, r)}. Paired with ${label(b)} instead.`
            : `${label(a)} plays ${label(b)} instead of ${label(first)} so the rest of the round fits the rules.`,
        );
      }
      rest.splice(rest.indexOf(a), 1);
      rest.splice(rest.indexOf(b), 1);
    }
  }
  for (const [a, b] of found) {
    const r = breaks(a, b);
    if (r.length) notes.push(`No pairing met every rule. ${name(a)} v ${name(b)} goes ahead although ${why(a, b, r)}.`);
  }

  const pairs = found.map(([a, b]) => assignSides(a, b));
  return { pairs, bye, order, notes };

  function assignSides(a: string, b: string) {
    const sa = owed(a);
    const sb = owed(b);
    const as = (p: string, d: string) => ({ pTeamId: p, dTeamId: d });
    if (sa === 'p' || sb === 'd') return sa === 'd' && sb === 'd' ? as(b, a) : as(a, b);
    if (sa === 'd' || sb === 'p') return as(b, a);
    if (sideConstraint !== 'none') {
      const ba = (pCount.get(a) ?? 0) - (dCount.get(a) ?? 0);
      const bb = (pCount.get(b) ?? 0) - (dCount.get(b) ?? 0);
      if (ba !== bb) return ba < bb ? as(a, b) : as(b, a);
    }
    return rand() < 0.5 ? as(a, b) : as(b, a);
  }
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** A competition's pairing settings, with defaults for older rows. */
export function pairingSettings(t: Tournament): PairingSettings {
  return {
    method: t.pairingMethod,
    randomRounds: t.randomRounds,
    sideConstraint: t.sideConstraint,
    powerStyle: t.powerStyle ?? 'high_high',
    bracketed: t.bracketed ?? false,
    avoidSameSchool: t.avoidSameSchool ?? true,
    rankBy: t.rankBy ?? 'ballots',
  };
}

export const POWER_STYLES = [
  { id: 'high_high', label: 'High v high', body: 'Best record plays the next best: 1 v 2, 3 v 4.' },
  { id: 'high_low', label: 'High v low', body: 'Best record plays the worst: 1 v 8, 2 v 7.' },
  { id: 'slide', label: 'Slide', body: 'Top half plays bottom half: with 8 teams, 1 v 5, 2 v 6.' },
] as const;

export const SIDE_RULES = [
  { id: 'alternate', label: 'Every round', body: 'Teams switch sides every round, so two teams that both played defense last round cannot meet.' },
  { id: 'flip_even', label: 'Every other', body: 'Rounds 2 and 4 switch from the round before. Rounds 1 and 3 are open, and sides even out after every two rounds.' },
  { id: 'balanced', label: 'Balanced', body: 'No forced switch. The app evens out each team\'s sides over the event.' },
  { id: 'none', label: 'Any', body: 'Sides are drawn at random.' },
] as const;

/** One line describing how a competition pairs rounds. */
export function describePairing(t: Tournament): string {
  const s = pairingSettings(t);
  const first = s.randomRounds === 1 ? 'Round 1' : `Rounds 1–${s.randomRounds}`;
  const how =
    s.method === 'power'
      ? `power-matched ${POWER_STYLES.find((x) => x.id === s.powerStyle)!.label.toLowerCase()}${s.bracketed ? ' within records' : ''}`
      : 'random';
  const sides =
    s.sideConstraint === 'alternate' ? 'sides switch every round' : s.sideConstraint === 'flip_even' ? 'sides switch every other round' : s.sideConstraint === 'balanced' ? 'sides balanced overall' : 'sides drawn at random';
  return `${first} drawn at random, then ${how} · ${sides} · no rematches${s.avoidSameSchool ? ' · no same-school trials' : ''}`;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function teamName(teams: Team[], id: string) {
  return teams.find((t) => t.id === id)?.name ?? 'Unknown team';
}
