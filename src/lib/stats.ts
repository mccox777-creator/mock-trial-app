// Student, coach and school stats from rosters and individual awards.
// Only competitions with published results count, so nothing leaks before the organizer is ready.
import { computeStandings, resultFor } from './scoring';
import { ordinal } from './history';
import { AWARD_KINDS, type AppData, type Award, type AwardKind, type ClassYear, type Match, type RosterEntry, type Tournament, type TrialRole } from './types';

/** Does a student who plays these parts fit this award? Advocacy awards go to attorneys, best witness to witnesses. */
export function fitsAward(kind: AwardKind, roles: TrialRole[] = []) {
  if (kind === 'other') return true;
  const want = kind === 'best_witness' ? 'witness' : 'attorney';
  return roles.some((r) => r.endsWith(want));
}

/** Trials won and lost on each side. Tied trials are left out. */
export interface SideRecord { pW: number; pL: number; dW: number; dL: number }
export const emptySide = (): SideRecord => ({ pW: 0, pL: 0, dW: 0, dL: 0 });
export const addSide = (a: SideRecord, b: SideRecord): SideRecord => ({ pW: a.pW + b.pW, pL: a.pL + b.pL, dW: a.dW + b.dW, dL: a.dL + b.dL });
export const sideText = (s: SideRecord) => `P ${s.pW}-${s.pL} · D ${s.dW}-${s.dL}`;

export interface PlayedMatch { m: Match; t: Tournament; winner: 'p' | 'd' | 'tie' }

/** Every scored trial at a competition with published results. */
export function publishedMatches(data: AppData): PlayedMatch[] {
  const published = new Map(data.tournaments.filter((t) => t.resultsPublished).map((t) => [t.id, t]));
  const out: PlayedMatch[] = [];
  for (const m of data.matches) {
    const t = published.get(m.tournamentId);
    if (!t) continue;
    const r = resultFor(m.id, data.ballots);
    if (r.winner) out.push({ m, t, winner: r.winner });
  }
  return out;
}

/** One team's side record, from the trials given. sides limits it to the sides a student plays. */
export function teamSide(played: PlayedMatch[], teamId: string, tournamentId?: string, sides: ('p' | 'd')[] = ['p', 'd']): SideRecord {
  const s = emptySide();
  for (const { m, winner } of played) {
    if (tournamentId && m.tournamentId !== tournamentId) continue;
    if (winner === 'tie') continue;
    if (m.pTeamId === teamId && sides.includes('p')) winner === 'p' ? s.pW++ : s.pL++;
    if (m.dTeamId === teamId && sides.includes('d')) winner === 'd' ? s.dW++ : s.dL++;
  }
  return s;
}

/** "Pat  Lee." and "pat lee" are the same person at the same school. */
export const normName = (s: string) => s.trim().toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ');

/** Identifies one person across competitions: their role, school and name. */
export const personKey = (role: RosterEntry['role'], programId: string, name: string) => `${role}:${programId}:${normName(name)}`;

export function awardKindLabel(kind: AwardKind) {
  return AWARD_KINDS.find((k) => k.id === kind)?.label ?? 'Award';
}

/** "Best Advocate, 1st" or the organizer's own name for it. */
export function awardTitle(a: Pick<Award, 'kind' | 'label' | 'place'>) {
  const name = a.label.trim() || awardKindLabel(a.kind);
  return a.place ? `${name}, ${ordinal(a.place)}` : name;
}

export interface PersonEvent {
  t: Tournament;
  teamId: string;
  classYear: ClassYear | null;
  wins: number;
  losses: number;
  rank: number | null;
  of: number;
  /** Students: awards they won. Coaches: awards their team won. */
  awards: Award[];
  /** Students: only the sides they play (both if no parts were listed). */
  side: SideRecord;
  roles: TrialRole[];
}

export interface PersonStats {
  key: string;
  name: string;
  role: RosterEntry['role'];
  programId: string;
  /** Newest first. */
  events: PersonEvent[];
  wins: number;
  losses: number;
  awards: Award[];
  /** Year at their most recent competition. */
  classYear: ClassYear | null;
  side: SideRecord;
  /** Competitions their team won (placed first), and finished in the top three. */
  titles: number;
  top3: number;
  /** Every part they have played. */
  roles: TrialRole[];
}

export const winPct = (w: number, l: number) => (w + l ? Math.round((100 * w) / (w + l)) : null);

