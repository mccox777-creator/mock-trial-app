import { useMemo } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Card, Empty, H1, H2, Label, Loading, Mono, Pill, Row, Screen } from '../../components/ui';
import { useStore } from '../../lib/store';
import { awardTitle, peopleStats, sideText, winPct } from '../../lib/stats';
import { trialRoleLabel } from '../../lib/types';
import { teamName } from '../../lib/scoring';
import { fmtRange } from '../../lib/format';
import { space } from '../../lib/theme';

/** One student's or coach's record across every published competition. */
export default function PersonScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { data } = useStore();
  const p = useMemo(() => (data && key ? peopleStats(data).get(key) : undefined), [data, key]);
  if (!data) return <Loading />;
  if (!p) return <Screen><Empty title="No stats yet" body="This person shows up once a competition they were on the roster for publishes results." /></Screen>;
  const school = data.programs.find((x) => x.id === p.programId)?.name ?? '';
  const pct = winPct(p.wins, p.losses);
  const coach = p.role === 'coach';

  return (
    <Screen>
      <Stack.Screen options={{ title: p.name }} />
      <View style={{ gap: 6 }}>
        <H1>{p.name}</H1>
        <Body muted>{`${coach ? 'Coach' : 'Student'} · ${school}`}</Body>
        <Row>
          {!coach && p.classYear && <Pill text={p.classYear === 'other' ? 'Other' : p.classYear} />}
          <Pill text={`${p.events.length} competition${p.events.length === 1 ? '' : 's'}`} />
          <Pill text={`${p.wins}-${p.losses}${pct !== null ? ` · ${pct}%` : ''}`} tone="accent" />
          <Pill text={`${p.awards.length} award${p.awards.length === 1 ? '' : 's'}${coach ? ' by students' : ''}`} tone={p.awards.length ? 'good' : 'neutral'} />
          {p.titles > 0 && <Pill text={`${p.titles} first place${p.titles === 1 ? '' : 's'}`} tone="good" />}
          {p.top3 > 0 && <Pill text={`${p.top3} top 3`} />}
        </Row>
        <Body muted>{`By side: ${sideText(p.side)}${!coach && p.roles.length ? ` (sides they play)` : ''}`}</Body>
        {!coach && p.roles.length > 0 && <Body muted>{`Plays: ${p.roles.map((r) => trialRoleLabel(r)).join(', ')}`}</Body>}
      </View>

      {p.awards.length > 0 && (
        <Card>
          <Label>{coach ? 'Awards won by their students' : 'Awards'}</Label>
          {p.events.flatMap((e) => e.awards.map((a) => (
            <Body key={a.id}>{`${awardTitle(a)}${coach ? ` · ${a.recipient}` : ''} · ${e.t.name}`}</Body>
          )))}
        </Card>
      )}

      <Label>Competitions</Label>
      {p.events.map((e) => (
        <Card key={e.t.id} onPress={() => router.push(`/tournament/${e.t.id}`)}>
          <H2>{e.t.name}</H2>
          <Body muted>{`${fmtRange(e.t.startDate, e.t.endDate)} · ${teamName(data.teams, e.teamId)}${!coach && e.classYear ? ` · ${e.classYear === 'other' ? 'Other' : e.classYear}` : ''}`}</Body>
          <Row style={{ gap: space.sm }}>
            {e.rank && <Pill text={`Place ${e.rank} of ${e.of}`} tone={e.rank <= 3 ? 'good' : 'neutral'} />}
            <Mono muted>{`${e.wins}-${e.losses} · ${sideText(e.side)}`}</Mono>
            {e.awards.length > 0 && <Pill text={`${e.awards.length} award${e.awards.length === 1 ? '' : 's'}`} tone="accent" />}
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
