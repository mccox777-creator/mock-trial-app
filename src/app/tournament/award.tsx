import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Empty, Field, H2, Label, Loading, Row, Screen } from '../../components/ui';
import { Chips } from '../../components/Chips';
import { newId, useStore } from '../../lib/store';
import { canChange } from '../../lib/judging';
import { todayLocal } from '../../lib/format';
import { AWARD_KINDS, trialRoleLabel, type Award, type AwardKind } from '../../lib/types';
import { fitsAward } from '../../lib/stats';

const OTHER = '__other__';

/** The organizer gives (or edits) one individual award. */
export default function AwardScreen() {
  const { t: tid, id } = useLocalSearchParams<{ t: string; id?: string }>();
  const { data, me, save, remove } = useStore();
  const t = data?.tournaments.find((x) => x.id === tid);
  const prior = id ? data?.awards.find((a) => a.id === id) : undefined;
  const [kind, setKind] = useState<AwardKind>(prior?.kind ?? 'best_advocate');
  const [label, setLabel] = useState(prior?.label ?? '');
  const [place, setPlace] = useState(prior?.place ? String(prior.place) : '1');
  const [teamId, setTeamId] = useState<string | null>(prior?.teamId ?? null);
  const [pick, setPick] = useState<string | null>(prior ? prior.rosterEntryId ?? OTHER : null);
  const [typed, setTyped] = useState(prior && !prior.rosterEntryId ? prior.recipient : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <Loading />;
  if (!t) return <Screen><Empty title="Competition not found" body="It may have been removed." /></Screen>;
  if (!canChange(t, me, todayLocal())) return <Screen><Empty title="Organizers only" body="Only the organizer can give awards, until the competition locks." /></Screen>;

  const teamIds = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').map((r) => r.teamId);
  const teams = data.teams.filter((x) => teamIds.includes(x.id)).sort((a, b) => a.name.localeCompare(b.name));
  // Students whose parts fit the award (attorneys for advocacy awards, witnesses for best witness) come first.
  const students = (teamId ? data.rosterEntries.filter((e) => e.tournamentId === t.id && e.teamId === teamId && e.role === 'student') : [])
    .sort((x, y) => Number(fitsAward(kind, y.roles)) - Number(fitsAward(kind, x.roles)) || x.name.localeCompare(y.name));
  const caseKind = data.cases.find((c) => c.id === t.caseId)?.kind;

  async function submit() {
    setErr(null);
    const n = place.trim() ? Number(place) : null;
    if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 50)) return setErr('Place is a whole number from 1 to 50, or leave it blank.');
    if (kind === 'other' && !label.trim()) return setErr('Name the award.');
    if (!teamId) return setErr('Choose the team.');
    const entry = pick && pick !== OTHER ? students.find((s) => s.id === pick) : undefined;
    const recipient = entry?.name ?? typed.trim();
    if (!recipient) return setErr('Choose who won it, or type their name.');
    setBusy(true);
    try {
      const award: Award = { id: prior?.id ?? newId('aw'), tournamentId: t!.id, kind, label: label.trim(), place: n, teamId, recipient, rosterEntryId: entry?.id ?? null };
      await save('awards', award);
      router.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Label>{prior ? 'Edit award at' : 'New award at'}</Label>
        <H2>{t.name}</H2>
        <Body muted>{t.resultsPublished ? 'Results are public, so this shows right away.' : 'Awards stay private until you publish results.'}</Body>
      </Card>
      <Label>Award</Label>
      <Chips value={kind} onChange={setKind} options={AWARD_KINDS} />
      <Field label={kind === 'other' ? 'Award name' : 'Award name (optional)'} value={label} onChangeText={setLabel} placeholder={kind === 'other' ? 'Spirit of the Competition' : 'Leave blank to use the name above'} />
      <Field label="Place" value={place} onChangeText={setPlace} keyboardType="number-pad" hint="1 for the top award. Leave blank if it isn't ranked." />
      <Label>Team</Label>
      <Chips value={teamId} onChange={(v) => { setTeamId(v); setPick(null); }} options={teams.map((x) => ({ id: x.id, label: x.name }))} />
      {teamId && (
        <>
          <Label>Who won it</Label>
          {students.length === 0 && <Body muted>This team has no students on its roster yet. Type the name below.</Body>}
          <Chips value={pick} onChange={setPick} options={[...students.map((s) => ({ id: s.id, label: (s.roles ?? []).length ? `${s.name} · ${s.roles.map((r) => trialRoleLabel(r, caseKind)).join(', ')}` : s.name })), { id: OTHER, label: 'Someone else' }]} />
          {(pick === OTHER || students.length === 0) && <Field label="Name" value={typed} onChangeText={(v) => { setTyped(v); setPick(OTHER); }} autoCapitalize="words" />}
        </>
      )}
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Row>
        <Button title={prior ? 'Save award' : 'Give award'} onPress={submit} disabled={busy} />
        {prior && (
          <Button kind="ghost" title="Remove award" disabled={busy} onPress={async () => { setBusy(true); await remove('awards', prior.id); router.back(); }} />
        )}
      </Row>
    </Screen>
  );
}
