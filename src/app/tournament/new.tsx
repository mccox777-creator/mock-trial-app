import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Field, H1, H2, Label, Loading, Row, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { fmtDate, fmtRange, isValidDate, todayLocal } from '../../lib/format';
import { isLocked } from '../../lib/judging';
import { LEVELS, type Level, type Tournament } from '../../lib/types';
import { radius, space, useTheme } from '../../lib/theme';
import { CheckRow, RulesChecklist } from '../../components/RulesChecklist';
import { POWER_STYLES, SIDE_RULES, describePairing } from '../../lib/scoring';
import { ALL_RULES, describeRules } from '../../lib/rules';
import { MAX_EXTRA_LINES, ScoringSetupForm, parseExtraLines } from '../../components/ScoringSetupForm';
import { DEFAULT_SCORING, describeScoring, sheetLines } from '../../lib/judging';

const STEPS = ['Basics', 'Dates & venue', 'Format', 'Score sheet', 'Rules', 'Case', 'Registration', 'Review'] as const;

type Draft = { extraLines: string } & Omit<Tournament, 'id' | 'createdAt' | 'directorIds' | 'status' | 'resultsPublished' | 'ballotsReturned' | 'finalizedAt' | 'witnessesPerSide' | 'hostProgramId' | 'teamCap' | 'entryFee' | 'prelimRounds' | 'ballotsPerRound' | 'randomRounds'> & {
  randomRounds: string;
  witnessesPerSide: string;
  teamCap: string;
  entryFee: string;
  prelimRounds: string;
  ballotsPerRound: string;
};

