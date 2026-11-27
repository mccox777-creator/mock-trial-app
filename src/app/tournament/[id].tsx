import { useMemo, useState } from 'react';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Body, Button, Card, Empty, H1, H2, Label, Loading, Mono, Pill, Row, Screen, SideTag, effectiveStatus } from '../../components/ui';
import { StandingsTable } from '../../components/StandingsTable';
import { newId, useStore } from '../../lib/store';
import { computeStandings, resultFor, teamName } from '../../lib/scoring';
import { ballotsText, fmtDate, fmtDateTime, fmtRange, fmtTime, nowLocal, todayLocal } from '../../lib/format';
import { regLabel } from '../../lib/labels';
import { AUTO_LOCK_DAYS, BACKGROUND_LABEL, autoAssign, autoLockDate, canChange, isLocked, isOrganizer, resultsVisible, describeScoring, scoringOf, SHEET_PARTS } from '../../lib/judging';
import type { AppData, Match, Registration, RegistrationStatus, Tournament } from '../../lib/types';
import { radius, space, useTheme } from '../../lib/theme';
import type { ScoringSetup } from '../../lib/types';
import { ChatPanel } from '../../components/ChatPanel';
import { chatRole } from '../../lib/chat';
import { describeRules, type RuleSet } from '../../lib/rules';

