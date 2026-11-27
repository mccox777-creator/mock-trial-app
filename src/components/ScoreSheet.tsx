import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import type { BallotReading } from '../lib/backend';
import { Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Field, H2, Label, Row, Segmented, SideTag } from './ui';
import { SHEET_MAX, SHEET_MIN, sheetLines } from '../lib/judging';
import type { Ballot, CaseKind, ScoreSheet } from '../lib/types';
import { radius, space, useTheme } from '../lib/theme';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/**
 * Ballot entry. Judges always score line by line; the organizer typing in a paper
 * ballot may also enter just the two totals.
 */
export function BallotForm({
  title,
  witnesses,
  kind,
  initial,
  allowTotals,
  defaultJudge,
  askJudgeName,
  onSubmit,
  onCancel,
  onScan,
}: {
  title: string;
  witnesses: number;
  kind?: CaseKind;
  initial?: Ballot;
  allowTotals: boolean;
  defaultJudge: string;
  askJudgeName: boolean;
  onSubmit: (b: { judge: string; sheet: ScoreSheet | null; pScore: number; dScore: number }) => Promise<void>;
  onCancel?: () => void;
  /** Organizer only: read a photographed paper ballot into the form. */
  onScan?: (imageBase64: string, mediaType: string, lines: string[]) => Promise<BallotReading>;
}) {
  const c = useTheme();
  const lines = sheetLines(witnesses);
  const [mode, setMode] = useState<'lines' | 'totals'>(initial && !initial.sheet ? 'totals' : 'lines');
  const [judge, setJudge] = useState(initial?.judge ?? defaultJudge);
  const [p, setP] = useState<string[]>(() => lines.map((_, i) => (initial?.sheet ? String(initial.sheet.p[i] ?? '') : '')));
  const [d, setD] = useState<string[]>(() => lines.map((_, i) => (initial?.sheet ? String(initial.sheet.d[i] ?? '') : '')));
  const [pt, setPt] = useState(initial && !initial.sheet ? String(initial.pScore) : '');
  const [dt, setDt] = useState(initial && !initial.sheet ? String(initial.dScore) : '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<{ state: 'idle' | 'reading' | 'done'; notes: string[] }>({ state: 'idle', notes: [] });
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  async function scanBallot(fromCamera: boolean) {
    if (!onScan) return;
    setErr(null);
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], base64: true, quality: 0.7 };
    let res: ImagePicker.ImagePickerResult;
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setErr('Camera access is off. Choose a photo from your library instead, or allow the camera in Settings.');
        res = await ImagePicker.launchCameraAsync(opts);
      } else {
        res = await ImagePicker.launchImageLibraryAsync(opts);
      }
    } catch {
      return setErr('Could not open the camera or photo library on this device.');
    }
    if (res.canceled || !res.assets[0]?.base64) return;
    setScan({ state: 'reading', notes: [] });
    try {
      const r = await onScan(res.assets[0].base64, res.assets[0].mimeType ?? 'image/jpeg', lines);
      const fill = (xs: (number | null)[]) => lines.map((_, i) => (xs[i] == null ? '' : String(xs[i])));
      const np = fill(r.plaintiff_scores);
      const nd = fill(r.defense_scores);
      setMode('lines');
      setP(np);
      setD(nd);
      if (r.judge_name && askJudgeName) setJudge(r.judge_name);
      const flags = new Set<string>();
      lines.forEach((_, i) => {
        if (!np[i]) flags.add(`p${i}`);
        if (!nd[i]) flags.add(`d${i}`);
      });
      setFlagged(flags);
      const notes: string[] = [];
      const ps = sum(np.map(Number).filter(Number.isFinite));
      const ds = sum(nd.map(Number).filter(Number.isFinite));
      if (r.plaintiff_total_written != null && r.plaintiff_total_written !== ps) notes.push(`The judge wrote a plaintiff total of ${r.plaintiff_total_written}, but the lines add up to ${ps}.`);
      if (r.defense_total_written != null && r.defense_total_written !== ds) notes.push(`The judge wrote a defense total of ${r.defense_total_written}, but the lines add up to ${ds}.`);
      if (flags.size) notes.push(`${flags.size} score${flags.size === 1 ? '' : 's'} could not be read. They are highlighted below.`);
      if (r.unreadable_notes) notes.push(r.unreadable_notes);
      setScan({ state: 'done', notes });
    } catch (e) {
      setScan({ state: 'idle', notes: [] });
      setErr(e instanceof Error ? e.message : 'Could not read the photo. Enter the ballot by hand.');
    }
  }

  const nums = (xs: string[]) => xs.map((x) => Number(x));
  const okLine = (x: string) => x.trim() !== '' && Number.isInteger(Number(x)) && Number(x) >= SHEET_MIN && Number(x) <= SHEET_MAX;
  const pTotal = sum(nums(p).filter((n) => Number.isFinite(n)));
  const dTotal = sum(nums(d).filter((n) => Number.isFinite(n)));
  const pLabel = kind === 'criminal' ? 'Prosecution' : 'Plaintiff';

  async function submit() {
    setErr(null);
    if (askJudgeName && !judge.trim()) return setErr('Add the judge\'s name or a ballot label.');
    let out: { judge: string; sheet: ScoreSheet | null; pScore: number; dScore: number };
    if (mode === 'lines') {
      const bad = lines.findIndex((_, i) => !okLine(p[i]) || !okLine(d[i]));
      if (bad !== -1) return setErr(`${lines[bad]}: score both sides from ${SHEET_MIN} to ${SHEET_MAX}.`);
      out = { judge: judge.trim(), sheet: { p: nums(p), d: nums(d) }, pScore: pTotal, dScore: dTotal };
    } else {
      const a = Number(pt);
      const b = Number(dt);
      if (pt.trim() === '' || dt.trim() === '' || !(a >= 0) || !(b >= 0)) return setErr('Enter both totals.');
      out = { judge: judge.trim(), sheet: null, pScore: a, dScore: b };
    }
    if (out.pScore === out.dScore && mode === 'lines') return setErr('The totals are tied. Most competitions require a winner on every ballot; adjust a line to break the tie.');
    setBusy(true);
    try {
      await onSubmit(out);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save the ballot.');
    }
    setBusy(false);
  }

  const cell = { width: 52, borderWidth: 1, borderColor: c.line, borderRadius: radius.sm, paddingVertical: 8, textAlign: 'center' as const, fontSize: 16, color: c.ink, backgroundColor: c.surface };

  return (
    <Card>
      <H2>{title}</H2>
      {askJudgeName && <Field label="Judge or ballot label" value={judge} onChangeText={setJudge} placeholder="Ballot 1, or the judge's name" />}
      {onScan && (
        <View style={{ gap: space.sm }}>
          <Row>
            <Button small kind="secondary" title="Scan with camera" onPress={() => scanBallot(true)} disabled={scan.state === 'reading'} />
            <Button small kind="ghost" title="Choose a photo" onPress={() => scanBallot(false)} disabled={scan.state === 'reading'} />
          </Row>
          {scan.state === 'reading' && <Body muted>Reading the ballot…</Body>}
          {scan.state === 'done' && (
            <View style={{ gap: 4, padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt }}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>Check every line against the paper ballot, then submit.</Text>
              {scan.notes.map((n) => (
                <Text key={n} style={{ color: c.warn }}>
                  {n}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}
      {allowTotals && <Segmented value={mode} onChange={setMode} options={[{ id: 'lines', label: 'Line by line' }, { id: 'totals', label: 'Totals only' }]} />}

      {mode === 'lines' ? (
        <View style={{ gap: 2 }}>
          <Row style={{ flexWrap: 'nowrap', paddingVertical: 6 }}>
            <Label style={{ flex: 1 }}>{`Score each line ${SHEET_MIN}–${SHEET_MAX}`}</Label>
            <View style={{ width: 52, alignItems: 'center' }}>
              <SideTag side="p" kind={kind} />
            </View>
            <View style={{ width: 52, alignItems: 'center' }}>
              <SideTag side="d" kind={kind} />
            </View>
          </Row>
          {lines.map((line, i) => (
            <Row key={line} style={{ flexWrap: 'nowrap', paddingVertical: 4, borderTopWidth: 1, borderTopColor: c.line }}>
              <Text style={{ flex: 1, color: c.ink, fontSize: 14 }}>{line}</Text>
              <TextInput accessibilityLabel={`${pLabel}, ${line}`} style={[cell, flagged.has(`p${i}`) && { borderColor: c.warn, borderWidth: 2 }]} value={p[i]} keyboardType="number-pad" maxLength={2} onChangeText={(v) => setP((x) => x.map((y, j) => (j === i ? v : y)))} />
              <TextInput accessibilityLabel={`Defense, ${line}`} style={[cell, flagged.has(`d${i}`) && { borderColor: c.warn, borderWidth: 2 }]} value={d[i]} keyboardType="number-pad" maxLength={2} onChangeText={(v) => setD((x) => x.map((y, j) => (j === i ? v : y)))} />
            </Row>
          ))}
          <Row style={{ flexWrap: 'nowrap', paddingVertical: 8, borderTopWidth: 2, borderTopColor: c.ink }}>
            <Text style={{ flex: 1, color: c.ink, fontWeight: '800' }}>Total</Text>
            <Text style={{ width: 52, textAlign: 'center', fontWeight: '800', color: c.ink, fontVariant: ['tabular-nums'] }}>{pTotal}</Text>
            <Text style={{ width: 52, textAlign: 'center', fontWeight: '800', color: c.ink, fontVariant: ['tabular-nums'] }}>{dTotal}</Text>
          </Row>
        </View>
      ) : (
        <Row style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field label={`${pLabel} total`} value={pt} onChangeText={setPt} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Defense total" value={dt} onChangeText={setDt} keyboardType="number-pad" />
          </View>
        </Row>
      )}

      {err && <Body style={{ color: c.bad }}>{err}</Body>}
      <View style={{ gap: space.sm }}>
        <Button title={initial ? 'Save changes' : 'Submit ballot'} onPress={submit} disabled={busy} />
        {onCancel && <Button title="Cancel" kind="ghost" onPress={onCancel} />}
      </View>
    </Card>
  );
}

/** Read-only view of one ballot, line by line when available. */
export function BallotView({ ballot, witnesses, kind }: { ballot: Ballot; witnesses: number; kind?: CaseKind }) {
  const c = useTheme();
  const lines = sheetLines(witnesses);
  const [open, setOpen] = useState(false);
  const winner = ballot.pScore > ballot.dScore ? (kind === 'criminal' ? 'Prosecution' : 'Plaintiff') : ballot.dScore > ballot.pScore ? 'Defense' : 'Tie';
  return (
    <Card style={{ paddingVertical: space.md }} onPress={ballot.sheet ? () => setOpen((o) => !o) : undefined}>
      <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{ballot.judge}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{ballot.source === 'paper' ? 'Paper ballot' : 'Scored in the app'}{ballot.sheet ? (open ? ' · tap to hide lines' : ' · tap for lines') : ''}</Text>
        </View>
        <Text style={{ color: c.ink, fontVariant: ['tabular-nums'], fontWeight: '700', marginHorizontal: space.sm }}>
          {ballot.pScore} – {ballot.dScore}
        </Text>
        <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{winner}</Text>
      </Row>
      {open &&
        ballot.sheet &&
        lines.map((line, i) => (
          <Row key={line} style={{ flexWrap: 'nowrap', borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 }}>
            <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>{line}</Text>
            <Text style={{ width: 36, textAlign: 'center', color: c.ink, fontVariant: ['tabular-nums'] }}>{ballot.sheet!.p[i]}</Text>
            <Text style={{ width: 36, textAlign: 'center', color: c.ink, fontVariant: ['tabular-nums'] }}>{ballot.sheet!.d[i]}</Text>
          </Row>
        ))}
    </Card>
  );
}