export default function TournamentWizard() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, me, level, save } = useStore();
  const existing = id ? data?.tournaments.find((t) => t.id === id) : undefined;
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [d, setD] = useState<Draft>(() =>
    existing
      ? { ...existing, teamCap: String(existing.teamCap), entryFee: String(existing.entryFee), prelimRounds: String(existing.prelimRounds), ballotsPerRound: String(existing.ballotsPerRound), witnessesPerSide: String(existing.witnessesPerSide), randomRounds: String(existing.randomRounds), rankBy: existing.rankBy ?? 'ballots', powerStyle: existing.powerStyle ?? 'high_high', bracketed: existing.bracketed ?? false, avoidSameSchool: existing.avoidSameSchool ?? true, rules: existing.rules ?? {}, customRules: existing.customRules ?? '', scoring: existing.scoring ?? DEFAULT_SCORING, extraLines: (existing.scoring?.extra ?? []).join('\n') }
      : {
          level, name: '', hostName: '', city: '', venue: '', startDate: '', endDate: '', registrationDeadline: '',
          teamCap: '16', entryFee: '350', prelimRounds: '4', ballotsPerRound: '3', witnessesPerSide: '3', randomRounds: '1', sideConstraint: 'alternate', pairingMethod: 'power', powerStyle: 'high_high', bracketed: false, avoidSameSchool: true,
          entryType: 'open', requireApproval: true, caseId: null, description: '', rankBy: 'ballots', chatReplies: true, rules: {}, customRules: '', scoring: DEFAULT_SCORING, extraLines: '',
        },
  );
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  if (!data) return <Loading />;
  if (!me)
    return (
      <Screen>
        <H2>Sign in to create a competition</H2>
        <Body muted>Tournament directors need an account so teams know who is running the event.</Body>
        <Button title="Go to sign in" onPress={() => router.replace('/account')} />
      </Screen>
    );
  if (existing && (!existing.directorIds.includes(me.id) || isLocked(existing, todayLocal())))
    return (
      <Screen>
        <Body>Only this competition's organizer can edit it, and only until it is finalized.</Body>
      </Screen>
    );

  function validate(s: number) {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!d.name.trim()) e.name = 'Give the competition a name.';
      if (!d.hostName.trim()) e.hostName = 'Name the host school or organization.';
    }
    if (s === 1) {
      if (!isValidDate(d.startDate)) e.startDate = 'Use the format YYYY-MM-DD.';
      if (!isValidDate(d.endDate)) e.endDate = 'Use the format YYYY-MM-DD.';
      else if (isValidDate(d.startDate) && d.endDate < d.startDate) e.endDate = 'The last day must be on or after the first day.';
      if (!d.city.trim()) e.city = 'Add the city so teams can plan travel.';
    }
    if (s === 2) {
      const r = Number(d.prelimRounds);
      const b = Number(d.ballotsPerRound);
      if (!Number.isInteger(r) || r < 1 || r > 8) e.prelimRounds = 'Between 1 and 8 rounds.';
      if (!Number.isInteger(b) || b < 1 || b > 5) e.ballotsPerRound = 'Between 1 and 5 ballots.';
      const w = Number(d.witnessesPerSide);
      if (!Number.isInteger(w) || w < 1 || w > 5) e.witnessesPerSide = 'Between 1 and 5 witnesses.';
      const rr = Number(d.randomRounds);
      if (!Number.isInteger(rr) || rr < 1 || rr > 4) e.randomRounds = 'Between 1 and 4.';
      else if (Number.isInteger(r) && rr > r) e.randomRounds = 'Cannot be more than the number of rounds.';
    }
    if (s === 3) {
      const extra = parseExtraLines(d.extraLines);
      if (extra.length > MAX_EXTRA_LINES) e.scoring = `Up to ${MAX_EXTRA_LINES} lines of your own.`;
      else if (extra.some((l) => l.length > 60)) e.scoring = 'Keep each of your own lines under 60 characters.';
      const n = sheetLines(Number(d.witnessesPerSide) || 0, { ...d.scoring, extra }).length;
      if (n === 0) e.scoring = 'Tick at least one thing for judges to score.';
      else if (n > 40) e.scoring = 'That is more than 40 lines per side. Untick something or use fewer witnesses.';
    }
    if (s === 4) {
      for (const r of ALL_RULES) {
        if (!r.value || d.rules[r.id] !== true) continue;
        const v = d.rules[r.value.id];
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) e.rules = `Fill in "${r.value.label.toLowerCase()}" for ${r.label.toLowerCase()}, or untick it.`;
      }
    }
    if (s === 6) {
      if (!isValidDate(d.registrationDeadline)) e.registrationDeadline = 'Use the format YYYY-MM-DD.';
      else if (isValidDate(d.startDate) && d.registrationDeadline > d.startDate) e.registrationDeadline = 'Registration must close before the competition starts.';
      const cap = Number(d.teamCap);
      if (!Number.isInteger(cap) || cap < 2) e.teamCap = 'At least 2 teams.';
      if (d.entryFee.trim() && !(Number(d.entryFee) >= 0)) e.entryFee = 'Enter a dollar amount, or 0.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function finish(publish: boolean) {
    for (let s = 0; s < STEPS.length - 1; s++)
      if (!validate(s)) {
        setStep(s);
        return;
      }
    setBusy(true);
    const t: Tournament = {
      ...(existing ?? { id: newId('t'), createdAt: new Date().toISOString(), directorIds: [me!.id], hostProgramId: null, status: 'draft' as const, resultsPublished: false, ballotsReturned: false, finalizedAt: null }),
      ...withoutDraftFields(d),
      scoring: { ...d.scoring, extra: parseExtraLines(d.extraLines) },
      name: d.name.trim(),
      customRules: d.customRules.trim(),
      teamCap: Number(d.teamCap),
      entryFee: Number(d.entryFee || 0),
      prelimRounds: Number(d.prelimRounds),
      ballotsPerRound: Number(d.ballotsPerRound),
      witnessesPerSide: Number(d.witnessesPerSide),
      randomRounds: Number(d.randomRounds),
      status: publish ? (existing && existing.status !== 'draft' ? existing.status : 'registration_open') : existing?.status ?? 'draft',
    };
    try {
      await save('tournaments', t);
      router.replace(`/tournament/${t.id}`);
    } catch (e) {
      setErrors({ save: e instanceof Error ? e.message : 'Could not save. Check your connection and try again.' });
      setBusy(false);
    }
  }

  const cases = data.cases.filter((c) => c.level === d.level);
  const scoringLocked = !!existing && data.matches.some((m) => m.tournamentId === existing.id && data.ballots.some((b) => b.matchId === m.id));

  return (
    <Screen>
      <Progress step={step} />
      <H1>{STEPS[step]}</H1>

      {step === 0 && (
        <>
          <View style={{ gap: 6 }}>
            <Label>Circuit</Label>
            <Segmented<Level> value={d.level} onChange={(v) => set('level', v)} options={LEVELS.map((l) => ({ id: l.id, label: l.label }))} />
          </View>
          <Field label="Competition name" value={d.name} onChangeText={(v) => set('name', v)} placeholder="Winter Trial Classic" error={errors.name} />
          <Field label="Host school or organization" value={d.hostName} onChangeText={(v) => set('hostName', v)} placeholder="Pinecrest Law Center" error={errors.hostName} />
          <Field label="Description for teams (optional)" value={d.description} onChangeText={(v) => set('description', v)} multiline placeholder="Awards, team limits per school, anything teams should know." />
        </>
      )}

      {step === 1 && (
        <>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="First day" value={d.startDate} onChangeText={(v) => set('startDate', v)} placeholder="2027-01-22" error={errors.startDate} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Last day" value={d.endDate} onChangeText={(v) => set('endDate', v)} placeholder="2027-01-24" error={errors.endDate} />
            </View>
          </Row>
          <Field label="Venue" value={d.venue} onChangeText={(v) => set('venue', v)} placeholder="Pinecrest Justice Center" />
          <Field label="City" value={d.city} onChangeText={(v) => set('city', v)} placeholder="Pinecrest" error={errors.city} />
        </>
      )}

      {step === 2 && (
        <>
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="Preliminary rounds" value={d.prelimRounds} onChangeText={(v) => set('prelimRounds', v)} keyboardType="number-pad" error={errors.prelimRounds} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Ballots per round" value={d.ballotsPerRound} onChangeText={(v) => set('ballotsPerRound', v)} keyboardType="number-pad" error={errors.ballotsPerRound} />
            </View>
          </Row>
          <Field label="Witnesses per side" value={d.witnessesPerSide} onChangeText={(v) => set('witnessesPerSide', v)} keyboardType="number-pad" error={errors.witnessesPerSide} hint="Sets the lines on the judges' score sheet." />
          <View style={{ gap: 6 }}>
            <Label>How many opening rounds are drawn at random</Label>
            <Segmented value={d.randomRounds} onChange={(v) => set('randomRounds', v)} options={['1', '2', '3', '4'].map((n) => ({ id: n, label: n }))} />
            <Body muted>The app draws these rounds at random, avoiding rematches and keeping sides balanced.</Body>
          </View>
          <View style={{ gap: 6 }}>
            <Label>{`After Round ${d.randomRounds}`}</Label>
            <Segmented value={d.pairingMethod} onChange={(v) => set('pairingMethod', v)} options={[{ id: 'power', label: 'Power-match by record' }, { id: 'random', label: 'Keep drawing at random' }]} />
          </View>
          {d.pairingMethod === 'power' && (
            <>
              <View style={{ gap: 6 }}>
                <Label>Power-match style</Label>
                <Segmented value={d.powerStyle} onChange={(v) => set('powerStyle', v)} options={POWER_STYLES.map((s) => ({ id: s.id, label: s.label }))} />
                <Body muted>{POWER_STYLES.find((s) => s.id === d.powerStyle)!.body}</Body>
              </View>
              <CheckRow
                label="Pair within records first"
                help="Teams with the same record play each other first. When a record group is odd, one team moves down to the next group."
                on={d.bracketed}
                onToggle={() => set('bracketed', !d.bracketed)}
              />
            </>
          )}
          <CheckRow
            label="Keep teams from the same school apart"
            help="Two teams from one school never meet. Rematches are always avoided."
            on={d.avoidSameSchool}
            onToggle={() => set('avoidSameSchool', !d.avoidSameSchool)}
          />
          <View style={{ gap: 6 }}>
            <Label>Rank teams by</Label>
            <Segmented value={d.rankBy} onChange={(v) => set('rankBy', v)} options={[{ id: 'ballots', label: 'Ballots won' }, { id: 'wins', label: 'Trials won' }]} />
            <Body muted>Ties are broken by the other measure, then combined strength, then point differential. Rankings update as each ballot comes in.</Body>
          </View>
          <View style={{ gap: 6 }}>
            <Label>When teams switch sides</Label>
            <Segmented value={d.sideConstraint} onChange={(v) => set('sideConstraint', v)} options={SIDE_RULES.map((s) => ({ id: s.id, label: s.label }))} />
            <Body muted>{SIDE_RULES.find((s) => s.id === d.sideConstraint)!.body} When the straight power match breaks a rule, the team plays the nearest-ranked opponent that fits, and the pairing screen says why.</Body>
          </View>
        </>
      )}

      {step === 3 && (
        <>
          <Body muted>Set how judges score. Every judge sees the same sheet, and paper ballots are read against it.</Body>
          {scoringLocked ? (
            <Card>
              <Body>Ballots are already in, so the score sheet can't change. Otherwise earlier ballots would be on a different scale.</Body>
              <Body muted>{describeScoring(Number(d.witnessesPerSide) || 0, d.scoring)}</Body>
            </Card>
          ) : (
          <ScoringSetupForm
            scoring={d.scoring}
            extraText={d.extraLines}
            witnessesPerSide={Number(d.witnessesPerSide) || 0}
            onChange={(v) => set('scoring', v)}
            onExtraText={(v) => set('extraLines', v)}
            error={errors.scoring}
          />
          )}
        </>
      )}

      {step === 4 && (
        <>
          <Body muted>Tick the rules that apply. They appear on the competition page so teams, coaches, and judges all work from the same list.</Body>
          <RulesChecklist rules={d.rules} onChange={(v) => set('rules', v)} />
          <Field label="Other rules (optional)" value={d.customRules} onChangeText={(v) => set('customRules', v)} multiline placeholder="One per line. For example: no objections during opening statements." />
          {errors.rules && <Body style={{ color: '#B3261E' }}>{errors.rules}</Body>}
        </>
      )}

      {step === 5 && (
        <>
          <Body muted>Pick the case teams will try. You can also choose later, or release a new case from the Case Files tab.</Body>
          <Choice label="Decide later" on={d.caseId === null} onPress={() => set('caseId', null)} />
          {cases.map((c) => (
            <Choice key={c.id} label={c.title} sub={`${c.docket} · releases ${fmtDate(c.releaseAt.slice(0, 10))}`} on={d.caseId === c.id} onPress={() => set('caseId', c.id)} />
          ))}
        </>
      )}

      {step === 6 && (
        <>
          <Field label={d.entryType === 'invitational' ? 'Requests close' : 'Registration closes'} value={d.registrationDeadline} onChangeText={(v) => set('registrationDeadline', v)} placeholder="2026-12-18" error={errors.registrationDeadline} />
          <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Field label="Team limit" value={d.teamCap} onChangeText={(v) => set('teamCap', v)} keyboardType="number-pad" error={errors.teamCap} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="Entry fee (USD)" value={d.entryFee} onChangeText={(v) => set('entryFee', v)} keyboardType="decimal-pad" error={errors.entryFee} />
            </View>
          </Row>
          <View style={{ gap: 6 }}>
            <Label>Competition type</Label>
            <Segmented value={d.entryType} onChange={(v) => set('entryType', v)} options={[{ id: 'open', label: 'Open registration' }, { id: 'invitational', label: 'Invitational' }]} />
            <Body muted>
              {d.entryType === 'open'
                ? 'Any school can register its teams in the app.'
                : 'Schools send you a request with a short note. You choose who to invite, and invited teams are confirmed.'}
            </Body>
          </View>
          {d.entryType === 'open' && (
            <View style={{ gap: 6 }}>
              <Label>New sign-ups</Label>
              <Segmented value={d.requireApproval ? 'review' : 'auto'} onChange={(v) => set('requireApproval', v === 'review')} options={[{ id: 'review', label: 'I review each team' }, { id: 'auto', label: 'Confirm automatically' }]} />
              <Body muted>Teams past the limit go on a waitlist either way.</Body>
            </View>
          )}
        </>
      )}

      {step === 7 && (
        <Card>
          <H2>{d.name || 'Untitled competition'}</H2>
          <Body muted>{LEVELS.find((l) => l.id === d.level)!.label} · hosted by {d.hostName || '—'}</Body>
          <Body>{isValidDate(d.startDate) && isValidDate(d.endDate) ? fmtRange(d.startDate, d.endDate) : 'Dates not set'} · {[d.venue, d.city].filter(Boolean).join(', ')}</Body>
          <Body>
            {d.prelimRounds} rounds, {d.ballotsPerRound} ballots each · {describePairing({ ...(d as unknown as Tournament), randomRounds: Number(d.randomRounds) || 1 })}
          </Body>
          <Body>
            {(() => {
              const n = describeRules(d.rules).reduce((a, g) => a + g.lines.length, 0) + d.customRules.split('\n').filter((l) => l.trim()).length;
              return n === 0 ? 'No rules ticked' : `${n} rule${n === 1 ? '' : 's'} listed for teams`;
            })()}
          </Body>
          <Body>Score sheet: {describeScoring(Number(d.witnessesPerSide) || 0, { ...d.scoring, extra: parseExtraLines(d.extraLines) })}</Body>
          <Body>Case: {d.caseId ? data.cases.find((c) => c.id === d.caseId)?.title : 'decide later'}</Body>
          <Body>
            {d.entryType === 'invitational' ? 'Invitational' : 'Open registration'} · up to {d.teamCap} teams · ${d.entryFee || 0} · {d.entryType === 'invitational' ? 'requests close' : 'registration closes'} {isValidDate(d.registrationDeadline) ? fmtDate(d.registrationDeadline) : '—'}
          </Body>
          {errors.save && <Body style={{ color: '#B3261E' }}>{errors.save}</Body>}
        </Card>
      )}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        {step < STEPS.length - 1 ? (
          <Button title="Next" onPress={() => validate(step) && setStep(step + 1)} />
        ) : (
          <>
            <Button title={existing && existing.status !== 'draft' ? 'Save changes' : 'Publish and open registration'} disabled={busy} onPress={() => finish(true)} />
            {(!existing || existing.status === 'draft') && <Button title="Save as draft" kind="secondary" disabled={busy} onPress={() => finish(false)} />}
          </>
        )}
        {step > 0 && <Button title="Back" kind="ghost" onPress={() => setStep(step - 1)} />}
      </View>
    </Screen>
  );
}

function Progress({ step }: { step: number }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.accent : c.line }} />
        ))}
      </View>
      <Text style={{ color: c.muted, fontSize: 13 }}>
        Step {step + 1} of {STEPS.length}
      </Text>
    </View>
  );
}

function Choice({ label, sub, on, onPress }: { label: string; sub?: string; on: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} style={{ borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, borderRadius: radius.md, padding: space.md, backgroundColor: c.surface }}>
      <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{label}</Text>
      {sub && <Text style={{ color: c.muted, marginTop: 2 }}>{sub}</Text>}
    </Pressable>
  );
}

function withoutDraftFields(d: Draft) {
  const { extraLines: _extra, ...rest } = d;
  return rest;
}
