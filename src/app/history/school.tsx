import { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Card, Empty, H1, Label, Loading, Row, Screen } from '../../components/ui';
import { PastEventCard } from '../../components/CircuitHistory';
import { useHistory } from '../../lib/store';
import { circuitPoints, finishText, schoolHistory, seasonsOf } from '../../lib/history';
import { START, eloFor, fmtChange, tierInGroup } from '../../lib/elo';
import { ENROLLMENT_SOURCE, enrollmentOf, lsatOf, peerTiers } from '../../lib/divisions';
import { space } from '../../lib/theme';

export default function SchoolHistoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { events } = useHistory();
  const rows = useMemo(() => (events && name ? schoolHistory(events, name) : []), [events, name]);
  const bySeason = useMemo(() => {
    if (!events || !name) return [];
    return seasonsOf(events).map((s) => {
      const table = circuitPoints(events, s);
      const i = table.findIndex((r) => r.school === name);
      return { season: s, row: i >= 0 ? table[i] : null, rank: i + 1 };
    });
  }, [events, name]);
  const elo = useMemo(() => (events ? eloFor(events) : null), [events]);
  if (!events) return <Loading />;
  if (!name || rows.length === 0) return <Screen><Empty title="No past results" body="This school has no recorded competitions in this circuit." /></Screen>;
  const total = bySeason.reduce((a, s) => a + (s.row?.points ?? 0), 0);
  const mine = elo?.rows.get(name);
  const rank = mine ? elo!.ranked.indexOf(mine) + 1 : 0;
  const peer = mine && elo ? peerTiers(elo.ranked, tierInGroup).get(name!) : undefined;

  return (
    <Screen>
      <H1>{name}</H1>
      <Body muted>{`${rows.length} competitions · ${total} circuit points`}</Body>
      {mine && (
        <Card>
          <Label>Mock Trial ELO Rating</Label>
          <Row style={{ alignItems: 'baseline' }}>
            <H1>{String(Math.round(mine.rating))}</H1>
            <Body muted>{`#${rank} of ${elo!.ranked.length}${mine.provisional ? ' · provisional' : ''}`}</Body>
          </Row>
          <Body muted>{`Peak ${Math.round(mine.peak)} · started at ${START} · ${mine.events} competitions rated`}</Body>
          {peer && (
            <Body muted>{`${peer.group.label} · Tier ${peer.tier} (#${peer.place} of ${peer.of}) · ${enrollmentOf(name!)} JD students, median LSAT ${lsatOf(name!)} (ABA ${ENROLLMENT_SOURCE.year})`}</Body>
          )}
        </Card>
      )}
      <Card>
        {bySeason.filter((s) => s.row).map((s) => (
          <Row key={s.season} style={{ justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '600' }}>{s.season}</Body>
            <Body muted>{`${s.row!.points} pts · #${s.rank} · ${s.row!.placed} of ${s.row!.entered} placed`}</Body>
          </Row>
        ))}
      </Card>
      {seasonsOf(rows.map((r) => r.event)).map((season) => (
        <View key={season} style={{ gap: space.sm }}>
          <Label>{`${season} season`}</Label>
          {rows
            .filter((r) => r.event.season === season)
            .map((r) => (
              <PastEventCard
                key={r.event.id}
                e={r.event}
                note={[r.best ? finishText(r.best) : 'Competed', elo?.byEvent.get(r.event.id)?.get(name) ? `ELO ${fmtChange(elo.byEvent.get(r.event.id)!.get(name)!)}` : null].filter(Boolean).join(' · ')}
              />
            ))}
        </View>
      ))}
    </Screen>
  );
}
