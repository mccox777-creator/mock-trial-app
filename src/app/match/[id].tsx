import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { Body, Button, Card, Empty, Field, H2, Label, Loading, Mono, Pill, Row, Screen, Segmented, SideTag } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { resultFor, teamName } from '../../lib/scoring';
import { ballotsText, fmtDateTime, nowLocal, signed } from '../../lib/format';
import { VIS_LABEL } from '../../lib/labels';
import type { Ballot, VideoVisibility } from '../../lib/types';
import { space, useTheme } from '../../lib/theme';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, canScore, save } = useStore();
  const c = useTheme();
  const m = data?.matches.find((x) => x.id === id);
  const t = m ? data?.tournaments.find((x) => x.id === m.tournamentId) : undefined;
  const [editing, setEditing] = useState(false);
  if (!data) return <Loading />;
  if (!m || !t) return <Screen><Empty title="Trial not found" body="The pairing may have been changed by the director." /></Screen>;

  const cs = data.cases.find((x) => x.id === t.caseId);
  const ballots = data.ballots.filter((b) => b.matchId === m.id).sort((a, b) => a.judge.localeCompare(b.judge));
  const r = resultFor(m.id, data.ballots);
  const scorer = canScore(t);
  const onTeam = !!me && (me.teamIds.includes(m.pTeamId) || me.teamIds.includes(m.dTeamId));
  const recordings = data.recordings.filter(
    (v) => v.matchId === m.id && (scorer || v.visibility === 'public' || (v.visibility === 'teams' && onTeam) || (v.visibility === 'coaches' && onTeam)),
  );

  return (
    <Screen>
      <Mono muted>
        {t.name} · Round {m.round}
      </Mono>
      <Body muted>
        {m.courtroom} · {fmtDateTime(m.startsAt)}
      </Body>

      <Card>
        {(['p', 'd'] as const).map((side) => {
          const tid = side === 'p' ? m.pTeamId : m.dTeamId;
          const won = r.winner === side;
          return (
            <Row key={side} style={{ flexWrap: 'nowrap' }}>
              <SideTag side={side} kind={cs?.kind} />
              <H2 style={{ flex: 1, fontWeight: won ? '800' : '600' }}>{teamName(data.teams, tid)}</H2>
              {r.winner && <Mono style={{ fontWeight: '800', color: won ? c.good : c.muted }}>{ballotsText(side === 'p' ? r.pBallots : r.dBallots)}</Mono>}
            </Row>
          );
        })}
        {r.winner && (
          <Body muted>
            {r.winner === 'tie' ? 'Split decision' : `${teamName(data.teams, r.winner === 'p' ? m.pTeamId : m.dTeamId)} wins`} · point differential {signed(Math.abs(r.pointDiff))}
          </Body>
        )}
      </Card>

      <Label>Ballots</Label>
      {editing ? (
        <BallotEntry matchId={m.id} count={t.ballotsPerRound} existing={ballots} onDone={() => setEditing(false)} />
      ) : ballots.length === 0 ? (
        <Empty title="No ballots yet" body={scorer ? 'Enter each judge\'s total points for both sides once the round ends.' : 'Scores appear here as soon as the tab room enters them.'} action={scorer ? <Button title="Enter scores" onPress={() => setEditing(true)} /> : undefined} />
      ) : (
        <>
          {ballots.map((b) => (
            <Card key={b.id} style={{ paddingVertical: space.md }}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <Body style={{ fontWeight: '600' }}>{b.judge}</Body>
                <Mono>
                  {b.pScore} – {b.dScore}
                </Mono>
                <Pill text={b.pScore > b.dScore ? (cs?.kind === 'criminal' ? 'Prosecution' : 'Plaintiff') : b.dScore > b.pScore ? 'Defense' : 'Tie'} tone={b.pScore === b.dScore ? 'neutral' : 'accent'} />
              </Row>
            </Card>
          ))}
          {scorer && <Button title="Correct scores" kind="secondary" onPress={() => setEditing(true)} />}
        </>
      )}

      <Label style={{ marginTop: space.md }}>Recordings</Label>
      {recordings.length === 0 && <Body muted>No recordings for this trial yet.</Body>}
      {recordings.map((v) => (
        <Card key={v.id} onPress={() => (v.url.startsWith('https://') ? WebBrowser.openBrowserAsync(v.url) : undefined)}>
          <H2>{v.title}</H2>
          <Body muted>Visible to: {VIS_LABEL[v.visibility].toLowerCase()}</Body>
        </Card>
      ))}
      {(scorer || onTeam) && <AddRecording matchId={m.id} />}
    </Screen>
  );
}