type Tab = 'overview' | 'teams' | 'pairings' | 'grid' | 'standings' | 'chat' | 'judges';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, save } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const t = data?.tournaments.find((x) => x.id === id);
  const matches = useMemo(
    () => (data ? data.matches.filter((m) => m.tournamentId === id).sort((a, b) => a.round - b.round || a.courtroom.localeCompare(b.courtroom)) : []),
    [data, id],
  );
  if (!data) return <Loading />;
  if (!t) return <Screen><Empty title="Competition not found" body="It may have been removed by its organizer." /></Screen>;

  const organizer = isOrganizer(t, me);
  const locked = isLocked(t, todayLocal());
  const status = effectiveStatus(t);
  const invitational = t.entryType === 'invitational';
  const regs = data.registrations.filter((r) => r.tournamentId === t.id);
  const approved = regs.filter((r) => r.status === 'approved');
  const myReg = me ? regs.find((r) => r.submittedBy === me.id || me.teamIds.includes(r.teamId)) : undefined;
  const myJudging = me ? data.judgeSignups.find((j) => j.tournamentId === t.id && j.userId === me.id) : undefined;
  const pendingJudges = data.judgeSignups.filter((j) => j.tournamentId === t.id && j.status === 'pending').length;
  const pendingTeams = regs.filter((r) => r.status === 'pending').length;
  const cs = t.caseId ? data.cases.find((c) => c.id === t.caseId) : undefined;
  const regOpen = status.text === 'Registration open';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'teams', label: `Teams ${approved.length}${organizer && pendingTeams ? ` · ${pendingTeams} new` : ''}` },
    { id: 'pairings', label: 'Pairings' },
    { id: 'grid', label: 'By team' },
    ...(resultsVisible(t, me) ? [{ id: 'standings' as Tab, label: 'Standings' }] : []),
    ...(chatRole(t, me, data) ? [{ id: 'chat' as Tab, label: 'Chat' }] : []),
    ...(organizer ? [{ id: 'judges' as Tab, label: `Judges${pendingJudges ? ` · ${pendingJudges} new` : ''}` }] : []),
  ];

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
          <Pill text={invitational ? 'Invitational' : 'Open'} />
          {organizer && <Pill text="You organize this" tone="accent" />}
          {locked && <Pill text="Final and locked" />}
          {myJudging?.status === 'approved' && <Pill text="You're judging" tone="accent" />}
        </Row>
      </View>

      <TabBar tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'chat' && <ChatPanel t={t} />}

      {tab === 'overview' && (
        <>
          {organizer && t.status === 'draft' && (
            <Card>
              <H2>This competition is a draft</H2>
              <Body muted>Only you can see it. Publish it to open {invitational ? 'invitation requests' : 'registration'}.</Body>
              <Button title="Publish" onPress={() => save('tournaments', { ...t, status: 'registration_open' })} />
            </Card>
          )}
          {organizer && <ResultsControls t={t} />}
          {regOpen && !organizer && (
            <Card>
              {myReg ? (
                <>
                  <H2>{teamName(data.teams, myReg.teamId)}</H2>
                  <Pill text={regLabel(myReg.status, invitational)} tone={myReg.status === 'approved' ? 'good' : myReg.status === 'declined' ? 'bad' : 'warn'} />
                </>
              ) : (
                <>
                  <H2>{invitational ? `Invitation requests close ${fmtDate(t.registrationDeadline)}` : `Registration closes ${fmtDate(t.registrationDeadline)}`}</H2>
                  <Body muted>
                    {invitational ? 'This is an invitational. Send the organizer a request and they decide who is invited.' : `${approved.length} of ${t.teamCap} slots filled.`} ${t.entryFee} per team.
                  </Body>
                  <Button title={!me ? 'Sign in to register' : invitational ? 'Request an invitation' : 'Register a team'} onPress={() => router.push(me ? `/tournament/register?id=${t.id}` : '/account')} />
                </>
              )}
            </Card>
          )}
          {!organizer && t.status !== 'draft' && status.text !== 'Final' && (
            <Card>
              <Label>Judges needed</Label>
              {myJudging ? (
                <Body>
                  {myJudging.status === 'approved' ? "You're confirmed to judge. Your trials appear under Me once rounds are paired." : myJudging.status === 'pending' ? 'Thanks for volunteering. The organizer will confirm you.' : 'The organizer has a full judging pool for this one.'}
                </Body>
              ) : (
                <>
                  <Body muted>Attorneys, judges, and alumni can volunteer to score trials right from their phone.</Body>
                  <Button title={me ? 'Volunteer to judge' : 'Sign in to volunteer'} kind="secondary" onPress={() => router.push(me ? `/tournament/judge?id=${t.id}` : '/account')} />
                </>
              )}
            </Card>
          )}
          <Card>
            <Label>Format</Label>
            <Body>
              {t.prelimRounds} preliminary rounds · {t.ballotsPerRound} judges per trial · {t.witnessesPerSide} witnesses per side
            </Body>
            <Body>
              {t.randomRounds === 1 ? 'Round 1' : `Rounds 1–${t.randomRounds}`} drawn at random, then {t.pairingMethod === 'power' ? 'power-matched by record' : 'random'} ·{' '}
              {t.sideConstraint === 'alternate' ? 'teams alternate sides' : t.sideConstraint === 'balanced' ? 'sides balanced overall' : 'no side constraint'}
            </Body>
            <Label style={{ marginTop: space.sm }}>Score sheet</Label>
            <Body>{describeScoring(t.witnessesPerSide, scoringOf(t))}</Body>
            <Body muted>{sheetSummary(scoringOf(t))}</Body>
            <Label style={{ marginTop: space.sm }}>Host</Label>
            <Body>{t.hostName}</Body>
            {t.description ? (
              <>
                <Label style={{ marginTop: space.sm }}>About</Label>
                <Body>{t.description}</Body>
              </>
            ) : null}
          </Card>
          <RulesCard rules={t.rules ?? {}} custom={t.customRules ?? ''} />
          {cs && (
            <Card onPress={() => router.push(`/case/${cs.id}`)}>
              <Label>Case</Label>
              <Mono muted>{cs.docket}</Mono>
              <H2>{cs.title}</H2>
            </Card>
          )}
          {organizer && !locked && (
            <View style={{ gap: space.sm }}>
              <Button title="Edit competition" kind="secondary" onPress={() => router.push(`/tournament/new?id=${t.id}`)} />
              <Button title="Post a bulletin to teams" kind="secondary" onPress={() => router.push(`/bulletin/new?tournamentId=${t.id}`)} />
            </View>
          )}
        </>
      )}

      {tab === 'teams' && <TeamsTab t={t} regs={regs} organizer={organizer} />}
      {tab === 'pairings' && <PairingsTab t={t} matches={matches} />}
      {tab === 'grid' && <GridTab t={t} matches={matches} />}
      {tab === 'standings' && <StandingsTab t={t} matches={matches} />}
      {tab === 'judges' && organizer && <JudgesTab t={t} matches={matches} />}
    </Screen>
  );
}

