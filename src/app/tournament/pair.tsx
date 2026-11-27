import { useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, Field, H2, Label, Loading, Row, Screen, SideTag } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { suggestPairings, teamName } from '../../lib/scoring';
import { isValidDateTime, nowLocal } from '../../lib/format';
import { space } from '../../lib/theme';

export default function PairRoundScreen() {
  const { id, round: roundParam } = useLocalSearchParams<{ id: string; round: string }>();
  const round = Number(roundParam) || 1;
  const { data, me, canManage, save } = useStore();
  const t = data?.tournaments.find((x) => x.id === id);
  const [seed, setSeed] = useState(round * 31);
  const [startsAt, setStartsAt] = useState(t ? `${t.startDate}T09:00` : '');
  const [notify, setNotify] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suggested = useMemo(() => {
    if (!data || !t) return [];
    const teamIds = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').map((r) => r.teamId);
    const prior = data.matches.filter((m) => m.tournamentId === t.id && m.round < round);
    return suggestPairings({ teamIds, round, priorMatches: prior, ballots: data.ballots, method: t.pairingMethod, sideConstraint: t.sideConstraint, seed });
  }, [data, t, round, seed]);
  const [flips, setFlips] = useState<Record<number, boolean>>({});
  const pairs = suggested.map((p, i) => (flips[i] ? { pTeamId: p.dTeamId, dTeamId: p.pTeamId } : p));

  if (!data) return <Loading />;
  if (!t || !me || !canManage(t)) return <Screen><Body>Only the director can pair rounds.</Body></Screen>;
  const cs = data.cases.find((c) => c.id === t.caseId);
  const approvedCount = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').length;

  async function publish() {
    if (!isValidDateTime(startsAt)) return setErr('Use the format YYYY-MM-DDTHH:MM, for example 2027-01-22T09:00.');
    setBusy(true);
    try {
      for (const [i, p] of pairs.entries()) {
        await save('matches', { id: newId('m'), tournamentId: t!.id, round, startsAt, courtroom: `Courtroom ${String.fromCharCode(65 + i)}`, ...p });
      }
      if (t!.status === 'registration_open' || t!.status === 'registration_closed') await save('tournaments', { ...t!, status: 'in_progress' });
      if (notify)
        await save('bulletins', {
          id: newId('b'), level: t!.level, tournamentId: t!.id, caseId: null, kind: 'schedule',
          title: `${t!.name}: Round ${round} pairings posted`, body: `Round ${round} starts ${startsAt.replace('T', ' at ')}. Check the Rounds tab for your courtroom and side.`,
          postedAt: nowLocal(), postedBy: me!.id,
        });
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not post pairings.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H2>
        Round {round} of {t.prelimRounds}
      </H2>
      <Body muted>
        {round === 1 ? 'Round 1 is drawn at random.' : t.pairingMethod === 'power' ? 'Teams are power-matched by record, avoiding rematches.' : 'Random draw, avoiding rematches.'}{' '}
        {approvedCount % 2 === 1 ? 'With an odd number of teams, one team has a bye this round.' : ''}
      </Body>
      <Field label="Start time" value={startsAt} onChangeText={setStartsAt} placeholder="2027-01-22T09:00" />

      {pairs.map((p, i) => (
        <Card key={`${p.pTeamId}-${p.dTeamId}`}>
          <Label>Courtroom {String.fromCharCode(65 + i)}</Label>
          <Row style={{ flexWrap: 'nowrap' }}>
            <SideTag side="p" kind={cs?.kind} />
            <Body style={{ flex: 1 }}>{teamName(data.teams, p.pTeamId)}</Body>
          </Row>
          <Row style={{ flexWrap: 'nowrap' }}>
            <SideTag side="d" kind={cs?.kind} />
            <Body style={{ flex: 1 }}>{teamName(data.teams, p.dTeamId)}</Body>
          </Row>
          <View style={{ alignItems: 'flex-start' }}>
            <Button small kind="ghost" title="Swap sides" onPress={() => setFlips((f) => ({ ...f, [i]: !f[i] }))} />
          </View>
        </Card>
      ))}

      <View style={{ gap: space.sm }}>
        <Button small kind="secondary" title="Redraw pairings" onPress={() => { setFlips({}); setSeed((s) => s + 1); }} />
        <Button small kind="ghost" title={notify ? 'Bulletin to teams: on' : 'Bulletin to teams: off'} onPress={() => setNotify((n) => !n)} />
      </View>
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button title={`Post Round ${round} pairings`} onPress={publish} disabled={busy || pairs.length === 0} />
    </Screen>
  );
}
