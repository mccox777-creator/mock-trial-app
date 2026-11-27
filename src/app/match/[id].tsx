import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { View } from 'react-native';
import { Body, Button, Card, Empty, Field, H2, Label, Loading, Mono, Pill, Row, Screen, Segmented, SideTag } from '../../components/ui';
import { BallotForm, BallotView } from '../../components/ScoreSheet';
import { newId, useStore } from '../../lib/store';
import { resultFor, teamName } from '../../lib/scoring';
import { ballotsText, fmtDateTime, nowLocal, signed, todayLocal, youtubeLink } from '../../lib/format';
import { VIS_LABEL } from '../../lib/labels';
import { eligibleJudges, isLocked, isOrganizer, judgeName, resultsVisible, scoringOf, visibleBallots } from '../../lib/judging';
import type { Ballot, VideoVisibility } from '../../lib/types';
import { space, useTheme } from '../../lib/theme';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, save, remove, backend } = useStore();
  const c = useTheme();
  const [paperOpen, setPaperOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const m = data?.matches.find((x) => x.id === id);
  const t = m ? data?.tournaments.find((x) => x.id === m.tournamentId) : undefined;
  if (!data) return <Loading />;
  if (!m || !t) return <Screen><Empty title="Trial not found" body="The pairing may have been changed by the organizer." /></Screen>;

  const cs = data.cases.find((x) => x.id === t.caseId);
  const organizer = isOrganizer(t, me);
  const locked = isLocked(t, todayLocal());
  const editable = organizer && !locked;
  const showResult = resultsVisible(t, me);
  const allBallots = data.ballots.filter((b) => b.matchId === m.id);
  const r = resultFor(m.id, allBallots);
  const seen = visibleBallots(data, me).filter((b) => b.matchId === m.id).sort((a, b) => a.judge.localeCompare(b.judge));
  const amJudge = !!me && m.judgeIds.includes(me.id);
  const myBallot = me ? allBallots.find((b) => b.judgeId === me.id) : undefined;
  const onTeam = !!me && (me.teamIds.includes(m.pTeamId) || me.teamIds.includes(m.dTeamId));
  const recordings = data.recordings.filter((v) => v.matchId === m.id && (organizer || v.visibility === 'public' || onTeam));
  const myName = me ? judgeName(data, t.id, me.id) : 'Judge';
  const others = seen.filter((b) => organizer || b.judgeId !== me?.id);

  async function saveBallot(existing: Ballot | undefined, b: { judge: string; sheet: Ballot['sheet']; comments: Ballot['comments']; pScore: number; dScore: number }, asJudge: boolean) {
    await save('ballots', {
      id: existing?.id ?? (asJudge ? `${m!.id}-${me!.id}` : newId('bal')),
      matchId: m!.id,
      judge: asJudge ? myName : b.judge,
      judgeId: asJudge ? me!.id : existing?.judgeId ?? null,
      source: asJudge ? 'app' : existing?.source ?? 'paper',
      sheet: b.sheet,
      comments: b.comments,
      pScore: b.pScore,
      dScore: b.dScore,
      enteredBy: me?.id ?? '',
      enteredAt: nowLocal(),
    });
  }

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
          const won = showResult && r.winner === side;
          return (
            <Row key={side} style={{ flexWrap: 'nowrap' }}>
              <SideTag side={side} kind={cs?.kind} />
              <H2 style={{ flex: 1, fontWeight: won ? '800' : '600' }}>{teamName(data.teams, tid)}</H2>
              {showResult && r.winner && <Mono style={{ fontWeight: '800', color: won ? c.good : c.muted }}>{ballotsText(side === 'p' ? r.pBallots : r.dBallots)}</Mono>}
            </Row>
          );
        })}
        {showResult && r.winner ? (
          <Body muted>
            {r.winner === 'tie' ? 'Split decision' : `${teamName(data.teams, r.winner === 'p' ? m.pTeamId : m.dTeamId)} wins`} · point differential {signed(Math.abs(r.pointDiff))}
            {organizer && !t.resultsPublished ? ' · only you can see this' : ''}
          </Body>
        ) : !showResult ? (
          <Body muted>The organizer releases results after the competition.</Body>
        ) : null}
      </Card>

      {amJudge && (
        <>
          <Label>Your ballot</Label>
          {locked && !myBallot ? (
            <Body muted>This competition is locked. No more ballots can be submitted.</Body>
          ) : myBallot && editing !== 'mine' ? (
            <>
              <BallotView ballot={myBallot} witnesses={t.witnessesPerSide} scoring={scoringOf(t)} kind={cs?.kind} />
              {!t.resultsPublished && !locked && <Button title="Change my scores" kind="secondary" onPress={() => setEditing('mine')} />}
            </>
          ) : (
            <BallotForm
              title={myBallot ? 'Change your scores' : 'Score this trial'}
              witnesses={t.witnessesPerSide} scoring={scoringOf(t)}
              kind={cs?.kind}
              initial={myBallot}
              allowTotals={false}
              askJudgeName={false}
              defaultJudge={myName}
              onSubmit={async (b) => {
                await saveBallot(myBallot, b, true);
                setEditing(null);
              }}
              onCancel={myBallot ? () => setEditing(null) : undefined}
            />
          )}
          <Body muted>Only you and the organizer can see your scores.</Body>
        </>
      )}

      {organizer && (
        <>
          <Label style={{ marginTop: space.sm }}>
            Judges · {m.judgeIds.length} of {t.ballotsPerRound}
          </Label>
          {m.judgeIds.map((jid) => {
            const submitted = allBallots.some((b) => b.judgeId === jid);
            return (
              <Card key={jid} style={{ paddingVertical: space.md }}>
                <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                  <Body style={{ flex: 1, fontWeight: '600' }}>{judgeName(data, t.id, jid)}</Body>
                  <Pill text={submitted ? 'Ballot in' : 'Waiting'} tone={submitted ? 'good' : 'warn'} />
                  {!submitted && editable && <Button small kind="ghost" title="Remove" onPress={() => save('matches', { ...m, judgeIds: m.judgeIds.filter((x) => x !== jid) })} />}
                </Row>
              </Card>
            );
          })}
          {!editable ? null : picking ? (
            <Card>
              <H2>Assign a judge</H2>
              {eligibleJudges(m, data).length === 0 ? (
                <Body muted>No approved judges are free for this round without a conflict. Approve more judges on the competition's Judges tab.</Body>
              ) : (
                eligibleJudges(m, data).map((j) => (
                  <Button
                    key={j.id}
                    kind="secondary"
                    title={j.name}
                    onPress={async () => {
                      await save('matches', { ...m, judgeIds: [...m.judgeIds, j.userId] });
                      setPicking(false);
                    }}
                  />
                ))
              )}
              <Button title="Done" kind="ghost" onPress={() => setPicking(false)} />
            </Card>
          ) : (
            <Button title="Assign a judge" kind="secondary" onPress={() => setPicking(true)} />
          )}
        </>
      )}

      {(organizer || others.length > 0) && (
        <>
          <Label style={{ marginTop: space.sm }}>{organizer ? 'All ballots' : "Your team's ballots"}</Label>
          {others.length === 0 && <Body muted>No ballots yet.</Body>}
          {others.map((b) =>
            editing === b.id ? (
              <BallotForm
                key={b.id}
                title={`Correct ${b.judge}`}
                witnesses={t.witnessesPerSide} scoring={scoringOf(t)}
                kind={cs?.kind}
                initial={b}
                allowTotals
                askJudgeName={b.source === 'paper'}
                defaultJudge={b.judge}
                onSubmit={async (x) => {
                  await saveBallot(b, x, false);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <View key={b.id} style={{ gap: 6 }}>
                <BallotView ballot={b} witnesses={t.witnessesPerSide} scoring={scoringOf(t)} kind={cs?.kind} />
                {editable && (
                  <Row>
                    <Button small kind="ghost" title="Correct" onPress={() => setEditing(b.id)} />
                    <Button small kind="ghost" title="Delete" onPress={() => remove('ballots', b.id)} />
                  </Row>
                )}
              </View>
            ),
          )}
          {editable &&
            (paperOpen ? (
              <BallotForm
                title="Enter a paper ballot"
                onScan={(img, type, lines) => backend.readBallot(m.id, img, type, lines)}
                witnesses={t.witnessesPerSide} scoring={scoringOf(t)}
                kind={cs?.kind}
                allowTotals
                askJudgeName
                defaultJudge={`Ballot ${allBallots.length + 1}`}
                onSubmit={async (b) => {
                  await saveBallot(undefined, b, false);
                  setPaperOpen(false);
                }}
                onCancel={() => setPaperOpen(false)}
              />
            ) : (
              <Button title="Enter or scan a paper ballot" kind="secondary" onPress={() => setPaperOpen(true)} />
            ))}
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
      {(organizer || onTeam) && <AddRecording matchId={m.id} />}
    </Screen>
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
      <Body muted>Upload the video to YouTube as Unlisted, then paste its link here. Unlisted videos don't show up in YouTube search, but anyone with the link can watch, so share it only through the app.</Body>
      <Field label="Title" value={title} onChangeText={setTitle} placeholder="Full trial, Courtroom B" />
      <Field label="YouTube link" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://youtu.be/…" />
      <Label>Who can watch</Label>
      <Segmented value={vis} onChange={setVis} options={[{ id: 'teams', label: 'These teams' }, { id: 'coaches', label: 'Coaches' }, { id: 'public', label: 'Anyone' }]} />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title="Save recording"
        onPress={async () => {
          const link = youtubeLink(url);
          if (!title.trim() || !link) return setErr('Add a title and a YouTube link, like https://youtu.be/… or https://www.youtube.com/watch?v=…');
          await save('recordings', { id: newId('rec'), matchId, title: title.trim(), provider: 'youtube', url: link, visibility: vis, uploadedBy: me?.id ?? '', createdAt: nowLocal() });
          setOpen(false);
          setTitle('');
          setUrl('');
        }}
      />
    </Card>
  );
}

