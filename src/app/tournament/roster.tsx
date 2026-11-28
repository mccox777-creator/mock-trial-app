import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Empty, H2, Label, Loading, Screen } from '../../components/ui';
import { RosterEditor, blankRow, draftsFrom, rosterProblem, saveRoster, type RosterDraft } from '../../components/Roster';
import { useStore } from '../../lib/store';
import { isLocked, isOrganizer } from '../../lib/judging';
import { todayLocal } from '../../lib/format';

/** Edit one team's roster for one competition: its coaches, the registrant, or the organizer. */
export default function RosterScreen() {
  const { reg } = useLocalSearchParams<{ reg: string }>();
  const { data, me, save, remove } = useStore();
  const r = data?.registrations.find((x) => x.id === reg);
  const t = data?.tournaments.find((x) => x.id === r?.tournamentId);
  const existing = data && r ? data.rosterEntries.filter((e) => e.registrationId === r.id) : [];
  const [rows, setRows] = useState<RosterDraft[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (rows || !data || !r || !t) return;
    setRows(existing.length ? draftsFrom(existing) : [blankRow('coach', t.level), blankRow('student', t.level)]);
  }, [data, r, t, rows, existing]);

  if (!data) return <Loading />;
  if (!r || !t) return <Screen><Empty title="Registration not found" body="It may have been removed." /></Screen>;
  const team = data.teams.find((x) => x.id === r.teamId);
  const allowed = !!me && (isOrganizer(t, me) || r.submittedBy === me.id || !!me.coachOf?.includes(r.teamId));
  if (!allowed) return <Screen><Empty title="Not your team" body="Only the team's coaches and the organizer can change this roster." /></Screen>;
  if (isLocked(t, todayLocal())) return <Screen><Empty title="Final and locked" body="This competition is locked, so its rosters can't change." /></Screen>;
  if (!rows) return <Loading />;

  async function submit() {
    setErr(null);
    const problem = rosterProblem(rows!, t!.level);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      await saveRoster(rows!, existing, { tournamentId: t!.id, registrationId: r!.id, teamId: r!.teamId }, (row) => save('rosterEntries', row), (id) => remove('rosterEntries', id));
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Label>Roster for</Label>
        <H2>{`${team?.name ?? 'Team'} · ${t.name}`}</H2>
        <Body muted>{t.level === 'law_school' ? 'Mark each student 2L, 3L or Other as of this competition.' : 'List the coaches and students on this team.'}</Body>
      </Card>
      <RosterEditor rows={rows} onChange={setRows} level={t.level} kind={data.cases.find((c) => c.id === t.caseId)?.kind} />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button title="Save roster" onPress={submit} disabled={busy} />
    </Screen>
  );
}
