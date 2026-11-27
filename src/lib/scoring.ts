import type { Ballot, Match, Team } from './types';

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
export function computeStandings(matches: Match[], ballots: Ballot[]): Standing[] {
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
  rows.sort((a, b) => b.wins - a.wins || b.ballots - a.ballots || b.cs - a.cs || b.pointDiff - a.pointDiff);

  let prevKey = '';
  rows.forEach((r, i) => {
    const key = `${r.wins}|${r.ballots}|${r.cs}|${r.pointDiff}`;
    r.rank = key === prevKey ? rows[i - 1].rank : i + 1;
    prevKey = key;
  });
  return rows.map(({ opps, ...rest }) => rest);
}

/**
 * Suggest pairings for the next round.
 * The first `randomRounds` rounds are random. Later rounds: power-matched by record (or random), avoiding
 * rematches, with sides flipped from each team's previous round when the
 * tournament uses the "alternate" side constraint.
 */
export function suggestPairings(opts: {
  teamIds: string[];
  round: number;
  priorMatches: Match[];
  ballots: Ballot[];
  method: 'power' | 'random';
  /** Rounds up to and including this one are drawn at random. */
  randomRounds?: number;
  sideConstraint: 'alternate' | 'balanced' | 'none';
  seed?: number;
}): { pTeamId: string; dTeamId: string }[] {
  const { teamIds, round, priorMatches, ballots, method, sideConstraint } = opts;
  const rand = mulberry32(opts.seed ?? round * 7919);
  let order = [...teamIds].sort(() => rand() - 0.5);

  if (round > Math.max(1, opts.randomRounds ?? 1) && method === 'power') {
    const standings = computeStandings(priorMatches, ballots);
    const pos = new Map(standings.map((s, i) => [s.teamId, i]));
    order = order.sort((a, b) => (pos.get(a) ?? 999) - (pos.get(b) ?? 999));
  }

  const faced = new Set(priorMatches.flatMap((m) => [`${m.pTeamId}|${m.dTeamId}`, `${m.dTeamId}|${m.pTeamId}`]));
  const lastSide = new Map<string, 'p' | 'd'>();
  const sideCount = new Map<string, number>(); // +1 per P round, -1 per D round
  for (const m of [...priorMatches].sort((a, b) => a.round - b.round)) {
    lastSide.set(m.pTeamId, 'p');
    lastSide.set(m.dTeamId, 'd');
    sideCount.set(m.pTeamId, (sideCount.get(m.pTeamId) ?? 0) + 1);
    sideCount.set(m.dTeamId, (sideCount.get(m.dTeamId) ?? 0) - 1);
  }

  const pool = [...order];
  const pairs: { pTeamId: string; dTeamId: string }[] = [];
  while (pool.length > 1) {
    const a = pool.shift()!;
    let idx = pool.findIndex((b) => !faced.has(`${a}|${b}`) && sidesFit(a, b));
    if (idx === -1) idx = pool.findIndex((b) => !faced.has(`${a}|${b}`));
    if (idx === -1) idx = 0;
    const b = pool.splice(idx, 1)[0];
    pairs.push(assignSides(a, b));
  }
  return pairs;

  function sidesFit(a: string, b: string) {
    if (sideConstraint !== 'alternate' || round === 1) return true;
    return lastSide.get(a) !== lastSide.get(b);
  }
  function assignSides(a: string, b: string) {
    if (sideConstraint === 'alternate' && round > 1) {
      if (lastSide.get(a) === 'd' || lastSide.get(b) === 'p') return { pTeamId: a, dTeamId: b };
      return { pTeamId: b, dTeamId: a };
    }
    if (sideConstraint === 'balanced') {
      return (sideCount.get(a) ?? 0) <= (sideCount.get(b) ?? 0) ? { pTeamId: a, dTeamId: b } : { pTeamId: b, dTeamId: a };
    }
    return rand() < 0.5 ? { pTeamId: a, dTeamId: b } : { pTeamId: b, dTeamId: a };
  }
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
