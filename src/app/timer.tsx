import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Body, Loading, Mono, Screen } from '../components/ui';
import { TrialTimer } from '../components/TrialTimer';
import { useStore } from '../lib/store';
import { teamName } from '../lib/scoring';
import { DEFAULT_MINUTES, freshTimer, type LimitGroup } from '../lib/timer';
import type { RuleSet } from '../lib/rules';

/** Minutes per side and any category limits the organizer ticked in the rules checklist. */
function limitsFrom(rules: RuleSet | undefined) {
  const r = rules ?? {};
  const num = (id: string, d: number) => (typeof r[id] === 'number' && (r[id] as number) > 0 ? (r[id] as number) : d);
  const limits: Partial<Record<LimitGroup, number>> = {};
  if (r.timeOpening === true) limits.opening = num('openingMinutes', 5);
  if (r.timeDirect === true) limits.direct = num('directMinutes', 25);
  if (r.timeCross === true) limits.cross = num('crossMinutes', 20);
  if (r.timeClosing === true) limits.closing = num('closingMinutes', 9);
  const sum = Object.values(limits).reduce((a, b) => a + (b ?? 0), 0);
  const allotMin = r.timeTotal === true ? num('totalMinutes', DEFAULT_MINUTES) : sum > 0 ? sum : DEFAULT_MINUTES;
  return { allotMin, limits };
}

export default function TimerScreen() {
  const { match } = useLocalSearchParams<{ match?: string }>();
  const { data } = useStore();
  const ctx = useMemo(() => {
    if (!match || !data) return null;
    const m = data.matches.find((x) => x.id === match);
    const t = m && data.tournaments.find((x) => x.id === m.tournamentId);
    if (!m || !t) return null;
    const cs = data.cases.find((x) => x.id === t.caseId);
    const n = Math.max(1, Math.min(12, t.witnessesPerSide || 3));
    const side = cs?.kind === 'criminal' ? 'Prosecution' : 'Plaintiff';
    return {
      title: `${t.name} · Round ${m.round} · ${m.courtroom}`,
      base: freshTimer({
        ...limitsFrom(t.rules),
        labels: { p: `${side}: ${teamName(data.teams, m.pTeamId)}`, d: `Defense: ${teamName(data.teams, m.dTeamId)}` },
        witnesses: { p: Array.from({ length: n }, (_, i) => `${side} witness ${i + 1}`), d: Array.from({ length: n }, (_, i) => `Defense witness ${i + 1}`) },
      }),
    };
  }, [match, data]);

  if (match && !data) return <Loading />;
  const base = ctx?.base ?? freshTimer();
  return (
    <Screen>
      {ctx ? <Mono muted>{ctx.title}</Mono> : <Body muted>A timer for any trial or practice round. For a scheduled trial, open it from the trial's page so the teams and time limits fill in.</Body>}
      <TrialTimer storageKey={`mocktrial.timer.${match ?? 'practice'}`} base={base} title={ctx?.title} />
    </Screen>
  );
}
