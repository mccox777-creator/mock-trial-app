import { useState } from 'react';
import { router } from 'expo-router';
import { Body, Button, Card, Field, H1, H2, Label, Loading, Pill, Row, Screen, Segmented } from '../../components/ui';
import { useStore } from '../../lib/store';
import { regLabel } from '../../lib/labels';
import { fmtDateTime, fmtRange } from '../../lib/format';
import { teamName } from '../../lib/scoring';
import { DEMO_USERS } from '../../lib/sampleData';
import { OrganizerCard } from '../../components/Moderation';

export default function AccountScreen() {
  const { me, data, backend, switchDemoUser, refreshUser, refresh } = useStore();
  if (!data) return <Loading />;

  const myTeams = me ? data.teams.filter((t) => me.teamIds.includes(t.id)) : [];
  const myRegs = data.registrations.filter((r) => me && (r.submittedBy === me.id || me.teamIds.includes(r.teamId)));
  const directing = me ? data.tournaments.filter((t) => t.directorIds.includes(me.id)) : [];
  const myJudging = me ? data.judgeSignups.filter((j) => j.userId === me.id) : [];
  const myTrials = me ? data.matches.filter((m) => m.judgeIds.includes(me.id)).sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : [];
  const demoWho = me ? (Object.keys(DEMO_USERS) as (keyof typeof DEMO_USERS)[]).find((k) => DEMO_USERS[k].id === me.id) : undefined;

  return (
    <Screen>
      {backend.kind === 'demo' && switchDemoUser && (
        <Card>
          <Label>Demo mode</Label>
          <Body muted>This build runs on a fictional sample season stored on this device. Switch roles to see what each person sees.</Body>
          <Segmented
            value={demoWho ?? 'none'}
            options={[
              { id: 'director', label: 'Organizer' },
              { id: 'judge', label: 'Judge' },
              { id: 'coach', label: 'Coach' },
              { id: 'competitor', label: 'Student' },
              { id: 'none', label: 'Signed out' },
            ]}
            onChange={(v) => switchDemoUser(v === 'none' ? null : (v as keyof typeof DEMO_USERS))}
          />
          <Button title="Reset sample season" kind="ghost" small onPress={async () => { await backend.resetDemo?.(); await refresh(); }} />
        </Card>
      )}

      <Card onPress={() => router.push('/timer')}>
        <H2>Trial timer</H2>
        <Body muted>Two clocks, one per side, with time for each opening, exam and closing. Works without signal.</Body>
      </Card>

      {me ? (
        <>
          <H1>{me.name}</H1>
          <Body muted>{me.email}</Body>
          <Card onPress={() => router.push('/notifications')}>
            <H2>Notifications</H2>
            <Body muted>Your inbox, which circuits you follow, phone alerts and email, and whether you're willing to judge.</Body>
          </Card>

          <Label>Competitions you run</Label>
          <OrganizerCard />
          {directing.length === 0 ? (
            <Card>
              <Body muted>Directing a tournament? Create it here and teams can sign up in the app.</Body>
              <Button title="Create a competition" onPress={() => router.push('/tournament/new')} />
            </Card>
          ) : (
            directing.map((t) => (
              <Card key={t.id} onPress={() => router.push(`/tournament/${t.id}`)}>
                <H2>{t.name}</H2>
                <Body muted>{fmtRange(t.startDate, t.endDate)}</Body>
                <Row>
                  <Pill text={t.directorIds.includes(me.id) ? 'Director' : 'Tab staff'} tone="accent" />
                  {t.status === 'draft' && <Pill text="Draft" tone="warn" />}
                  {t.status !== 'draft' && t.approved === false && !t.hidden && <Pill text="Unlisted until approved" tone="warn" />}
                  {t.hidden && <Pill text="Taken down" tone="bad" />}
                  {data.registrations.some((r) => r.tournamentId === t.id && r.status === 'pending') && <Pill text="Sign-ups to review" tone="warn" />}
                </Row>
              </Card>
            ))
          )}

          {(myJudging.length > 0 || myTrials.length > 0) && <Label>Your judging</Label>}
          {myTrials.map((m) => {
            const t = data.tournaments.find((x) => x.id === m.tournamentId);
            const done = data.ballots.some((b) => b.matchId === m.id && b.judgeId === me.id);
            return (
              <Card key={m.id} onPress={() => router.push(`/match/${m.id}`)}>
                <H2>
                  {t?.name} · Round {m.round}
                </H2>
                <Body muted>
                  {m.courtroom} · {fmtDateTime(m.startsAt)}
                </Body>
                <Body>
                  {teamName(data.teams, m.pTeamId)} v. {teamName(data.teams, m.dTeamId)}
                </Body>
                <Pill text={done ? 'Ballot submitted' : 'Score this trial'} tone={done ? 'good' : 'warn'} />
              </Card>
            );
          })}
          {myJudging
            .filter((j) => !myTrials.some((m) => m.tournamentId === j.tournamentId))
            .map((j) => {
              const t = data.tournaments.find((x) => x.id === j.tournamentId);
              return (
                <Card key={j.id} onPress={t ? () => router.push(`/tournament/${t.id}`) : undefined}>
                  <H2>{t?.name ?? 'Competition'}</H2>
                  <Pill text={j.status === 'approved' ? 'Confirmed to judge · no trials assigned yet' : j.status === 'pending' ? 'Waiting for the organizer' : 'Not needed this time'} tone={j.status === 'approved' ? 'good' : 'warn'} />
                </Card>
              );
            })}

          {myTeams.length > 0 && <Label>Your teams</Label>}
          {myTeams.map((t) => (
            <Card key={t.id}>
              <H2>{t.name}</H2>
              <Body muted>{data.programs.find((p) => p.id === t.programId)?.name}</Body>
            </Card>
          ))}

          {myRegs.length > 0 && <Label>Your sign-ups</Label>}
          {myRegs.map((r) => {
            const inv = data.tournaments.find((x) => x.id === r.tournamentId)?.entryType === 'invitational';
            const t = data.tournaments.find((x) => x.id === r.tournamentId);
            const team = data.teams.find((x) => x.id === r.teamId);
            return (
              <Card key={r.id} onPress={t ? () => router.push(`/tournament/${t.id}`) : undefined}>
                <H2>{t?.name ?? 'Competition'}</H2>
                <Body muted>{team?.name}</Body>
                <Pill text={regLabel(r.status, inv)} tone={r.status === 'approved' ? 'good' : r.status === 'declined' || r.status === 'withdrawn' ? 'bad' : 'warn'} />
              </Card>
            );
          })}

          {backend.kind === 'supabase' && <Button title="Sign out" kind="ghost" onPress={async () => { await backend.signOut(); await refreshUser(); }} />}
        </>
      ) : backend.kind === 'supabase' ? (
        <SignIn />
      ) : (
        <Body muted>You are signed out. You can still browse schedules, rankings, case files, and bulletins.</Body>
      )}
      <Button title="Privacy notice" kind="ghost" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}

function SignIn() {
  const { backend, refreshUser } = useStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card>
      <H2>Sign in</H2>
      <Body muted>We email you a six-digit code. No password needed.</Body>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {sent && <Field label="Code from the email" value={code} onChangeText={setCode} keyboardType="number-pad" />}
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title={sent ? 'Sign in' : 'Email me a code'}
        onPress={async () => {
          setErr(null);
          try {
            if (!sent) {
              await backend.signIn(email.trim());
              setSent(true);
            } else {
              await backend.verifyCode?.(email.trim(), code.trim());
              await refreshUser();
            }
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Sign-in failed. Check the email address and try again.');
          }
        }}
      />
    </Card>
  );
}
