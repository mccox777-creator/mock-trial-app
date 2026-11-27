import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Field, H2, Label, Loading, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { fmtDate, nowLocal } from '../../lib/format';
import type { Program, Registration, Team } from '../../lib/types';

export default function RegisterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, save } = useStore();
  const t = data?.tournaments.find((x) => x.id === id);
  const myTeams = data && me ? data.teams.filter((x) => me.teamIds.includes(x.id) && x.level === t?.level) : [];
  const [mode, setMode] = useState<'existing' | 'new'>(myTeams.length ? 'existing' : 'new');
  const [teamId, setTeamId] = useState(myTeams[0]?.id ?? '');
  const [school, setSchool] = useState('');
  const [teamLabel, setTeamLabel] = useState('');
  const [contactName, setContactName] = useState(me?.name ?? '');
  const [contactEmail, setContactEmail] = useState(me?.email ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <Loading />;
  if (!t) return <Screen><Body>Competition not found.</Body></Screen>;
  if (!me) return <Screen><Body>Sign in from the Me tab to register a team.</Body></Screen>;

  async function submit() {
    setErr(null);
    if (mode === 'new' && (!school.trim() || !teamLabel.trim())) return setErr('Enter both the school and the team name.');
    if (mode === 'existing' && !teamId) return setErr('Choose a team.');
    if (!contactName.trim() || !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) return setErr('Enter a contact name and a valid email address.');
    setBusy(true);
    try {
      let tid = teamId;
      if (mode === 'new') {
        let program = data!.programs.find((p) => p.name.toLowerCase() === school.trim().toLowerCase() && p.level === t!.level);
        if (!program) {
          program = { id: newId('prog'), name: school.trim(), level: t!.level, region: '' } satisfies Program;
          await save('programs', program);
        }
        const team: Team = { id: newId('team'), programId: program.id, name: teamLabel.trim(), level: t!.level };
        await save('teams', team);
        tid = team.id;
      }
      if (data!.registrations.some((r) => r.tournamentId === t!.id && r.teamId === tid && r.status !== 'declined')) {
        setBusy(false);
        return setErr('That team is already signed up for this competition.');
      }
      const filled = data!.registrations.filter((r) => r.tournamentId === t!.id && r.status === 'approved').length;
      const status: Registration['status'] = filled >= t!.teamCap ? 'waitlisted' : t!.requireApproval ? 'pending' : 'approved';
      await save('registrations', {
        id: newId('reg'), tournamentId: t!.id, teamId: tid, status, contactName: contactName.trim(), contactEmail: contactEmail.trim(),
        submittedBy: me!.id, createdAt: nowLocal(),
      });
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Label>Registering for</Label>
        <H2>{t.name}</H2>
        <Body muted>
          Closes {fmtDate(t.registrationDeadline)} · ${t.entryFee} per team · {t.requireApproval ? 'the director confirms each team' : 'confirmed automatically'}
        </Body>
      </Card>

      {myTeams.length > 0 && (
        <Segmented value={mode} onChange={setMode} options={[{ id: 'existing', label: 'One of my teams' }, { id: 'new', label: 'A new team' }]} />
      )}

      {mode === 'existing' ? (
        <Segmented value={teamId} onChange={setTeamId} options={myTeams.map((x) => ({ id: x.id, label: x.name }))} />
      ) : (
        <>
          <Field label="School" value={school} onChangeText={setSchool} placeholder="Lakeshore School of Law" />
          <Field label="Team name" value={teamLabel} onChangeText={setTeamLabel} placeholder="Lakeshore A" />
        </>
      )}

      <Field label="Coach or contact name" value={contactName} onChangeText={setContactName} />
      <Field label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" hint="The director sees this. Other teams don't." />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button title="Submit registration" onPress={submit} disabled={busy} />
    </Screen>
  );
}
