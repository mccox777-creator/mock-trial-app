import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';
import { Body, Button, Card, Label } from './ui';
import { classOf, type EloRow } from '../lib/elo';
import { ENROLLMENT_SOURCE, GROUPINGS, groupingOfTier, inTier, type TierId } from '../lib/divisions';
import { radius, space, useTheme } from '../lib/theme';

const W = [32, undefined, 52, 104, 52];

/** School Elo ratings: overall top 25 with a button for the rest, plus a top 20 for each size division and LSAT tier, and a link to how they're calculated. */
export function EloTable({ ranked, filter = '', title = 'Mock Trial ELO Ratings, as of the latest results' }: { ranked: EloRow[]; filter?: string; title?: string }) {
  const c = useTheme();
  const [showAll, setShowAll] = useState(false);
  const [tier, setTier] = useState<TierId | 'all'>('all');
  const grouping = tier === 'all' ? null : groupingOfTier(tier);
  const div = grouping?.tiers.find((t) => t.id === tier) ?? null;
  const list = div ? inTier(ranked, div.id) : ranked;
  const top = div ? 20 : 25;
  const shown = filter ? list.filter((r) => r.school.toLowerCase().includes(filter)) : showAll ? list : list.slice(0, top);
  const chip = (id: TierId | 'all', label: string) => {
    const on = id === tier;
    return (
      <Pressable
        key={id}
        onPress={() => {
          setTier(id);
          setShowAll(false);
        }}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceAlt }}
      >
        <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600' }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <>
      <Label>{div ? `${title} · ${div.label}` : title}</Label>
      {GROUPINGS.map((g, i) => (
        <ScrollView key={g.id} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, alignItems: 'center' }}>
          {i === 0 && chip('all', 'All schools')}
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>{g.label}</Text>
          {g.tiers.map((t) => chip(t.id, t.short))}
        </ScrollView>
      ))}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <PointsRow head cells={['#', 'School', 'ELO', div ? 'Overall' : 'Class', 'Comps']} widths={W} />
        {shown.map((r) => (
          <PointsRow
            key={r.school}
            widths={W}
            cells={[
              String(list.indexOf(r) + 1),
              r.school,
              `${Math.round(r.rating)}${r.provisional ? '*' : ''}`,
              div ? `#${ranked.indexOf(r) + 1}` : classOf(r.rating),
              String(r.events),
            ]}
            onPress={() => router.push({ pathname: '/history/school', params: { name: r.school } })}
          />
        ))}
      </Card>
      {!filter && list.length > top && <Button small kind="ghost" title={showAll ? `Show top ${top}` : `Show all ${list.length} schools`} onPress={() => setShowAll(!showAll)} />}
      {div ? (
        <Body muted>
          {grouping?.id === 'lsat'
            ? `LSAT tiers compare schools that admit similar students, using the entering class's median LSAT from the ABA's ${ENROLLMENT_SOURCE.year} Standard 509 reports. Every school keeps one rating from all its competitions, so wins over schools in other tiers still count. Overall is the school's place among all schools.`
            : `Divisions group schools by size, the way college football does. Size is total JD enrollment from the ABA's ${ENROLLMENT_SOURCE.year} Standard 509 reports. Every school keeps one rating from all its competitions, so wins over bigger or smaller schools still count. Overall is the school's place among all schools.`}
        </Body>
      ) : (
        <Body muted>
          Chess rules: every school starts at 1500 and gains or loses points for each of its teams finishing ahead of or behind other schools' teams, more for beating a higher-rated school. A 200-point gap means the higher school finishes ahead about 3 times in 4. * means provisional (under 5 competitions). Classes follow US Chess: Expert 2000+, Class A 1800+, Class B 1600+. Competitions run in the app count as soon as they close with published results.
        </Body>
      )}
      <Button small kind="secondary" title="How the Mock Trial ELO Ratings are calculated" onPress={() => router.push('/ratings')} />
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
