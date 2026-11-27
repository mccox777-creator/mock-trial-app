import { useLocalSearchParams, router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Card, Empty, H1, Label, Loading, Mono, Row, Screen } from '../../components/ui';
import { useHistory } from '../../lib/store';
import { finishText, pointsFor, schoolOfTeam } from '../../lib/history';
import { space, useTheme } from '../../lib/theme';

const ORDER = ['winner', 'advanced', 'finalist', 'place', 'semifinalist', 'quarterfinalist', 'octofinalist'];

export default function PastEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { events } = useHistory();
  const c = useTheme();
  if (!events) return <Loading />;
  const e = events.find((x) => x.id === id);
  if (!e) return <Screen><Empty title="Competition not found" body="It may belong to another circuit. Switch circuits on the Results tab." /></Screen>;
  const results = [...e.results].sort((a, b) => ORDER.indexOf(a.finish) - ORDER.indexOf(b.finish) || (a.place ?? 9) - (b.place ?? 9));
  const go = (team: string) => router.push({ pathname: '/history/school', params: { name: schoolOfTeam(team) } });

  return (
    <Screen>
      <Mono muted>{`${e.term} ${e.season}`}</Mono>
      <H1>{e.name}</H1>
      <Body muted>{[e.region, e.host && `Hosted by ${e.host}`, e.dates].filter(Boolean).join(' · ')}</Body>
      {(e.teamCount || e.schoolCount) && <Body muted>{[e.teamCount && `${e.teamCount} teams`, e.schoolCount && `${e.schoolCount} schools`].filter(Boolean).join(', ')}</Body>}

      <Label>Results</Label>
      {results.length === 0 ? (
        <Body muted>No placements recorded.</Body>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {results.map((r, i) => (
            <Pressable key={`${r.team}-${i}`} onPress={() => go(r.team)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 10, borderBottomWidth: 1, borderColor: c.line, gap: space.sm }}>
              <Text style={{ width: 110, color: r.finish === 'winner' || r.finish === 'advanced' ? c.good : c.muted, fontWeight: '700' }}>{finishText(r)}</Text>
              <Text style={{ flex: 1, color: c.ink, fontSize: 16 }}>{r.team}</Text>
              {pointsFor(r) > 0 && <Text style={{ color: c.muted }}>{`+${pointsFor(r)}`}</Text>}
            </Pressable>
          ))}
        </Card>
      )}

      {e.participants.length > 0 && (
        <>
          <Label>{`Teams · ${e.participants.length}`}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {e.participants.map((p) => (
              <Pressable key={p} onPress={() => go(p)} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                <Text style={{ color: c.ink }}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
      <Row>
        <Body muted>From the circuit's published results record.{e.needsReview ? ' Part of this entry could not be read automatically; the organizer may want to check it.' : ''}</Body>
      </Row>
    </Screen>
  );
}
