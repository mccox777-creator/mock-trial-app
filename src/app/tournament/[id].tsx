import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, Empty, H1, H2, Label, Loading, Mono, Pill, Row, Screen, Segmented, SideTag, effectiveStatus } from '../../components/ui';
import { StandingsTable } from '../../components/StandingsTable';
import { useStore } from '../../lib/store';
import { computeStandings, resultFor, teamName } from '../../lib/scoring';
import { ballotsText, fmtDate, fmtRange, fmtTime, todayLocal } from '../../lib/format';
import { REG_LABEL } from '../../lib/labels';
import type { Registration, RegistrationStatus } from '../../lib/types';
import { space, useTheme } from '../../lib/theme';

type Tab = 'overview' | 'teams' | 'rounds' | 'standings';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, canManage, canScore, save } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const t = data?.tournaments.find((x) => x.id === id);

  const matches = useMemo(() => (data ? data.matches.filter((m) => m.tournamentId === id).sort((a, b) => a.round - b.round || a.courtroom.localeCompare(b.courtroom)) : []), [data, id]);
  if (!data) return <Loading />;
  if (!t) return <Screen><Empty title="Competition not found" body="It may have been removed by its director." /></Screen>;

  const manager = canManage(t);
  const scorer = canScore(t);
  const status = effectiveStatus(t);
  const regs = data.registrations.filter((r) => r.tournamentId === t.id);
  const approved = regs.filter((r) => r.status === 'approved');
  const myReg = me ? regs.find((r) => r.submittedBy === me.id || me.teamIds.includes(r.teamId)) : undefined;
  const cs = t.caseId ? data.cases.find((c) => c.id === t.caseId) : undefined;
  const roundsPaired = [...new Set(matches.map((m) => m.round))];
  const nextRound = roundsPaired.length ? Math.max(...roundsPaired) + 1 : 1;
  const regOpen = status.text === 'Registration open';

  return (
    <Screen>
      <Stack.Screen options={{ title: t.name }} />
      <View style={{ gap: 6 }}>
        <H1>{t.name}</H1>
        <Body muted>
          {fmtRange(t.startDate, t.endDate)} · {[t.venue, t.city].filter(Boolean).join(', ')}
        </Body>
        <Row>
          <Pill text={status.text} tone={status.tone} />
          {manager && <Pill text="You direct this" tone="accent" />}
          {!manager && scorer && <Pill text="You're on tab staff" tone="accent" />}
        </Row>
      </View>

      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { id: 'overview', label: 'Overview' },
          { id: 'teams', label: `Teams ${approved.length}` },
          { id: 'rounds', label: 'Rounds' },
          { id: 'standings', label: 'Standings' },
        ]}
      />

      {tab === 'overview' && (
        <>
          {manager && t.status === 'draft' && (
            <Card>
              <H2>This competition is a draft</H2>
              <Body muted>Only you can see it. Publish it to open registration.</Body>
              <Button title="Publish and open registration" onPress={() => save('tournaments', { ...t, status: 'registration_open' })} />
            </Card>
          )}
          {regOpen && !manager && (
            <Card>
              {myReg ? (
                <>
                  <H2>{teamName(data.teams, myReg.teamId)} is signed up</H2>
                  <Pill text={REG_LABEL[myReg.status]} tone={myReg.status === 'approved' ? 'good' : myReg.status === 'declined' ? 'bad' : 'warn'} />
                </>
              ) : (
                <>
                  <H2>Registration closes {fmtDate(t.registrationDeadline)}</H2>
                  <Body muted>
                    {approved.length} of {t.teamCap} slots filled · ${t.entryFee} per team
                  </Body>
                  <Button title={me ? 'Register a team' : 'Sign in to register'} onPress={() => router.push(me ? `/tournament/register?id=${t.id}` : '/account')} />
                </>
              )}
            </Card>
          )}
          <Card>
            <Label>Format</Label>
            <Body>
              {t.prelimRounds} preliminary rounds · {t.ballotsPerRound} ballots per round · {t.pairingMethod === 'power' ? 'power-matched after Round 1' : 'random pairings'} · {t.sideConstraint === 'alternate' ? 'teams alternate sides' : t.sideConstraint === 'balanced' ? 'sides balanced overall' : 'no side constraint'}
            </Body>
            <Label style={{ marginTop: space.sm }}>Host</Label>
            <Body>{t.hostName}</Body>
            {t.description ? (
              <>
                <Label style={{ marginTop: space.sm }}>About</Label>
                <Body>{t.description}</Body>
              </>
            ) : null}
          </Card>
          {cs && (
            <Card onPress={() => router.push(`/case/${cs.id}`)}>
              <Label>Case</Label>
              <Mono muted>{cs.docket}</Mono>
              <H2>{cs.title}</H2>
            </Card>
          )}
          {manager && (
            <View style={{ gap: space.sm }}>
              <Button title="Edit competition" kind="secondary" onPress={() => router.push(`/tournament/new?id=${t.id}`)} />
              <Button title="Post a bulletin to teams" kind="secondary" onPress={() => router.push(`/bulletin/new?tournamentId=${t.id}`)} />
            </View>
          )}
        </>
      )}

      {tab === 'teams' && <TeamsTab regs={regs} manager={manager} />}

      {tab === 'rounds' && (
        <>
          {manager && nextRound <= t.prelimRounds && approved.length >= 2 && (
            <Button title={`Pair Round ${nextRound}`} onPress={() => router.push(`/tournament/pair?id=${t.id}&round=${nextRound}`)} />
          )}
          {roundsPaired.length === 0 ? (
            <Empty title="No rounds posted yet" body="Pairings, courtrooms, and start times appear here as soon as the director posts them." />
          ) : (
            roundsPaired.map((round) => (
              <View key={round} style={{ gap: space.sm }}>
                <Label>Round {round}</Label>
                {matches
                  .filter((m) => m.round === round)
                  .map((m) => {
                    const r = resultFor(m.id, data.ballots);
                    const vids = data.recordings.filter((v) => v.matchId === m.id).length;
                    return (
                      <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)}>
                        <Row style={{ justifyContent: 'space-between' }}>
                          <Body muted style={{ fontSize: 13 }}>
                            {m.courtroom} · {fmtTime(m.startsAt)}
                          </Body>
                          {r.winner === null ? scorer ? <Pill text="Enter scores" tone="warn" /> : <Pill text="Awaiting ballots" /> : <Pill text="Scored" tone="good" />}
                        </Row>
                        <MatchLine side="p" kind={cs?.kind} name={teamName(data.teams, m.pTeamId)} ballots={r.winner ? r.pBallots : null} won={r.winner === 'p'} />
                        <MatchLine side="d" kind={cs?.kind} name={teamName(data.teams, m.dTeamId)} ballots={r.winner ? r.dBallots : null} won={r.winner === 'd'} />
                        {vids > 0 && <Body muted>{vids} recording{vids === 1 ? '' : 's'}</Body>}
                      </Card>
                    );
                  })}
              </View>
            ))
          )}
        </>
      )}

      {tab === 'standings' &&
        (() => {
          const s = computeStandings(matches, data.ballots);
          return s.length === 0 ? (
            <Empty title="No scores yet" body="Standings update the moment tab staff enter a round's ballots." />
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <StandingsTable standings={s} teams={data.teams} />
            </Card>
          );
        })()}
    </Screen>
  );
}