/** Every student and coach listed on a roster at a published competition. */
export function peopleStats(data: AppData): Map<string, PersonStats> {
  const published = new Map(data.tournaments.filter((t) => t.resultsPublished).map((t) => [t.id, t]));
  const programOf = new Map(data.teams.map((t) => [t.id, t.programId]));
  const tables = new Map<string, ReturnType<typeof computeStandings>>();
  const standingsOf = (t: Tournament) => {
    let s = tables.get(t.id);
    if (!s) {
      s = computeStandings(data.matches.filter((m) => m.tournamentId === t.id), data.ballots, t.rankBy ?? 'ballots');
      tables.set(t.id, s);
    }
    return s;
  };
  const played = publishedMatches(data);
  const people = new Map<string, PersonStats>();
  for (const r of data.rosterEntries) {
    const t = published.get(r.tournamentId);
    const programId = programOf.get(r.teamId);
    if (!t || !programId || !r.name.trim()) continue;
    const key = personKey(r.role, programId, r.name);
    let p = people.get(key);
    if (!p) {
      p = { key, name: r.name.trim(), role: r.role, programId, events: [], wins: 0, losses: 0, awards: [], classYear: null, side: emptySide(), titles: 0, top3: 0, roles: [] };
      people.set(key, p);
    }
    if (p.events.some((e) => e.t.id === t.id)) continue; // listed twice on one roster
    const table = standingsOf(t);
    const row = table.find((s) => s.teamId === r.teamId);
    const mine = data.awards.filter((a) =>
      a.tournamentId === t.id && a.teamId === r.teamId &&
      (r.role === 'coach' || a.rosterEntryId === r.id || (!a.rosterEntryId && normName(a.recipient) === normName(r.name))),
    );
    const roles = r.roles ?? [];
    const sides = roles.length ? (['p', 'd'] as const).filter((x) => roles.some((y) => y.startsWith(x))) : (['p', 'd'] as ('p' | 'd')[]);
    p.events.push({ t, teamId: r.teamId, classYear: r.classYear, wins: row?.wins ?? 0, losses: row?.losses ?? 0, rank: row?.rank ?? null, of: table.length, awards: mine, side: teamSide(played, r.teamId, t.id, [...sides]), roles });
  }
  for (const p of people.values()) {
    p.events.sort((a, b) => b.t.startDate.localeCompare(a.t.startDate));
    p.wins = p.events.reduce((n, e) => n + e.wins, 0);
    p.losses = p.events.reduce((n, e) => n + e.losses, 0);
    p.awards = p.events.flatMap((e) => e.awards);
    p.classYear = p.events.find((e) => e.classYear)?.classYear ?? null;
    p.side = p.events.reduce((a, e) => addSide(a, e.side), emptySide());
    p.titles = p.events.filter((e) => e.rank === 1).length;
    p.top3 = p.events.filter((e) => e.rank !== null && e.rank <= 3).length;
    p.roles = [...new Set(p.events.flatMap((e) => e.roles))];
  }
  return people;
}

/** Most awards first; then most top awards; then most competitions. */
export function rankPeople(list: PersonStats[]) {
  return [...list].sort((a, b) =>
    b.awards.length - a.awards.length ||
    b.awards.filter((x) => x.place === 1).length - a.awards.filter((x) => x.place === 1).length ||
    b.events.length - a.events.length ||
    a.name.localeCompare(b.name));
}

/** Coaches by win rate, with at least one trial; ties go to more trials. */
export function rankCoaches(list: PersonStats[]) {
  return [...list].sort((a, b) =>
    (winPct(b.wins, b.losses) ?? -1) - (winPct(a.wins, a.losses) ?? -1) ||
    b.wins + b.losses - (a.wins + a.losses) ||
    a.name.localeCompare(b.name));
}

export interface SchoolAwards {
  programId: string;
  name: string;
  total: number;
  /** Awards placed first (or unranked awards, which count as a win). */
  top: number;
  byKind: Partial<Record<AwardKind, number>>;
  competitions: number;
}

/** Schools ranked by individual awards won at published competitions, optionally for one kind of award. */
export function schoolAwards(data: AppData, kind: AwardKind | 'all' = 'all', season?: (t: Tournament) => boolean): SchoolAwards[] {
  const published = new Map(data.tournaments.filter((t) => t.resultsPublished && (!season || season(t))).map((t) => [t.id, t]));
  const programOf = new Map(data.teams.map((t) => [t.id, t.programId]));
  const rows = new Map<string, SchoolAwards & { events: Set<string> }>();
  for (const a of data.awards) {
    if (!published.has(a.tournamentId) || (kind !== 'all' && a.kind !== kind)) continue;
    const programId = programOf.get(a.teamId);
    if (!programId) continue;
    let row = rows.get(programId);
    if (!row) {
      row = { programId, name: data.programs.find((p) => p.id === programId)?.name ?? 'Unknown school', total: 0, top: 0, byKind: {}, competitions: 0, events: new Set() };
      rows.set(programId, row);
    }
    row.total += 1;
    if (!a.place || a.place === 1) row.top += 1;
    row.byKind[a.kind] = (row.byKind[a.kind] ?? 0) + 1;
    row.events.add(a.tournamentId);
  }
  return [...rows.values()]
    .map(({ events, ...r }) => ({ ...r, competitions: events.size }))
    .sort((a, b) => b.total - a.total || b.top - a.top || a.name.localeCompare(b.name));
}

