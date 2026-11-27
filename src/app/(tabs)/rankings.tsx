import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Card, DateBlock, Empty, H2, Label, LevelSwitcher, Loading, Pill, Row, Screen, Segmented } from '../../components/ui';
import { StandingsTable } from '../../components/StandingsTable';
import { CircuitHistory } from '../../components/CircuitHistory';
import { EloTable } from '../../components/EloTable';
import { eloFor } from '../../lib/elo';
import { useHistory, useLevelData, useStore } from '../../lib/store';
import { computeStandings, teamName } from '../../lib/scoring';
import { fmtRange, todayLocal } from '../../lib/format';
import { isLocked, seasonOf } from '../../lib/judging';
import { radius, space, useTheme } from '../../lib/theme';

export default function ResultsScreen() {
  const d = useLevelData();
  const { data } = useStore();
  const { events: history } = useHistory();
  const elo = useMemo(() => (history && history.length ? eloFor(history) : null), [history]);
  const c = useTheme();
  const [view, setView] = useState<'rankings' | 'archive' | 'history'>('rankings');
  const [scope, setScope] = useState<string>('season');

  // Only published competitions count toward public rankings and the archive.
  const published = useMemo(() => (d ? d.tournaments.filter((t) => t.resultsPublished).sort((a, b) => b.startDate.localeCompare(a.startDate)) : []), [d]);
  const currentSeason = seasonOf(todayLocal());

  const standings = useMemo(() => {
    if (!d) return [];
    const ids = new Set(scope === 'season' ? published.filter((t) => seasonOf(t.startDate) === currentSeason).map((t) => t.id) : [scope]);
    return computeStandings(d.matches.filter((m) => ids.has(m.tournamentId)), d.ballots);
  }, [d, scope, published, currentSeason]);

  if (!d || !data) return <Loading />;

  const chips = [{ id: 'season', label: `${currentSeason} season` }, ...published.filter((t) => seasonOf(t.startDate) === currentSeason).map((t) => ({ id: t.id, label: t.name }))];
  const seasons = [...new Set(published.map((t) => seasonOf(t.startDate)))];

  return (
    <Screen>
      <LevelSwitcher />
      <Segmented value={view} onChange={setView} options={[{ id: 'rankings', label: 'Rankings' }, { id: 'archive', label: 'In the app' }, { id: 'history', label: 'Circuit history' }]} />

      {view === 'history' ? (
        <CircuitHistory />
      ) : view === 'rankings' ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {chips.map((ch) => {
              const on = ch.id === scope;
              return (
                <Pressable key={ch.id} onPress={() => setScope(ch.id)} accessibilityRole="button" style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceAlt }}>
                  <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600' }}>{ch.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {standings.length === 0 && scope === 'season' && elo ? (
            <Body muted>No competition run in the app has published results this season yet. School ratings from the whole circuit record are below.</Body>
          ) : standings.length === 0 ? (
            <Empty title="No published results yet" body="Rankings fill in as organizers publish their competitions' results." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <StandingsTable standings={standings} teams={d.teams} onTeam={(id) => router.push(`/team/${id}`)} />
            </Card>
          )}
          {standings.length > 0 && (
          <View style={{ gap: 4 }}>
            <Label>How teams are ranked</Label>
            <Body muted>
              Wins first, then ballots won, then combined strength (CS, the total wins of every opponent faced), then point differential (PD). Only results an organizer has published count. Tap a team to see its history.
            </Body>
          </View>
          )}
          {scope === 'season' && elo && <EloTable ranked={elo.ranked} title="School ratings (Elo), whole circuit" />}
        </>
      ) : seasons.length === 0 ? (
        <Empty title="No past events yet" body="Competitions appear here, with final standings, as soon as their organizers publish results." />
      ) : (
        seasons.map((season) => (
          <View key={season} style={{ gap: space.sm }}>
            <Label>{season} season</Label>
            {published
              .filter((t) => seasonOf(t.startDate) === season)
              .map((t) => {
                const top = computeStandings(d.matches.filter((m) => m.tournamentId === t.id), d.ballots, t.rankBy ?? 'ballots')[0];
                return (
                  <Card key={t.id} onPress={() => router.push(`/tournament/${t.id}`)}>
                    <View style={{ flexDirection: 'row', gap: space.md }}>
                      <DateBlock date={t.startDate} />
                      <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
                        <H2 numberOfLines={2}>{t.name}</H2>
                        <Body muted numberOfLines={1}>
                          {fmtRange(t.startDate, t.endDate)} · {t.hostName}
                        </Body>
                        <Row>
                          {top && <Pill text={`Champion: ${teamName(d.teams, top.teamId)}`} tone="good" />}
                          {isLocked(t, todayLocal()) ? <Pill text="Final" /> : <Pill text="Results may still change" tone="warn" />}
                        </Row>
                      </View>
                    </View>
                  </Card>
                );
              })}
          </View>
        ))
      )}
    </Screen>
  );
}
