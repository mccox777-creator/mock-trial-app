import type { AppData, Ballot, CommentMode, JudgeSignup, Match, Profile, ScoringSetup, SheetPart, Tournament } from './types';

/** What judges can be asked to score. The organizer ticks these in the wizard. */
export const SHEET_PARTS: { id: SheetPart; label: string; help: string }[] = [
  { id: 'pretrial', label: 'Pretrial motion', help: 'One line for the attorney who argues it.' },
  { id: 'opening', label: 'Opening statements', help: 'One line per side.' },
  { id: 'direct', label: 'Direct examinations', help: 'One line per witness called.' },
  { id: 'witness', label: 'Witness performances', help: 'One line per witness: believability and staying in role.' },
  { id: 'cross', label: 'Cross examinations', help: 'One line per opposing witness.' },
  { id: 'evidence', label: 'Objections and evidence', help: 'One line per side: objections, responses, and getting exhibits in.' },
  { id: 'closing', label: 'Closing arguments', help: 'One line per side, including any rebuttal.' },
  { id: 'professionalism', label: 'Professionalism and decorum', help: 'One line per side for courtroom conduct.' },
];

export const SCALES = [10, 15] as const;
export const SHEET_MIN = 1;
export const DEFAULT_SCORING: ScoringSetup = { max: 10, parts: ['opening', 'direct', 'witness', 'cross', 'closing'], extra: [], comments: 'overall' };

export const COMMENT_MODES: { id: CommentMode; label: string; help: string }[] = [
  { id: 'none', label: 'No comments', help: 'Scores only.' },
  { id: 'overall', label: 'One comment box', help: 'One box at the end of the ballot.' },
  { id: 'per_line', label: 'After each performance', help: 'A comment for each side on every line.' },
  { id: 'both', label: 'Both', help: 'Comments on each performance and one at the end.' },
];

/** Running totals and point differential, line by line. */
export function runningTotals(p: number[], d: number[]) {
  let pt = 0;
  let dt = 0;
  return p.map((pv, i) => {
    pt += Number.isFinite(pv) ? pv : 0;
    dt += Number.isFinite(d[i]) ? d[i] : 0;
    return { line: (Number.isFinite(pv) ? pv : 0) - (Number.isFinite(d[i]) ? d[i] : 0), p: pt, d: dt, diff: pt - dt };
  });
}

export const fmtDiff = (n: number) => (n > 0 ? `+${n}` : String(n));

export const scoringOf = (t: { scoring?: ScoringSetup | null }): ScoringSetup => ({ ...DEFAULT_SCORING, ...(t.scoring ?? {}) });

/** Lines on the score sheet, the same for both sides, in courtroom order. */
export function sheetLines(witnessesPerSide: number, scoring: ScoringSetup = DEFAULT_SCORING): string[] {
  const on = new Set(scoring.parts);
  const lines: string[] = [];
  if (on.has('pretrial')) lines.push('Pretrial motion');
  if (on.has('opening')) lines.push('Opening statement');
  for (let i = 1; i <= witnessesPerSide; i++) {
    if (on.has('direct')) lines.push(`Direct exam, witness ${i}`);
    if (on.has('witness')) lines.push(`Witness ${i} performance`);
  }
  if (on.has('cross')) for (let i = 1; i <= witnessesPerSide; i++) lines.push(`Cross exam, opposing witness ${i}`);
  if (on.has('evidence')) lines.push('Objections and evidence');
  if (on.has('closing')) lines.push('Closing argument');
  if (on.has('professionalism')) lines.push('Professionalism and decorum');
  return [...lines, ...scoring.extra];
}

/** One-line summary for the competition page, e.g. "1–15 per line · 14 lines per side". */
export function describeScoring(witnessesPerSide: number, scoring: ScoringSetup): string {
  const n = sheetLines(witnessesPerSide, scoring).length;
  return `Each line scored ${SHEET_MIN}–${scoring.max} · ${n} lines per side`;
}

export const isOrganizer = (t: Tournament | undefined, me: Profile | null) => !!t && !!me && t.directorIds.includes(me.id);

/** Can this viewer see the outcome (wins, ballots won, standings) of this competition? */
export const resultsVisible = (t: Tournament | undefined, me: Profile | null) => !!t && (t.resultsPublished || isOrganizer(t, me));

/**
 * Ballots this viewer may see. The organizer sees all of them; a judge sees their own;
 * a team sees its own trials' ballots only after the organizer publishes results and returns ballots.
 */
