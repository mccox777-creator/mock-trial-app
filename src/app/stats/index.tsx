import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, Empty, H2, Label, LevelSwitcher, Loading, Mono, Screen } from '../../components/ui';
import { Chips } from '../../components/Chips';
import { useLevelData } from '../../lib/store';
import {
  awardKindLabel, awardSeasons, headToHead, peopleStats, rankCoaches, rankPeople, schoolAwards, schoolRecords, sideText, winPct, type PersonStats,
} from '../../lib/stats';
import { seasonOf } from '../../lib/judging';
import { teamName } from '../../lib/scoring';
import { AWARD_KINDS, type AwardKind } from '../../lib/types';
import { space, useTheme } from '../../lib/theme';

type Tab = 'awards' | 'records' | 'students' | 'coaches' | 'h2h';
const TABS: { id: Tab; label: string }[] = [
  { id: 'awards', label: 'Awards by school' },
  { id: 'records', label: 'School records' },
  { id: 'students', label: 'Students' },
  { id: 'coaches', label: 'Coaches' },
  { id: 'h2h', label: 'Head-to-head' },
];
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Individual awards by school, school records, and stats for every student and coach on a published roster. */
export default function StatsScreen() {
  const d = useLevelData();
  const c = useTheme();
  const [tab, setTab] = useState<Tab>('awards');
  const [kind, setKind] = useState<AwardKind | 'all'>('all');
  const [span, setSpan] = useState<string>('all');
  const [a, setA] = useState<string | null>(null);
  const [b, setB] = useState<string | null>(null);
  const people = useMemo(() => (d ? [...peopleStats(d).values()] : []), [d]);
  const seasons = useMemo(() => (d ? awardSeasons(d, seasonOf) : []), [d]);
  const schools = useMemo(() => (d ? schoolAwards(d, kind, span === 'all' ? undefined : (t) => seasonOf(t.startDate) === span) : []), [d, kind, span]);
  const records = useMemo(() => (d ? schoolRecords(d) : []), [d]);
  const h2h = useMemo(() => (d && a && b && a !== b ? headToHead(d, a, b) : null), [d, a, b]);
  if (!d) return <Loading />;
  const programName = (id: string) => d.programs.find((p) => p.id === id)?.name ?? '';
  const open = (p: PersonStats) => router.push(`/stats/person?key=${encodeURIComponent(p.key)}`);

  const line = (key: string, rank: number, title: string, sub: string, right: string, onPress?: () => void) => (
    <Pressable key={key} disabled={!onPress} onPress={onPress} accessibilityRole={onPress ? 'button' : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 10, borderTopWidth: rank === 1 ? 0 : 1, borderTopColor: c.line }}>
      <Text style={{ width: 26, fontWeight: '800', color: rank <= 3 ? c.accent : c.muted, fontVariant: ['tabular-nums'] }}>{rank}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>{title}</Text>
        <Body muted numberOfLines={2}>{sub}</Body>
      </View>
      <Mono>{right}</Mono>
    </Pressable>
  );
  const schoolChips = records.map((r) => ({ id: r.programId, label: r.name }));

  return (
    <Screen>
      <LevelSwitcher />
      <Chips value={tab} onChange={setTab} options={TABS} />

      {tab === 'awards' && (
        <>
          <Label>Season</Label>
          <Chips value={span} onChange={setSpan} options={[{ id: 'all', label: 'All time' }, ...seasons.map((s) => ({ id: s, label: s }))]} />
          <Label>Award</Label>
          <Chips value={kind} onChange={setKind} options={[{ id: 'all' as const, label: 'All awards' }, ...AWARD_KINDS]} />
          {schools.length === 0 ? (
            <Empty title="No awards yet" body="Individual awards appear here once organizers enter them and publish results." />
          ) : (
            <Card>
              {schools.map((s, i) =>
                line(s.programId, i + 1, s.name,
                  kind === 'all'
                    ? Object.entries(s.byKind).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${n} ${awardKindLabel(k as AwardKind)}`).join(' · ')
                    : `${plural(s.top, 'top award')} · ${plural(s.competitions, 'competition')}`,
                  String(s.total),
                  () => router.push(`/history/school?name=${encodeURIComponent(s.name)}`)))}
            </Card>
          )}
        </>
      )}

      {tab === 'records' && (records.length === 0 ? (
        <Empty title="No trials yet" body="School records fill in as organizers publish results." />
      ) : (
        <Card>
          {records.map((r, i) =>
            line(r.programId, i + 1, r.name,
              `${sideText(r.side)} · ${plural(r.titles, 'first place')} · ${r.top3} top 3 · ${plural(r.competitions, 'competition')}`,
              `${r.wins}-${r.losses}${winPct(r.wins, r.losses) !== null ? ` · ${winPct(r.wins, r.losses)}%` : ''}`))}
        </Card>
      ))}

      {tab === 'students' && (() => {
        const list = rankPeople(people.filter((p) => p.role === 'student')).slice(0, 100);
        return list.length === 0 ? (
          <Empty title="No students yet" body="Students appear here once their team's roster is in and the organizer publishes results." />
        ) : (
          <Card>
            {list.map((p, i) =>
              line(p.key, i + 1, p.name,
                [programName(p.programId), p.classYear && p.classYear !== 'other' ? p.classYear : null, plural(p.events.length, 'comp'), `${p.wins}-${p.losses}`, p.titles ? plural(p.titles, 'title') : null].filter(Boolean).join(' · '),
                plural(p.awards.length, 'award'), () => open(p)))}
          </Card>
        );
      })()}

      {tab === 'coaches' && (() => {
        const list = rankCoaches(people.filter((p) => p.role === 'coach')).slice(0, 100);
        return list.length === 0 ? (
          <Empty title="No coaches yet" body="Coaches appear here once their team's roster is in and the organizer publishes results." />
        ) : (
          <Card>
            {list.map((p, i) =>
              line(p.key, i + 1, p.name,
                [programName(p.programId), plural(p.events.length, 'comp'), sideText(p.side), p.titles ? plural(p.titles, 'title') : null, `${plural(p.awards.length, 'award')} by students`].filter(Boolean).join(' · '),
                `${p.wins}-${p.losses}${winPct(p.wins, p.losses) !== null ? ` · ${winPct(p.wins, p.losses)}%` : ''}`, () => open(p)))}
          </Card>
        );
      })()}

      {tab === 'h2h' && (
        <>
          <Label>First school</Label>
          <Chips value={a} onChange={setA} options={schoolChips} />
          <Label>Second school</Label>
          <Chips value={b} onChange={setB} options={schoolChips.filter((x) => x.id !== a)} />
          {h2h && (h2h.trials.length === 0 ? (
            <Empty title="They haven't met" body="No published trial between these two schools yet." />
          ) : (
            <Card>
              <H2>{`${programName(a!)} ${h2h.aWins} · ${programName(b!)} ${h2h.bWins}${h2h.ties ? ` · ${plural(h2h.ties, 'tie')}` : ''}`}</H2>
              {h2h.trials.map((x) => (
                <Pressable key={x.m.id} onPress={() => router.push(`/match/${x.m.id}`)} accessibilityRole="button">
                  <Body>
                    {`${x.t.name}, Round ${x.m.round}: ${teamName(d.teams, x.m.pTeamId)} (P) v ${teamName(d.teams, x.m.dTeamId)} (D) · `}
                    <Text style={{ fontWeight: '700', color: c.ink }}>{x.winner === 'tie' ? 'Tie' : `${teamName(d.teams, x.winner === 'p' ? x.m.pTeamId : x.m.dTeamId)} won`}</Text>
                  </Body>
                </Pressable>
              ))}
            </Card>
          ))}
        </>
      )}

      <Body muted>
        Counts only competitions run in the app with published results; the imported circuit history is on each school's record page. A person is matched across competitions by school and name, so spell names the same way each time.
      </Body>
    </Screen>
  );
}
