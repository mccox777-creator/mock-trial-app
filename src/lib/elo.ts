// Chess-style Elo ratings for schools, from competition finishes.
//
// Same rules as chess: everyone starts at 1500, the expected score against an opponent is
// 1 / (1 + 10^((their rating - yours) / 400)), and after each event a rating moves by K x (actual - expected).
// A competition counts like a short chess tournament: finishing above a school is a win against it,
// finishing below is a loss, and schools that finish in the same round (two semifinalists, or two teams
// that didn't advance) don't count against each other. Each competition is worth up to 8 games, however
// big the field, so a 24-team event can't swing a rating three times as much as an 8-team one.
import type { PastEvent } from './types';
/** "UCLA 2" -> "UCLA" (kept here so this file runs without the app bundler). */
const schoolOfTeam = (team: string) => team.replace(/\s+(\d|I{1,3}|[AB])$/, '');

export const START = 1500;
export const GAMES_PER_EVENT = 8;
/** Like FIDE: new schools move fast, established ones slower, the very top slowest. */
export function kFactor(rating: number, eventsPlayed: number) {
  if (eventsPlayed < 5) return 40;
  return rating >= 2400 ? 10 : 20;
}
/** Under this many competitions a rating is provisional, as in chess. */
export const PROVISIONAL_UNDER = 5;

/** US Chess class names. */
export const CLASSES: { min: number; name: string }[] = [
  { min: 2400, name: 'Senior Master' },
  { min: 2200, name: 'Master' },
  { min: 2000, name: 'Expert' },
  { min: 1800, name: 'Class A' },
  { min: 1600, name: 'Class B' },
  { min: 1400, name: 'Class C' },
  { min: 1200, name: 'Class D' },
  { min: -Infinity, name: 'Class E' },
];
export const classOf = (r: number) => CLASSES.find((c) => r >= c.min)!.name;

/** Lower is better: 0 won (or qualified out of a regional), 1 final, 2 semifinal, 3 quarterfinal, 4 octofinal, 5 took part. */
export function finishTier(r: PastEvent['results'][number]) {
  if (r.finish === 'place') return r.place === 1 ? 0 : r.place === 2 ? 1 : r.place === 3 ? 2 : 3;
  return { winner: 0, advanced: 0, finalist: 1, semifinalist: 2, quarterfinalist: 3, octofinalist: 4 }[r.finish];
}

/** Each school's best finish at an event, with everyone who took part. */
export function fieldOf(e: PastEvent) {
  const best = new Map<string, number>();
  for (const r of e.results) best.set(r.school, Math.min(best.get(r.school) ?? 9, finishTier(r)));
  for (const p of e.participants) {
    const s = schoolOfTeam(p);
    if (!best.has(s)) best.set(s, 5);
  }
  return best;
}

/** Oldest first: season, Fall before Spring, then in the order the record lists them (it lists newest first). */
export function chronological(events: PastEvent[]) {
  return [...events].sort((a, b) => a.season.localeCompare(b.season) || (a.term === b.term ? b.ord - a.ord : a.term === 'Fall' ? -1 : 1));
}

export interface EloChange {
  eventId: string;
  before: number;
  after: number;
  /** Finished ahead of / behind, counting only schools in a different round. */
  ahead: number;
  behind: number;
}
export interface EloRow {
  school: string;
  rating: number;
  peak: number;
  events: number;
  provisional: boolean;
  history: EloChange[];
}

export function computeElo(events: PastEvent[]): Map<string, EloRow> {
  const rows = new Map<string, EloRow>();
  const row = (s: string) => {
    let r = rows.get(s);
    if (!r) rows.set(s, (r = { school: s, rating: START, peak: START, events: 0, provisional: true, history: [] }));
    return r;
  };
  for (const e of chronological(events)) {
    const field = [...fieldOf(e)];
    if (field.length < 2) continue;
    const pre = new Map(field.map(([s]) => [s, row(s).rating]));
    const games = Math.min(GAMES_PER_EVENT, field.length - 1) / (field.length - 1);
    for (const [s, tier] of field) {
      const me = row(s);
      let score = 0;
      let ahead = 0;
      let behind = 0;
      for (const [o, ot] of field) {
        if (o === s || ot === tier) continue;
        const expected = 1 / (1 + 10 ** ((pre.get(o)! - pre.get(s)!) / 400));
        const won = tier < ot ? 1 : 0;
        if (won) ahead++;
        else behind++;
        score += won - expected;
      }
      const before = pre.get(s)!;
      const after = before + kFactor(before, me.events) * games * score;
      me.rating = after;
      me.peak = Math.max(me.peak, after);
      me.events += 1;
      me.history.push({ eventId: e.id, before, after, ahead, behind });
    }
  }
  for (const r of rows.values()) r.provisional = r.events < PROVISIONAL_UNDER;
  return rows;
}

/** Chance that school A finishes ahead of school B, from their ratings. */
export const expectedScore = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

const cache = new WeakMap<PastEvent[], { rows: Map<string, EloRow>; ranked: EloRow[]; byEvent: Map<string, Map<string, EloChange>> }>();
/** Ratings for a list of events, computed once per list. */
export function eloFor(events: PastEvent[]) {
  let c = cache.get(events);
  if (!c) {
    const rows = computeElo(events);
    const ranked = [...rows.values()].sort((a, b) => b.rating - a.rating);
    const byEvent = new Map<string, Map<string, EloChange>>();
    for (const r of rows.values())
      for (const h of r.history) {
        if (!byEvent.has(h.eventId)) byEvent.set(h.eventId, new Map());
        byEvent.get(h.eventId)!.set(r.school, h);
      }
    c = { rows, ranked, byEvent };
    cache.set(events, c);
  }
  return c;
}

export const fmtChange = (h: EloChange) => {
  const d = Math.round(h.after - h.before);
  return d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '±0';
};