function TabBar({ tabs, value, onChange }: { tabs: { id: Tab; label: string }[]; value: Tab; onChange: (t: Tab) => void }) {
  const c = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {tabs.map((x) => {
        const on = x.id === value;
        return (
          <Pressable key={x.id} onPress={() => onChange(x.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceAlt }}>
            <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600' }}>{x.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ResultsControls({ t }: { t: Tournament }) {
  const { save, me } = useStore();
  const [confirm, setConfirm] = useState(false);
  if (isLocked(t, todayLocal()))
    return (
      <Card>
        <Label>Final and locked</Label>
        <Body>
          {t.finalizedAt ? `You finalized this competition on ${fmtDateTime(t.finalizedAt)}.` : `This competition locked automatically ${AUTO_LOCK_DAYS} days after its last day.`} Teams,
          pairings, ballots, and results can no longer be changed by anyone. It is kept in the archive.
        </Body>
      </Card>
    );
  return (
    <Card>
      <Label>Results</Label>
      {t.resultsPublished ? (
        <>
          <Body>Results are public. Standings count toward the season rankings.</Body>
          <Button
            small
            kind="secondary"
            title={t.ballotsReturned ? 'Stop returning ballots to teams' : 'Return ballots to teams'}
            onPress={() => save('tournaments', { ...t, ballotsReturned: !t.ballotsReturned })}
          />
          <Body muted>{t.ballotsReturned ? 'Each team can see the score sheets from its own trials.' : 'Teams see standings and win/loss, but not individual score sheets.'}</Body>
          <Button small kind="ghost" title="Unpublish results" onPress={() => save('tournaments', { ...t, resultsPublished: false, ballotsReturned: false })} />
          <Label style={{ marginTop: space.sm }}>Finalize</Label>
          <Body muted>
            Finalizing locks everything permanently, for you too. If you don't, it locks on its own on {fmtDate(autoLockDate(t))}.
          </Body>
          {confirm ? (
            <Row>
              <Button small kind="danger" title="Yes, lock it for good" onPress={() => save('tournaments', { ...t, finalizedAt: nowLocal(), status: 'final' })} />
              <Button small kind="ghost" title="Not yet" onPress={() => setConfirm(false)} />
            </Row>
          ) : (
            <Button small kind="secondary" title="Finalize results" onPress={() => setConfirm(true)} />
          )}
        </>
      ) : (
        <>
          <Body muted>Only you can see scores and standings. Judges see only their own ballots.</Body>
          <Button
            title="Publish results"
            onPress={async () => {
              await save('tournaments', { ...t, resultsPublished: true, status: t.endDate < nowLocal().slice(0, 10) ? 'final' : t.status });
              await save('bulletins', {
                id: newId('b'), level: t.level, tournamentId: t.id, caseId: null, kind: 'results',
                title: `${t.name}: results posted`, body: 'Final standings are in the app.', postedAt: nowLocal(), postedBy: me?.id ?? '',
              });
            }}
          />
        </>
      )}
    </Card>
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

function PairingsTab({ t, matches }: { t: Tournament; matches: Match[] }) {
  const { data, me } = useStore();
  if (!data) return null;
  const organizer = isOrganizer(t, me);
  const editable = canChange(t, me, todayLocal());
  const showResult = resultsVisible(t, me);
  const cs = data.cases.find((c) => c.id === t.caseId);
  const rounds = [...new Set(matches.map((m) => m.round))];
  const nextRound = rounds.length ? Math.max(...rounds) + 1 : 1;
  const approved = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').length;
  return (
    <>
      {editable && nextRound <= t.prelimRounds && approved >= 2 && (
        <Button title={`Pair Round ${nextRound}${nextRound <= t.randomRounds ? ' (random draw)' : ''}`} onPress={() => router.push(`/tournament/pair?id=${t.id}&round=${nextRound}`)} />
      )}
      {rounds.length === 0 ? (
        <Empty title="No rounds posted yet" body="Pairings, courtrooms, sides, and start times appear here as soon as the organizer posts them." />
      ) : (
        rounds.map((round) => (
          <View key={round} style={{ gap: space.sm }}>
            <Label>Round {round}</Label>
            {matches
              .filter((m) => m.round === round)
              .map((m) => {
                const r = resultFor(m.id, data.ballots);
                const ballotsIn = data.ballots.filter((b) => b.matchId === m.id).length;
                const mine = !!me && m.judgeIds.includes(me.id);
                return (
                  <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Body muted style={{ fontSize: 13 }}>
                        {m.courtroom} · {fmtTime(m.startsAt)}
                      </Body>
                      {organizer ? (
                        <Pill text={`${ballotsIn}/${t.ballotsPerRound} ballots · ${m.judgeIds.length} judges`} tone={ballotsIn >= t.ballotsPerRound ? 'good' : 'warn'} />
                      ) : mine ? (
                        <Pill text="You're judging" tone="accent" />
                      ) : null}
                    </Row>
                    <MatchLine side="p" kind={cs?.kind} name={teamName(data.teams, m.pTeamId)} ballots={showResult && r.winner ? r.pBallots : null} won={showResult && r.winner === 'p'} />
                    <MatchLine side="d" kind={cs?.kind} name={teamName(data.teams, m.dTeamId)} ballots={showResult && r.winner ? r.dBallots : null} won={showResult && r.winner === 'd'} />
                  </Card>
                );
              })}
          </View>
        ))
      )}
    </>
  );
}

/** Every competing team, with its side, opponent, and courtroom in each round. */
function GridTab({ t, matches }: { t: Tournament; matches: Match[] }) {
  const { data, me } = useStore();
  const c = useTheme();
  if (!data) return null;
  const showResult = resultsVisible(t, me);
  const cs = data.cases.find((x) => x.id === t.caseId);
  const teamIds = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').map((r) => r.teamId);
  if (teamIds.length === 0) return <Empty title="No confirmed teams yet" body="Each team's rounds, sides, and opponents appear here once teams are confirmed and rounds are paired." />;
  const rounds = Array.from({ length: t.prelimRounds }, (_, i) => i + 1);
  const sorted = [...teamIds].sort((a, b) => teamName(data.teams, a).localeCompare(teamName(data.teams, b)));
  const mineFirst = me ? [...sorted.filter((x) => me.teamIds.includes(x)), ...sorted.filter((x) => !me.teamIds.includes(x))] : sorted;
  return (
    <>
      <Body muted>{teamIds.length} teams competing. Your teams are listed first.</Body>
      {mineFirst.map((tid) => {
        const team = data.teams.find((x) => x.id === tid);
        const program = data.programs.find((p) => p.id === team?.programId);
        return (
          <Card key={tid}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2>{team?.name ?? 'Unknown team'}</H2>
              {me?.teamIds.includes(tid) && <Pill text="Your team" tone="accent" />}
            </Row>
            <Body muted>{program?.name}</Body>
            {rounds.map((round) => {
              const m = matches.find((x) => x.round === round && (x.pTeamId === tid || x.dTeamId === tid));
              if (!m)
                return (
                  <Row key={round} style={{ flexWrap: 'nowrap', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 }}>
                    <Mono muted style={{ width: 28 }}>{`R${round}`}</Mono>
                    <Body muted>{matches.some((x) => x.round === round) ? 'Bye' : 'Not paired yet'}</Body>
                  </Row>
                );
              const side = m.pTeamId === tid ? 'p' : 'd';
              const opp = side === 'p' ? m.dTeamId : m.pTeamId;
              const r = resultFor(m.id, data.ballots);
              const outcome = showResult && r.winner ? (r.winner === 'tie' ? 'T' : r.winner === side ? 'W' : 'L') : null;
              return (
                <Pressable key={round} onPress={() => router.push(`/match/${m.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: 1, borderTopColor: c.line, paddingTop: 6 }}>
                  <Mono muted style={{ width: 28 }}>{`R${round}`}</Mono>
                  <SideTag side={side} kind={cs?.kind} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body numberOfLines={1}>vs {teamName(data.teams, opp)}</Body>
                    <Body muted style={{ fontSize: 12 }}>
                      {m.courtroom} · {fmtDate(m.startsAt)} {fmtTime(m.startsAt)}
                    </Body>
                  </View>
                  {outcome && <Text style={{ fontWeight: '800', color: outcome === 'W' ? c.good : outcome === 'L' ? c.bad : c.muted }}>{outcome}</Text>}
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </>
  );
}

function StandingsTab({ t, matches }: { t: Tournament; matches: Match[] }) {
  const { data, me } = useStore();
  if (!data) return null;
  const s = computeStandings(matches, data.ballots, t.rankBy ?? 'ballots');
  const scored = matches.filter((m) => data.ballots.some((b) => b.matchId === m.id));
  const lastRound = scored.reduce((a, m) => Math.max(a, m.round), 0);
  const inRound = data.ballots.filter((b) => matches.some((m) => m.id === b.matchId && m.round === lastRound)).length;
  const dueRound = matches.filter((m) => m.round === lastRound).length * t.ballotsPerRound;
  return (
    <>
      {isOrganizer(t, me) && !t.resultsPublished && <Body muted>Only you can see these standings until you publish results from the Overview tab.</Body>}
      {s.length > 0 && (
        <Row>
          {!t.resultsPublished && <Pill text="Live" tone="good" />}
          <Body muted style={{ flex: 1 }}>
            {`Ranked by ${(t.rankBy ?? 'ballots') === 'ballots' ? 'ballots won' : 'trials won'} · Round ${lastRound}: ${inRound} of ${dueRound} ballots in`}
          </Body>
        </Row>
      )}
      {s.length === 0 ? (
        <Empty title="No scores yet" body="Standings fill in as ballots come in." />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <StandingsTable standings={s} teams={data.teams} onTeam={(tid) => router.push(`/team/${tid}`)} />
        </Card>
      )}
    </>
  );
}

function TeamsTab({ t, regs, organizer }: { t: Tournament; regs: Registration[]; organizer: boolean }) {
  const { data, save } = useStore();
  if (!data) return null;
  const invitational = t.entryType === 'invitational';
  const order: RegistrationStatus[] = ['pending', 'approved', 'waitlisted', 'declined'];
  const visible = organizer ? regs : regs.filter((r) => r.status === 'approved');
  if (visible.length === 0)
    return <Empty title="No teams yet" body={invitational ? 'Invited teams appear here.' : 'Teams appear here once they register and the organizer confirms them.'} />;
  return (
    <>
      {order.map((st) => {
        const group = visible.filter((r) => r.status === st);
        if (group.length === 0) return null;
        return (
          <View key={st} style={{ gap: space.sm }}>
            <Label>
              {regLabel(st, invitational)} · {group.length}
            </Label>
            {group.map((r) => {
              const team = data.teams.find((x) => x.id === r.teamId);
              const program = data.programs.find((p) => p.id === team?.programId);
              return (
                <Card key={r.id}>
                  <H2>{team?.name ?? 'Unknown team'}</H2>
                  <Body muted>{program?.name}</Body>
                  {organizer && (
                    <>
                      {r.note ? <Body>“{r.note}”</Body> : null}
                      <Body muted>
                        {r.contactName} · {r.contactEmail}
                      </Body>
                      {!isLocked(t, todayLocal()) && <Row>
                        {r.status !== 'approved' && <Button small title={invitational ? 'Invite' : 'Confirm'} onPress={() => save('registrations', { ...r, status: 'approved' })} />}
                        {r.status !== 'waitlisted' && <Button small kind="secondary" title={invitational ? 'Alternate' : 'Waitlist'} onPress={() => save('registrations', { ...r, status: 'waitlisted' })} />}
                        {r.status !== 'declined' && <Button small kind="ghost" title="Decline" onPress={() => save('registrations', { ...r, status: 'declined' })} />}
                      </Row>}
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

function JudgesTab({ t, matches }: { t: Tournament; matches: Match[] }) {
  const { data, save } = useStore();
  if (!data) return null;
  const signups = data.judgeSignups.filter((j) => j.tournamentId === t.id);
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return (
    <>
      {rounds.length > 0 && <Label>Coverage</Label>}
      {rounds.map((round) => {
        const rm = matches.filter((m) => m.round === round);
        const need = rm.length * t.ballotsPerRound;
        const have = rm.reduce((n, m) => n + Math.min(m.judgeIds.length, t.ballotsPerRound), 0);
        return (
          <Card key={round} style={{ paddingVertical: space.md }}>
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Body style={{ fontWeight: '600' }}>Round {round}</Body>
              <Pill text={`${have} of ${need} seats filled`} tone={have >= need ? 'good' : 'warn'} />
            </Row>
            {have < need && !isLocked(t, todayLocal()) && (
              <Button
                small
                kind="secondary"
                title="Fill open seats automatically"
                onPress={async () => {
                  for (const m of autoAssign(round, t, data)) await save('matches', m);
                }}
              />
            )}
          </Card>
        );
      })}
      <JudgeList title="Waiting for your OK" list={signups.filter((j) => j.status === 'pending')} data={data} />
      <JudgeList title="Confirmed judges" list={signups.filter((j) => j.status === 'approved')} data={data} />
      <JudgeList title="Declined" list={signups.filter((j) => j.status === 'declined')} data={data} />
      {signups.length === 0 && <Empty title="No judges yet" body="Judges volunteer from this competition's page. Share it with your attorney and alumni network." />}
    </>
  );

  function JudgeList({ title, list, data }: { title: string; list: typeof signups; data: AppData }) {
    if (list.length === 0) return null;
    return (
      <View style={{ gap: space.sm }}>
        <Label style={{ marginTop: space.sm }}>
          {title} · {list.length}
        </Label>
        {list.map((j) => {
          const assigned = data.matches.filter((m) => m.tournamentId === t.id && m.judgeIds.includes(j.userId)).length;
          return (
            <Card key={j.id}>
              <H2>{j.name}</H2>
              <Body muted>
                {BACKGROUND_LABEL[j.background]} · available Round{j.rounds.length === 1 ? '' : 's'} {j.rounds.join(', ')}
                {assigned ? ` · ${assigned} trial${assigned === 1 ? '' : 's'} assigned` : ''}
              </Body>
              {j.conflicts ? <Body muted>Conflicts: {j.conflicts}</Body> : null}
              {!isLocked(t, todayLocal()) && <Row>
                {j.status !== 'approved' && <Button small title="Confirm" onPress={() => save('judgeSignups', { ...j, status: 'approved' })} />}
                {j.status !== 'declined' && <Button small kind="ghost" title="Decline" onPress={() => save('judgeSignups', { ...j, status: 'declined' })} />}
              </Row>}
            </Card>
          );
        })}
      </View>
    );
  }
}

function RulesCard({ rules, custom }: { rules: RuleSet; custom: string }) {
  const groups = describeRules(rules);
  const extra = custom.split('\n').map((l) => l.trim()).filter(Boolean);
  if (groups.length === 0 && extra.length === 0) return null;
  return (
    <Card>
      <H2>Competition rules</H2>
      {groups.map((g) => (
        <View key={g.group} style={{ gap: 2, marginTop: space.xs }}>
          <Label>{g.group}</Label>
          {g.lines.map((l) => (
            <Body key={l}>• {l}</Body>
          ))}
        </View>
      ))}
      {extra.length > 0 && (
        <View style={{ gap: 2, marginTop: space.xs }}>
          <Label>Also</Label>
          {extra.map((l, i) => (
            <Body key={i}>• {l}</Body>
          ))}
        </View>
      )}
    </Card>
  );
}

function sheetSummary(scoring: ScoringSetup) {
  const parts = SHEET_PARTS.filter((p) => scoring.parts.includes(p.id)).map((p) => p.label);
  return [...parts, ...scoring.extra].join(', ');
}