/** The most recent roster this team filed, to start a new registration from. */
export function lastRoster(data: AppData, teamId: string): RosterEntry[] {
  const byT = new Map(data.tournaments.map((t) => [t.id, t.startDate]));
  const mine = data.rosterEntries.filter((r) => r.teamId === teamId);
  const latest = mine.reduce<string | null>((best, r) => (!best || (byT.get(r.tournamentId) ?? '') > (byT.get(best) ?? '') ? r.tournamentId : best), null);
  return latest ? mine.filter((r) => r.tournamentId === latest) : [];
}

/** Seasons that have published awards, newest first. */
export function awardSeasons(data: AppData, seasonOf: (date: string) => string) {
  const ids = new Set(data.awards.map((a) => a.tournamentId));
  return [...new Set(data.tournaments.filter((t) => t.resultsPublished && ids.has(t.id)).map((t) => seasonOf(t.startDate)))].sort().reverse();
}

export interface SchoolRecord {
  programId: string;
  name: string;
  wins: number;
  losses: number;
  side: SideRecord;
  competitions: number;
  titles: number;
  top3: number;
}

/** Every school's trial record at published competitions in the app, with side splits and first-place finishes. */
export function schoolRecords(data: AppData): SchoolRecord[] {
  const played = publishedMatches(data);
  const programOf = new Map(data.teams.map((t) => [t.id, t.programId]));
  const rows = new Map<string, SchoolRecord & { events: Set<string> }>();
  const row = (programId: string) => {
    let r = rows.get(programId);
    if (!r) {
      r = { programId, name: data.programs.find((p) => p.id === programId)?.name ?? 'Unknown school', wins: 0, losses: 0, side: emptySide(), competitions: 0, titles: 0, top3: 0, events: new Set() };
      rows.set(programId, r);
    }
    return r;
  };
  for (const { m, winner } of played) {
    if (winner === 'tie') continue;
    for (const side of ['p', 'd'] as const) {
      const prog = programOf.get(side === 'p' ? m.pTeamId : m.dTeamId);
      if (!prog) continue;
      const r = row(prog);
      r.events.add(m.tournamentId);
      const won = winner === side;
      if (won) r.wins++; else r.losses++;
      if (side === 'p') won ? r.side.pW++ : r.side.pL++;
      else won ? r.side.dW++ : r.side.dL++;
    }
  }
  for (const t of data.tournaments.filter((x) => x.resultsPublished)) {
    const table = computeStandings(data.matches.filter((m) => m.tournamentId === t.id), data.ballots, t.rankBy ?? 'ballots');
    const seen = new Set<string>();
    for (const s of table.filter((x) => x.rank <= 3)) {
      const prog = programOf.get(s.teamId);
      if (!prog) continue;
      if (s.rank === 1) row(prog).titles++;
      if (!seen.has(prog)) { row(prog).top3++; seen.add(prog); }
    }
  }
  return [...rows.values()]
    .map(({ events, ...r }) => ({ ...r, competitions: events.size }))
    .sort((a, b) => b.titles - a.titles || (winPct(b.wins, b.losses) ?? 0) - (winPct(a.wins, a.losses) ?? 0) || a.name.localeCompare(b.name));
}

export interface HeadToHead { aWins: number; bWins: number; ties: number; trials: (PlayedMatch & { aSide: 'p' | 'd' })[] }

/** How two schools have done against each other at published competitions, newest first. */
export function headToHead(data: AppData, a: string, b: string): HeadToHead {
  const programOf = new Map(data.teams.map((t) => [t.id, t.programId]));
  const out: HeadToHead = { aWins: 0, bWins: 0, ties: 0, trials: [] };
  for (const pm of publishedMatches(data)) {
    const p = programOf.get(pm.m.pTeamId);
    const d = programOf.get(pm.m.dTeamId);
    const aSide = p === a && d === b ? 'p' : d === a && p === b ? 'd' : null;
    if (!aSide) continue;
    out.trials.push({ ...pm, aSide });
    if (pm.winner === 'tie') out.ties++;
    else if (pm.winner === aSide) out.aWins++;
    else out.bWins++;
  }
  out.trials.sort((x, y) => y.t.startDate.localeCompare(x.t.startDate) || y.m.round - x.m.round);
  return out;
}
