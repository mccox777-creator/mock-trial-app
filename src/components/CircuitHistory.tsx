import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Empty, H2, Label, Loading, Pill, Row } from './ui';
import { useHistory } from '../lib/store';
import { circuitPoints, seasonsOf, sortEvents } from '../lib/history';
import type { PastEvent } from '../lib/types';
import { radius, space, useTheme } from '../lib/theme';

/** Circuit points by season and every past competition, from the imported results record. */
export function CircuitHistory() {
  const { events, error } = useHistory();
  const c = useTheme();
  const seasons = useMemo(() => (events ? seasonsOf(events) : []), [events]);
  const [season, setSeason] = useState<string>('');
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');
  const pick = season || seasons[0] || 'all';
  const table = useMemo(() => (events ? circuitPoints(events, pick === 'all' ? undefined : pick) : []), [events, pick]);
  const list = useMemo(() => {
    if (!events) return [];
    const needle = q.trim().toLowerCase();
    return sortEvents(events).filter(
      (e) =>
        (pick === 'all' || e.season === pick) &&
        (!needle || `${e.name} ${e.host ?? ''} ${e.region ?? ''} ${e.participants.join(' ')}`.toLowerCase().includes(needle)),
    );
  }, [events, pick, q]);

  if (!events) return <Loading />;
  if (events.length === 0) return <Empty title={error ? 'Could not load past results' : 'No past results for this circuit yet'} body={error ?? 'Past competitions appear here once their results are imported.'} />;

  const shown = q.trim() ? table.filter((r) => r.school.toLowerCase().includes(q.trim().toLowerCase())) : showAll ? table : table.slice(0, 25);
  const chips = [...seasons.map((s) => ({ id: s, label: s })), { id: 'all', label: 'All seasons' }];

  return (
    <View style={{ gap: space.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {chips.map((ch) => {
          const on = ch.id === pick;
          return (
            <Pressable key={ch.id} onPress={() => { setSeason(ch.id); setShowAll(false); }} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceAlt }}>
              <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600' }}>{ch.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search a school or competition"
        placeholderTextColor={c.muted}
        autoCorrect={false}
        style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 10, color: c.ink, fontSize: 16 }}
      />

      <Label>{pick === 'all' ? 'Circuit points, all seasons' : `Circuit points, ${pick}`}</Label>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <PointsRow head cells={['#', 'School', 'Pts', 'Entered', 'Placed']} />
        {shown.map((r) => (
          <PointsRow key={r.school} cells={[String(table.indexOf(r) + 1), r.school, String(r.points), String(r.entered), String(r.placed)]} onPress={() => router.push({ pathname: '/history/school', params: { name: r.school } })} />
        ))}
      </Card>
      {!q.trim() && table.length > 25 && <Button small kind="ghost" title={showAll ? 'Show top 25' : `Show all ${table.length} schools`} onPress={() => setShowAll(!showAll)} />}
      <Body muted>Win 3 points, final 2, semifinal 1, counted once per school per competition. Regional qualifiers count as wins. Tap a school for its full record.</Body>

      <Label>{`Competitions · ${list.length}`}</Label>
      {list.map((e) => (
        <PastEventCard key={e.id} e={e} />
      ))}
    </View>
  );
}

export function PastEventCard({ e, note }: { e: PastEvent; note?: string }) {
  const winners = e.results.filter((r) => r.finish === 'winner' || r.finish === 'advanced').map((r) => r.team);
  return (
    <Card onPress={() => router.push(`/history/${e.id}`)}>
      <H2 numberOfLines={2}>{e.name}</H2>
      <Body muted numberOfLines={1}>{[e.region, e.host && `hosted by ${e.host}`, e.dates, `${e.term} ${e.season}`].filter(Boolean).join(' · ')}</Body>
      <Row>
        {winners.length > 0 && <Pill text={`${winners.length > 1 ? 'Winners' : 'Winner'}: ${winners.join(', ')}`} tone="good" />}
        {note ? <Pill text={note} tone="accent" /> : null}
      </Row>
    </Card>
  );
}

function PointsRow({ cells, head, onPress }: { cells: string[]; head?: boolean; onPress?: () => void }) {
  const c = useTheme();
  const w = [32, undefined, 44, 60, 56];
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} style={{ flexDirection: 'row', paddingHorizontal: space.md, paddingVertical: 9, borderBottomWidth: 1, borderColor: c.line, backgroundColor: head ? c.surfaceAlt : c.surface }}>
      {cells.map((t, i) => (
        <Text key={i} numberOfLines={1} style={{ width: w[i], flex: w[i] ? undefined : 1, textAlign: i >= 2 ? 'right' : 'left', color: head ? c.muted : c.ink, fontWeight: head || i === 2 ? '700' : '400', fontSize: head ? 12 : 15, fontVariant: ['tabular-nums'] }}>
          {t}
        </Text>
      ))}
    </Pressable>
  );
}
