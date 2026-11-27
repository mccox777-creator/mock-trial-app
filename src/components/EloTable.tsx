import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Body, Button, Card, Label } from './ui';
import { classOf, type EloRow } from '../lib/elo';
import { space, useTheme } from '../lib/theme';

const W = [32, undefined, 52, 104, 52];

/** School Elo ratings, top 25 with a button for the rest, and a link to how they're calculated. */
export function EloTable({ ranked, filter = '', title = 'Elo ratings, as of the latest results' }: { ranked: EloRow[]; filter?: string; title?: string }) {
  const [showAll, setShowAll] = useState(false);
  const shown = filter ? ranked.filter((r) => r.school.toLowerCase().includes(filter)) : showAll ? ranked : ranked.slice(0, 25);
  return (
    <>
      <Label>{title}</Label>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <PointsRow head cells={['#', 'School', 'Elo', 'Class', 'Comps']} widths={W} />
        {shown.map((r) => (
          <PointsRow
            key={r.school}
            widths={W}
            cells={[String(ranked.indexOf(r) + 1), r.school, `${Math.round(r.rating)}${r.provisional ? '*' : ''}`, classOf(r.rating), String(r.events)]}
            onPress={() => router.push({ pathname: '/history/school', params: { name: r.school } })}
          />
        ))}
      </Card>
      {!filter && ranked.length > 25 && <Button small kind="ghost" title={showAll ? 'Show top 25' : `Show all ${ranked.length} schools`} onPress={() => setShowAll(!showAll)} />}
      <Body muted>
        Chess rules: every school starts at 1500 and gains or loses points for finishing ahead of or behind other schools, more for beating a higher-rated school. A 200-point gap means the higher school finishes ahead about 3 times in 4. * means provisional (under 5 competitions). Classes follow US Chess: Expert 2000+, Class A 1800+, Class B 1600+. Competitions run in the app count as soon as they close with published results.
      </Body>
      <Button small kind="secondary" title="How ratings are calculated, with the data" onPress={() => router.push('/ratings')} />
    </>
  );
}

export function PointsRow({ cells, head, onPress, widths }: { cells: string[]; head?: boolean; onPress?: () => void; widths?: (number | undefined)[] }) {
  const c = useTheme();
  const w = widths ?? [32, undefined, 44, 60, 56];
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