export function visibleBallots(data: AppData, me: Profile | null): Ballot[] {
  const tById = new Map(data.tournaments.map((t) => [t.id, t]));
  const mById = new Map(data.matches.map((m) => [m.id, m]));
  return data.ballots.filter((b) => {
    const m = mById.get(b.matchId);
    const t = m && tById.get(m.tournamentId);
    if (!m || !t) return false;
    if (isOrganizer(t, me)) return true;
    if (me && b.judgeId === me.id) return true;
    if (t.resultsPublished && t.ballotsReturned && me && (me.teamIds.includes(m.pTeamId) || me.teamIds.includes(m.dTeamId))) return true;
    return false;
  });
}

/** Ballots that count toward public results: those of published competitions (plus everything for its organizer). */
export function resultBallots(data: AppData, me: Profile | null): Ballot[] {
  const visible = new Set(data.tournaments.filter((t) => resultsVisible(t, me)).map((t) => t.id));
  const mById = new Map(data.matches.map((m) => [m.id, m]));
  return data.ballots.filter((b) => {
    const m = mById.get(b.matchId);
    return !!m && visible.has(m.tournamentId);
  });
}

/** True when the judge listed either team's school as a conflict. */
export function hasConflict(j: JudgeSignup, m: Match, data: AppData): boolean {
  const c = j.conflicts.toLowerCase();
  if (!c.trim()) return false;
  return [m.pTeamId, m.dTeamId].some((tid) => {
    const team = data.teams.find((t) => t.id === tid);
    const program = data.programs.find((p) => p.id === team?.programId);
    const names = [team?.name, program?.name, program?.name.split(' ')[0]].filter(Boolean) as string[];
    return names.some((n) => c.includes(n.toLowerCase()));
  });
}

/** Approved judges who are free, available, and conflict-free for this trial. */
export function eligibleJudges(m: Match, data: AppData): JudgeSignup[] {
  const busy = new Set(data.matches.filter((x) => x.tournamentId === m.tournamentId && x.round === m.round && x.id !== m.id).flatMap((x) => x.judgeIds));
  return data.judgeSignups.filter(
    (j) => j.tournamentId === m.tournamentId && j.status === 'approved' && j.rounds.includes(m.round) && !busy.has(j.userId) && !m.judgeIds.includes(j.userId) && !hasConflict(j, m, data),
  );
}

/**
 * Fill every trial in a round up to the competition's ballots-per-round, spreading judges evenly.
 * Returns updated matches; trials that cannot be filled keep the judges they could get.
 */
export function autoAssign(round: number, t: Tournament, data: AppData): Match[] {
  const matches = data.matches.filter((m) => m.tournamentId === t.id && m.round === round).map((m) => ({ ...m, judgeIds: [...m.judgeIds] }));
  const load = new Map<string, number>();
  for (const m of data.matches.filter((x) => x.tournamentId === t.id)) for (const j of m.judgeIds) load.set(j, (load.get(j) ?? 0) + 1);
  let progress = true;
  while (progress) {
    progress = false;
    for (const m of matches) {
      if (m.judgeIds.length >= t.ballotsPerRound) continue;
      const working = { ...data, matches: data.matches.map((x) => matches.find((y) => y.id === x.id) ?? x) };
      const pick = eligibleJudges(m, working).sort((a, b) => (load.get(a.userId) ?? 0) - (load.get(b.userId) ?? 0))[0];
      if (!pick) continue;
      m.judgeIds.push(pick.userId);
      load.set(pick.userId, (load.get(pick.userId) ?? 0) + 1);
      progress = true;
    }
  }
  return matches;
}

export function judgeName(data: AppData, tournamentId: string, userId: string) {
  return data.judgeSignups.find((j) => j.tournamentId === tournamentId && j.userId === userId)?.name ?? 'Judge';
}

export const BACKGROUND_LABEL: Record<JudgeSignup['background'], string> = {
  judge: 'Sitting or retired judge',
  attorney: 'Practicing attorney',
  coach: 'Coach',
  alumni: 'Former competitor',
  other: 'Other',
};

/** Days after a competition's last day when it locks on its own if the organizer never finalizes. */
export const AUTO_LOCK_DAYS = 7;

export function autoLockDate(t: Tournament) {
  const d = new Date(`${t.endDate}T00:00:00`);
  d.setDate(d.getDate() + AUTO_LOCK_DAYS);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** A locked competition is permanent: no one, including its organizer, can change it. */
export function isLocked(t: Tournament, today: string) {
  return !!t.finalizedAt || autoLockDate(t) <= today;
}

/** Season label, e.g. "2026–27". Seasons run August through July. */
export function seasonOf(date: string) {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 8 ? y : y - 1;
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The organizer may change this competition only until it locks. */
export function canChange(t: Tournament | undefined, me: Profile | null, today: string) {
  return !!t && isOrganizer(t, me) && !isLocked(t, today);
}
