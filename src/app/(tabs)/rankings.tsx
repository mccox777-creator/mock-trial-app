import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Card, Empty, Label, LevelSwitcher, Loading, Screen } from '../../components/ui';
import { StandingsTable } from '../../components/StandingsTable';
import { useLevelData } from '../../lib/store';
import { computeStandings } from '../../lib/scoring';
import { radius, space, useTheme } from '../../lib/theme';

export default function RankingsScreen() {
  const d = useLevelData();
  const c = useTheme();
  const [scope, setScope] = useState<string>('season');

  const scored = useMemo(() => {
    if (!d) return [];
    const ids = new Set(d.ballots.map((b) => b.matchId));
    return d.tournaments.filter((t) => d.matches.some((m) => m.tournamentId === t.id && ids.has(m.id))).sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [d]);

  const standings = useMemo(() => {
    if (!d) return [];
    const matches = scope === 'season' ? d.matches : d.matches.filter((m) => m.tournamentId === scope);
    return computeStandings(matches, d.ballots);
  }, [d, scope]);

  if (!d) return <Loading />;

  const chips = [{ id: 'season', label: 'Season' }, ...scored.map((t) => ({ id: t.id, label: t.name }))];

  return (
    <Screen>
      <LevelSwitcher />
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

      {standings.length === 0 ? (
        <Empty title="No scored rounds yet" body="Rankings fill in as tournament staff enter ballots after each round." />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <StandingsTable standings={standings} teams={d.teams} />
        </Card>
      )}
      <View style={{ gap: 4 }}>
        <Label>How teams are ranked</Label>
        <Body muted>
          Wins first, then ballots won, then combined strength (CS, the total wins of every opponent faced), then point differential (PD). A tied ballot counts as half to each side.
        </Body>
      </View>
    </Screen>
  );
}
