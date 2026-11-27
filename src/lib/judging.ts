import type { AppData, Ballot, JudgeSignup, Match, Profile, Tournament } from './types';

/** Lines on the per-performance score sheet, the same for both sides. Each line is scored 1 to 10. */
export function sheetLines(witnessesPerSide: number): string[] {
  const lines = ['Opening statement'];
  for (let i = 1; i <= witnessesPerSide; i++) lines.push(`Direct exam, witness ${i}`, `Witness ${i} performance`);
  for (let i = 1; i <= witnessesPerSide; i++) lines.push(`Cross exam, opposing witness ${i}`);
  lines.push('Closing argument');
  return lines;
}

export const SHEET_MIN = 1;
export const SHEET_MAX = 10;

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
