// The public school Elo leaderboard, built with the same code the app uses (src/lib/elo.ts and
// src/lib/closedCompetitions.ts), so a site that shows it always matches the app.
import type { Ballot, Level, Match, PastEvent, Program, Team, Tournament } from '../src/lib/types';
import { eloFor, classOf, chronological } from '../src/lib/elo';
import { closedCompetitionEvents } from '../src/lib/closedCompetitions';
import { schoolOfTeam } from '../src/lib/history';
import { DIVISIONS, ENROLLMENT_SOURCE, SELECTIVITY, divisionOf, enrollmentOf, gpaOf, lsatOf, selectivityOf, type DivisionId, type SelectivityId, type TierId } from '../src/lib/divisions';

export interface LiveData {
  pastEvents: PastEvent[];
  tournaments: Tournament[];
  matches: Match[];
  ballots: Ballot[];
  teams: Team[];
  programs: Program[];
}

export interface RatingRow {
  rank: number;
  school: string;
  rating: number;
  peak: number;
  /** Competitions counted. */
  events: number;
  /** Under 5 competitions, as in chess. */
  provisional: boolean;
  /** US Chess class name, e.g. "Expert". */
  class: string;
  /** Points gained or lost at the school's most recent competition. */
  lastChange: number;
  lastEvent: string | null;
  /** Total JD enrollment (ABA Standard 509), or null when the ABA has no figure for the school. */
  enrollment: number | null;
  /** Size division, or null when enrollment is unknown (the school is then only in the overall list). */
  division: DivisionId | null;
  /** Place within its division, or null. */
  divisionRank: number | null;
  /** Median LSAT and undergraduate GPA of the entering class (ABA Standard 509), or null. */
  lsat: number | null;
  gpa: number | null;
  /** Selectivity tier by median LSAT, or null when unknown. */
  selectivity: SelectivityId | null;
  /** Place within its selectivity tier, or null. */
  selectivityRank: number | null;
}

export interface DivisionBoard<T extends TierId = DivisionId> {
  id: T;
  label: string;
  short: string;
  /** Range of the measure (total JD enrollment, or median LSAT): min inclusive, max exclusive (null = no limit). */
  min: number;
  max: number | null;
  /** Schools rated in this division. */
  schools: number;
  /** Top schools in the group, best first; rank is the overall rank, divisionRank / selectivityRank the place in the group. */
  ratings: RatingRow[];
}

export interface Leaderboard {
  level: Level;
  updatedAt: string;
  /** Competitions counted in all: the bundled record, database rows, and closed app competitions. */
  competitions: number;
  /** Most recent competition counted. */
  latest: { name: string; season: string; term: string } | null;
  /** False when the live database could not be reached and only the shipped record was used. */
  live: boolean;
  /** Overall top schools, best first. */
  ratings: RatingRow[];
  /** The same ratings grouped by school size (football style), each with its own top list. */
  divisions: DivisionBoard[];
  /** The same ratings grouped by median LSAT ("the elites compared to the elites"), each with its own top list. */
  selectivity: DivisionBoard<SelectivityId>[];
  /** Where school sizes and LSAT medians come from. */
  enrollmentSource: { source: string; url: string; year: number };
}

/** Mirrors useHistory in src/lib/store.tsx: shipped record, replaced by database rows with the same id, plus closed competitions. */
export function allEvents(level: Level, bundled: PastEvent[], d: LiveData | null, today: string): PastEvent[] {
  const db = (d?.pastEvents ?? []).filter((e) => e.level === level);
  const have = new Set(db.map((e) => e.id));
  const record = [...bundled.filter((e) => e.level === level && !have.has(e.id)), ...db];
  if (!d) return record;
  const tournaments = d.tournaments.filter((t) => t.level === level);
  const tIds = new Set(tournaments.map((t) => t.id));
  const imported = new Set(record.map((e) => e.tournamentId).filter(Boolean));
  const known = new Set(record.flatMap((e) => [...e.results.map((r) => r.school), ...e.participants.map(schoolOfTeam)]));
  const closed = closedCompetitionEvents(
    {
      tournaments,
      matches: d.matches.filter((m) => tIds.has(m.tournamentId)),
      ballots: d.ballots,
      teams: d.teams.filter((t) => t.level === level),
      programs: d.programs.filter((p) => p.level === level),
    },
    today,
    known,
  ).filter((e) => !imported.has(e.tournamentId));
  return [...closed.reverse(), ...record];
}

export function leaderboard(level: Level, events: PastEvent[], limit: number, live: boolean, now = new Date()): Leaderboard {
  const { ranked } = eloFor(events);
  const byId = new Map(events.map((e) => [e.id, e]));
  const counted = new Set(ranked.flatMap((r) => r.history.map((h) => h.eventId)));
  const latest = chronological(events).filter((e) => counted.has(e.id)).at(-1) ?? null;
  const place = new Map<TierId, number>();
  const next = (id: TierId | null) => {
    if (!id) return null;
    const n = (place.get(id) ?? 0) + 1;
    place.set(id, n);
    return n;
  };
  const rows: RatingRow[] = ranked.map((r, i) => {
    const h = r.history[r.history.length - 1];
    const division = divisionOf(r.school)?.id ?? null;
    const selectivity = selectivityOf(r.school)?.id ?? null;
    return {
      rank: i + 1,
      school: r.school,
      rating: Math.round(r.rating),
      peak: Math.round(r.peak),
      events: r.events,
      provisional: r.provisional,
      class: classOf(r.rating),
      lastChange: h ? Math.round(h.after - h.before) : 0,
      lastEvent: h ? byId.get(h.eventId)?.name ?? null : null,
      enrollment: enrollmentOf(r.school),
      division,
      divisionRank: next(division),
      lsat: lsatOf(r.school),
      gpa: gpaOf(r.school),
      selectivity,
      selectivityRank: next(selectivity),
    };
  });
  return {
    level,
    updatedAt: now.toISOString(),
    competitions: counted.size,
    latest: latest ? { name: latest.name, season: latest.season, term: latest.term } : null,
    live,
    ratings: rows.slice(0, limit),
    divisions: DIVISIONS.map((d) => {
      const mine = rows.filter((r) => r.division === d.id);
      return { id: d.id, label: d.label, short: d.short, min: d.min, max: d.max, schools: mine.length, ratings: mine.slice(0, limit) };
    }),
    selectivity: SELECTIVITY.map((d) => {
      const mine = rows.filter((r) => r.selectivity === d.id);
      return { id: d.id, label: d.label, short: d.short, min: d.min, max: d.max, schools: mine.length, ratings: mine.slice(0, limit) };
    }),
    enrollmentSource: ENROLLMENT_SOURCE,
  };
}
