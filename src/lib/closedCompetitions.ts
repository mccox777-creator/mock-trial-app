// Competitions run in the app join the circuit record, and so the Elo ratings, the moment they close:
// when the organizer finalizes them, or on their own 7 days after the last day. Only published results
// count, so a rating never gives away results that teams can't see yet.
import type { Ballot, Match, PastEvent, Program, Team, Tournament } from './types';
import { computeStandings } from './scoring';
import { isLocked, seasonOf } from './judging';

const SUFFIXES = /\b(school of law|college of law|law school|law center|university school of law|school of law at)\b/g;
const norm = (s: string) =>
  s.toLowerCase().replace(/&/g, 'and').replace(SUFFIXES, ' ').replace(/\b(the|university|of|at)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The name the circuit record uses for a school, so "UCLA School of Law" in the app and "UCLA" in the
 * record are one Elo rating. Falls back to the app's name for a school the record has never seen.
 */
export function recordName(programName: string, known: Iterable<string>) {
  const byNorm = new Map<string, string>();
  for (const k of known) byNorm.set(norm(k), k);
  return byNorm.get(norm(programName)) ?? programName;
}

interface Data {
  tournaments: Tournament[];
  matches: Match[];
  ballots: Ballot[];
  teams: Team[];
  programs: Program[];
}

/** One circuit-record entry for each closed, published competition at this level, with its final standings. */
export function closedCompetitionEvents(d: Data, today: string, known: Iterable<string>): PastEvent[] {
  const knownList = [...known];
  const teams = new Map(d.teams.map((t) => [t.id, t]));
  const programs = new Map(d.programs.map((p) => [p.id, p]));
  const schoolOf = (teamId: string) => {
    const p = programs.get(teams.get(teamId)?.programId ?? '');
    return p ? recordName(p.name, knownList) : teams.get(teamId)?.name ?? teamId;
  };
  return d.tournaments
    .filter((t) => t.resultsPublished && isLocked(t, today))
    .map((t): PastEvent => {
      const standings = computeStandings(d.matches.filter((m) => m.tournamentId === t.id), d.ballots, t.rankBy ?? 'ballots');
      const month = Number(t.startDate.slice(5, 7));
      const schools = new Set(standings.map((s) => schoolOf(s.teamId)));
      return {
        id: `app-${t.id}`,
        tournamentId: t.id,
        level: t.level,
        season: seasonOf(t.startDate).replace('–', '-'),
        term: month >= 8 ? 'Fall' : 'Spring',
        name: t.name,
        host: t.hostName || null,
        region: null,
        dates: t.startDate === t.endDate ? t.startDate : `${t.startDate} to ${t.endDate}`,
        teamCount: standings.length,
        schoolCount: schools.size,
        results: standings.map((s) => ({ school: schoolOf(s.teamId), team: teams.get(s.teamId)?.name ?? s.teamId, finish: 'place', place: s.rank })),
        participants: [],
        needsReview: false,
        // After every imported event in its term, oldest first by last day.
        ord: -Number(t.endDate.replace(/-/g, '')),
      };
    })
    .filter((e) => e.results.length >= 2);
}
