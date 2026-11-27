import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Card, Empty, H1, H2, Label, Loading, Mono, Pill, Row, Screen } from '../../components/ui';
import { useStore } from '../../lib/store';
import { computeStandings } from '../../lib/scoring';
import { ballotsText, fmtRange, signed } from '../../lib/format';
import { seasonOf } from '../../lib/judging';
import { space } from '../../lib/theme';

/** A team's competition history across every published event. */
export default function TeamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useStore();
  if (!data) return <Loading />;
  const team = data.teams.find((t) => t.id === id);
  if (!team) return <Screen><Empty title="Team not found" body="It may have been renamed by its school." /></Screen>;
  const program = data.programs.find((p) => p.id === team.programId);

  const events = data.tournaments
    .filter((t) => t.resultsPublished && data.matches.some((m) => m.tournamentId === t.id && (m.pTeamId === id || m.dTeamId === id)))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map((t) => {
      const table = computeStandings(data.matches.filter((m) => m.tournamentId === t.id), data.ballots, t.rankBy ?? 'ballots');
      return { t, row: table.find((s) => s.teamId === id), of: table.length };
    });
  const totals = events.reduce((a, e) => ({ w: a.w + (e.row?.wins ?? 0), l: a.l + (e.row?.losses ?? 0) }), { w: 0, l: 0 });
  const seasons = [...new Set(events.map((e) => seasonOf(e.t.startDate)))];

  return (
    <Screen>
      <Stack.Screen options={{ title: team.name }} />
      <H1>{team.name}</H1>
      <Body muted>{program?.name}</Body>
      <Row>
        <Pill text={`${events.length} event${events.length === 1 ? '' : 's'}`} />
        <Pill text={`${totals.w}-${totals.l} all time`} tone="accent" />
      </Row>
      {events.length === 0 && <Empty title="No published results yet" body="Events show up here once their organizers publish results." />}
      {seasons.map((season) => (
        <View key={season} style={{ gap: space.sm }}>
          <Label>{season} season</Label>
          {events
            .filter((e) => seasonOf(e.t.startDate) === season)
            .map(({ t, row, of }) => (
              <Card key={t.id} onPress={() => router.push(`/tournament/${t.id}`)}>
                <H2>{t.name}</H2>
                <Body muted>{fmtRange(t.startDate, t.endDate)}</Body>
                {row && (
                  <Row>
                    <Pill text={`Place ${row.rank} of ${of}`} tone={row.rank <= 3 ? 'good' : 'neutral'} />
                    <Mono muted>
                      {row.wins}-{row.losses} · {ballotsText(row.ballots)} ballots · PD {signed(row.pointDiff)}
                    </Mono>
                  </Row>
                )}
              </Card>
            ))}
        </View>
      ))}
    </Screen>
  );
}
