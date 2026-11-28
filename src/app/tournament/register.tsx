import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Field, H2, Label, Loading, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { fmtDate, nowLocal } from '../../lib/format';
import type { Program, Registration, Team } from '../../lib/types';
import { RosterEditor, blankRow, rosterProblem, saveRoster, type RosterDraft } from '../../components/Roster';
import { lastRoster } from '../../lib/stats';

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
  const [note, setNote] = useState('');
  const invitational = t?.entryType === 'invitational';
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const level = t?.level ?? 'law_school';
  const [roster, setRoster] = useState<RosterDraft[]>([]);
  // Start from the team's last roster (class years may need a bump), or a blank one.
  useEffect(() => {
    if (!data) return;
    const prior = mode === 'existing' && teamId ? lastRoster(data, teamId) : [];
    setRoster(
      prior.length
        ? prior.map((e) => ({ ...blankRow(e.role, level), name: e.name, classYear: e.classYear, roles: e.roles ?? [] }))
        : [{ ...blankRow('coach', level), name: me?.coachOf?.length || mode === 'new' ? me?.name ?? '' : '' }, blankRow('student', level)],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, teamId, !!data]);

  if (!data) return <Loading />;
  if (!t) return <Screen><Body>Competition not found.</Body></Screen>;
  if (!me) return <Screen><Body>Sign in from the Me tab to register a team.</Body></Screen>;

  async function submit() {
    setErr(null);
    if (mode === 'new' && (!school.trim() || !teamLabel.trim())) return setErr('Enter both the school and the team name.');
    if (mode === 'existing' && !teamId) return setErr('Choose a team.');
    if (!contactName.trim() || !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) return setErr('Enter a contact name and a valid email address.');
    if (!roster.some((r) => r.role === 'coach' && r.name.trim())) return setErr('List at least one coach.');
    if (!roster.some((r) => r.role === 'student' && r.name.trim())) return setErr('List at least one student.');
    const problem = rosterProblem(roster, level);
    if (problem) return setErr(problem);
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
      const prior = data!.registrations.find((r) => r.tournamentId === t!.id && r.teamId === tid);
      if (prior) {
        setBusy(false);
        return setErr(prior.status === 'withdrawn' || prior.status === 'declined' ? 'That team has already entered and left this competition. Ask the organizer to put it back.' : 'That team is already signed up for this competition.');
      }
      if (t!.maxTeamsPerSchool) {
        const programOf = (teamId: string) => data!.teams.find((x) => x.id === teamId)?.programId;
        const mine = programOf(tid);
        const fromSchool = data!.registrations.filter((r) => r.tournamentId === t!.id && ['pending', 'approved', 'waitlisted'].includes(r.status) && programOf(r.teamId) === mine).length;
        if (mine && fromSchool >= t!.maxTeamsPerSchool) {
          setBusy(false);
          return setErr(`This competition takes at most ${t!.maxTeamsPerSchool} team${t!.maxTeamsPerSchool === 1 ? '' : 's'} per school.`);
        }
      }
      const filled = data!.registrations.filter((r) => r.tournamentId === t!.id && r.status === 'approved').length;
      const status: Registration['status'] = invitational ? 'pending' : filled >= t!.teamCap ? 'waitlisted' : t!.requireApproval ? 'pending' : 'approved';
      const regId = newId('reg');
      await save('registrations', {
        id: regId, tournamentId: t!.id, teamId: tid, status, contactName: contactName.trim(), contactEmail: contactEmail.trim(), note: note.trim() || undefined,
        submittedBy: me!.id, createdAt: nowLocal(),
      });
      await saveRoster(roster, [], { tournamentId: t!.id, registrationId: regId, teamId: tid }, (row) => save('rosterEntries', row), async () => {});
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Label>{invitational ? 'Requesting an invitation to' : 'Registering for'}</Label>
        <H2>{t.name}</H2>
        <Body muted>
          Closes {fmtDate(t.registrationDeadline)} · ${t.entryFee} per team · {invitational ? 'the organizer chooses which teams to invite' : t.requireApproval ? 'the organizer confirms each team' : 'confirmed automatically'}
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
      <Field label="Contact email" value={contactEmail} onChangeText={setContactEmail} keyboardType="email-address" autoCapitalize="none" hint="The organizer sees this. Other teams don't." />
      {invitational && (
        <Field label="Note to the organizer" value={note} onChangeText={setNote} multiline placeholder="Recent results, why you'd like to compete, anything that helps your request." />
      )}
      <Card>
        <Label>Roster</Label>
        <Body muted>
          {level === 'law_school' ? 'List your coaches and students. Mark each student 2L or 3L as of this competition, and the parts they play. ' : 'List your coaches and students, and the parts each student plays. '}
          You can change names until the competition locks. Rosters and awards become public with the results{level === 'high_school' ? ', except at high school competitions, where only the organizer and your team see them' : ''}.
        </Body>
        <RosterEditor rows={roster} onChange={setRoster} level={level} kind={data.cases.find((c) => c.id === t.caseId)?.kind} />
      </Card>
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button title={invitational ? 'Send request' : 'Submit registration'} onPress={submit} disabled={busy} />
    </Screen>
  );
}
