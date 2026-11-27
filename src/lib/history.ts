import type { PastEvent, PastFinish } from './types';

/** Circuit points, as in the Trial Competition Performance Rankings: win 3, final 2, semifinal 1. */
export const FINISH_POINTS: Record<PastFinish, number> = {
  winner: 3, advanced: 3, finalist: 2, semifinalist: 1, quarterfinalist: 0, octofinalist: 0, place: 0,
};
export const FINISH_LABEL: Record<PastFinish, string> = {
  winner: 'Winner', advanced: 'Advanced', finalist: 'Finalist', semifinalist: 'Semifinalist', quarterfinalist: 'Quarterfinalist', octofinalist: 'Octofinalist', place: 'Placed',
};

/** Points for one result. Third place in a placement format counts like a semifinal. */
export function pointsFor(r: PastEvent['results'][number]) {
  if (r.finish === 'place') return r.place === 1 ? 3 : r.place === 2 ? 2 : r.place === 3 ? 1 : 0;
  return FINISH_POINTS[r.finish];
}

export function finishText(r: PastEvent['results'][number]) {
  if (r.place && (r.place > 2 || r.finish === 'place')) return `${ordinal(r.place)} place`;
  return FINISH_LABEL[r.finish];
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Strip a team number: "UCLA 2" -> "UCLA". */
export const schoolOfTeam = (team: string) => team.replace(/\s+(\d|I{1,3}|[AB])$/, '');

export interface SchoolSeason {
  school: string;
  points: number;
  entered: number;
  placed: number;
  wins: number;
}

/**
 * Points table for one season (or all seasons). A school earns its best finish's points once per competition,
 * so two teams from one school in the same final don't double count.
 */
export function circuitPoints(events: PastEvent[], season?: string): SchoolSeason[] {
  const rows = new Map<string, SchoolSeason>();
  const row = (school: string) => {
    let r = rows.get(school);
    if (!r) rows.set(school, (r = { school, points: 0, entered: 0, placed: 0, wins: 0 }));
    return r;
  };
  for (const e of events) {
    if (season && e.season !== season) continue;
    const best = new Map<string, number>();
    const won = new Set<string>();
    for (const r of e.results) {
      best.set(r.school, Math.max(best.get(r.school) ?? 0, pointsFor(r)));
      if (r.finish === 'winner' || r.finish === 'advanced') won.add(r.school);
    }
    const entered = new Set([...e.participants.map(schoolOfTeam), ...e.results.map((r) => r.school)]);
    for (const s of entered) {
      const r = row(s);
      r.entered += 1;
      const p = best.get(s) ?? 0;
      r.points += p;
      if (p > 0) r.placed += 1;
      if (won.has(s)) r.wins += 1;
    }
  }
  return [...rows.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.placed - a.placed || a.school.localeCompare(b.school));
}

export function seasonsOf(events: PastEvent[]) {
  return [...new Set(events.map((e) => e.season))].sort().reverse();
}

/** Every competition a school entered, newest first, with its best finish. */
export function schoolHistory(events: PastEvent[], school: string) {
  return events
    .filter((e) => e.results.some((r) => r.school === school) || e.participants.some((p) => schoolOfTeam(p) === school))
    .map((e) => {
      const mine = e.results.filter((r) => r.school === school);
      const best = [...mine].sort((a, b) => pointsFor(b) - pointsFor(a) || (a.place ?? 9) - (b.place ?? 9))[0];
      return { event: e, results: mine, best, points: best ? pointsFor(best) : 0 };
    });
}

/** Newest first, as in the source record. */
export function sortEvents(events: PastEvent[]) {
  return [...events].sort((a, b) => b.season.localeCompare(a.season) || a.ord - b.ord);
}
