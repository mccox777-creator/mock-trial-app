import { LEVELS } from '../../lib/types';
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
          {me.level && <Body muted>{`${LEVELS.find((l) => l.id === me.level)?.label} circuit. Ask a site admin if this needs to change.`}</Body>}
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
          {backend.kind === 'supabase' && <DeleteAccount />}
        </>
      ) : backend.kind === 'supabase' ? (
        <SignIn />
      ) : (
        <Body muted>You are signed out. You can still browse schedules, rankings, case files, and bulletins.</Body>
      )}
      <Button title="Help and support" kind="ghost" onPress={() => router.push('/support')} />
      <Button title="Privacy notice" kind="ghost" onPress={() => router.push('/privacy')} />
    </Screen>
  );
}

function DeleteAccount() {
  const { backend, refreshUser, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!backend.deleteAccount) return null;
  if (!open) return <Button title="Delete my account" kind="ghost" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <H2>Delete your account</H2>
      <Body muted>
        This permanently deletes your account, your profile, your team memberships, your notifications and your chat messages. It cannot be undone.
        Results, ballots you judged and teams' registrations stay so competitions keep their records, but without your name or email.
      </Body>
      <Field label='Type DELETE to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Row>
        <Button
          small
          kind="danger"
          title={busy ? 'Deleting…' : 'Delete my account'}
          disabled={busy || confirm.trim().toUpperCase() !== 'DELETE'}
          onPress={async () => {
            setBusy(true);
            setErr(null);
            try {
              await backend.deleteAccount!();
              await Promise.all([refreshUser(), refresh()]);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Could not delete the account. Try again.');
              setBusy(false);
            }
          }}
        />
        <Button small kind="ghost" title="Cancel" onPress={() => { setOpen(false); setConfirm(''); setErr(null); }} />
      </Row>
    </Card>
  );
}

function SignIn() {
  const { backend, refreshUser } = useStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (usePassword && backend.signInWithPassword) {
    return (
      <Card>
        <H2>Sign in with a password</H2>
        <Body muted>Only for accounts that were given a password. Everyone else signs in with an emailed code.</Body>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="password" />
        {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
        <Button
          title="Sign in"
          disabled={!email.trim() || !password}
          onPress={async () => {
            setErr(null);
            try {
              await backend.signInWithPassword!(email.trim(), password);
              await refreshUser();
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Sign-in failed. Check the email and password.');
            }
          }}
        />
        <Button title="Email me a code instead" kind="ghost" small onPress={() => { setUsePassword(false); setErr(null); }} />
      </Card>
    );
  }
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
      {backend.signInWithPassword && <Button title="I have a password" kind="ghost" small onPress={() => { setUsePassword(true); setErr(null); }} />}
    </Card>
  );
}