function MatchLine({ side, kind, name, ballots, won }: { side: 'p' | 'd'; kind?: 'civil' | 'criminal'; name: string; ballots: number | null; won: boolean }) {
  const c = useTheme();
  return (
    <Row style={{ flexWrap: 'nowrap' }}>
      <SideTag side={side} kind={kind} />
      <Body style={{ flex: 1, fontWeight: won ? '800' : '500' }} numberOfLines={1}>
        {name}
      </Body>
      {ballots !== null && <Mono style={{ color: won ? c.good : c.muted, fontWeight: '700' }}>{ballotsText(ballots)}</Mono>}
    </Row>
  );
}

function TeamsTab({ regs, manager }: { regs: Registration[]; manager: boolean }) {
  const { data, save } = useStore();
  if (!data) return null;
  const order: RegistrationStatus[] = ['pending', 'approved', 'waitlisted', 'declined'];
  const visible = manager ? regs : regs.filter((r) => r.status === 'approved');
  if (visible.length === 0) return <Empty title="No teams yet" body="Teams appear here once they register and the director confirms them." />;
  const today = todayLocal();
  return (
    <>
      {order.map((st) => {
        const group = visible.filter((r) => r.status === st);
        if (group.length === 0) return null;
        return (
          <View key={st} style={{ gap: space.sm }}>
            <Label>
              {REG_LABEL[st]} · {group.length}
            </Label>
            {group.map((r) => {
              const team = data.teams.find((x) => x.id === r.teamId);
              const program = data.programs.find((p) => p.id === team?.programId);
              return (
                <Card key={r.id}>
                  <H2>{team?.name ?? 'Unknown team'}</H2>
                  <Body muted>{program?.name}</Body>
                  {manager && (
                    <>
                      <Body muted>
                        {r.contactName} · {r.contactEmail} · signed up {fmtDate(r.createdAt.slice(0, 10) || today)}
                      </Body>
                      <Row>
                        {r.status !== 'approved' && <Button small title="Confirm" onPress={() => save('registrations', { ...r, status: 'approved' })} />}
                        {r.status !== 'waitlisted' && <Button small kind="secondary" title="Waitlist" onPress={() => save('registrations', { ...r, status: 'waitlisted' })} />}
                        {r.status !== 'declined' && <Button small kind="ghost" title="Decline" onPress={() => save('registrations', { ...r, status: 'declined' })} />}
                      </Row>
                    </>
                  )}
                </Card>
              );
            })}
          </View>
        );
      })}
    </>
  );
}