function BallotEntry({ matchId, count, existing, onDone }: { matchId: string; count: number; existing: Ballot[]; onDone: () => void }) {
  const { save, remove, me } = useStore();
  const n = Math.max(count, existing.length);
  const [rows, setRows] = useState(() =>
    Array.from({ length: n }, (_, i) => {
      const b = existing[i];
      return { id: b?.id ?? `${matchId}-b${i + 1}`, judge: b?.judge ?? `Ballot ${i + 1}`, p: b ? String(b.pScore) : '', d: b ? String(b.dScore) : '' };
    }),
  );
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const filled = rows.filter((r) => r.p.trim() !== '' || r.d.trim() !== '');
    if (filled.length === 0) return setErr('Enter at least one ballot.');
    for (const r of filled) {
      const p = Number(r.p);
      const d = Number(r.d);
      if (!Number.isFinite(p) || !Number.isFinite(d) || p < 0 || d < 0 || r.p.trim() === '' || r.d.trim() === '')
        return setErr(`${r.judge}: enter a total for both sides.`);
    }
    setBusy(true);
    try {
      for (const r of rows) {
        const isFilled = r.p.trim() !== '' && r.d.trim() !== '';
        if (isFilled)
          await save('ballots', { id: r.id, matchId, judge: r.judge, pScore: Number(r.p), dScore: Number(r.d), enteredBy: me?.id ?? '', enteredAt: nowLocal() });
        else if (existing.some((b) => b.id === r.id)) await remove('ballots', r.id);
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the ballots.');
      setBusy(false);
    }
  }

  return (
    <Card>
      <Body muted>Enter each judge's total points. Leave a row blank if that judge did not score.</Body>
      {rows.map((r, i) => (
        <View key={r.id} style={{ gap: 6 }}>
          <Label>{r.judge}</Label>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="Plaintiff / Pros." value={r.p} keyboardType="number-pad" onChangeText={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, p: v } : y)))} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Defense" value={r.d} keyboardType="number-pad" onChangeText={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, d: v } : y)))} />
            </View>
          </Row>
        </View>
      ))}
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button title="Save and post scores" onPress={submit} disabled={busy} />
      <Button title="Cancel" kind="ghost" onPress={onDone} />
    </Card>
  );
}

function AddRecording({ matchId }: { matchId: string }) {
  const { save, me } = useStore();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [vis, setVis] = useState<VideoVisibility>('teams');
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <Button title="Add a recording" kind="secondary" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <H2>Add a recording</H2>
      <Body muted>Paste a link to the video for now. Direct upload from your phone comes once the video service is connected.</Body>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Full trial, Courtroom B" />
      <Field label="Video link" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://" />
      <Label>Who can watch</Label>
      <Segmented value={vis} onChange={setVis} options={[{ id: 'teams', label: 'These teams' }, { id: 'coaches', label: 'Coaches' }, { id: 'public', label: 'Anyone' }]} />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title="Save recording"
        onPress={async () => {
          if (!title.trim() || !url.trim().startsWith('https://')) return setErr('Add a title and a link that starts with https://');
          await save('recordings', { id: newId('rec'), matchId, title: title.trim(), provider: 'link', url: url.trim(), visibility: vis, uploadedBy: me?.id ?? '', createdAt: nowLocal() });
          setOpen(false);
          setTitle('');
          setUrl('');
        }}
      />
    </Card>
  );
}
