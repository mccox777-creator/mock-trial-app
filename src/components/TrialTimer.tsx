import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, Pressable, Text, Vibration, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Body, Button, Card, Field, H2, Label, Row } from './ui';
import { radius, space, useTheme } from '../lib/theme';
import {
  ACTS, ACT_TYPES, ALERTS, LIMIT_LABEL, adjust, breakdownText, curKey, fmtLeft, fmtUsed, groupMs, isRunning, parseTimer, pauseAll,
  resetClocks, segList, segMs, segName, selectType, selectWitness, toggle, usedMs, witList,
  type LimitGroup, type TimerSide, type TimerState,
} from '../lib/timer';

const SIDES: TimerSide[] = ['p', 'd'];
const KEEP_AWAKE_TAG = 'trial-timer';

/**
 * Two-clock trial timer. State is saved on the device under `storageKey`, so it survives the app closing,
 * the phone locking, or a dead battery, and it works with no signal.
 */
export function TrialTimer({ storageKey, base, title }: { storageKey: string; base: TimerState; title?: string }) {
  const c = useTheme();
  const [S, setS] = useState<TimerState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [panel, setPanel] = useState<'none' | 'breakdown' | 'settings' | 'reset'>('none');
  const [copied, setCopied] = useState(false);
  const lastRem = useRef<Record<TimerSide, number | null>>({ p: null, d: null });
  const [flash, setFlash] = useState<TimerSide | null>(null);
  const [focus, setFocus] = useState<TimerSide>('p');
  const wide = useWindowDimensions().width >= 760;

  // Load once.
  useEffect(() => {
    let live = true;
    AsyncStorage.getItem(storageKey)
      .then((raw) => live && setS(parseTimer(raw, base)))
      .catch(() => live && setS(base));
    return () => {
      live = false;
    };
    // base only seeds a brand-new timer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const update = useCallback(
    (fn: (s: TimerState, t: number) => TimerState) => {
      setS((prev) => {
        if (!prev) return prev;
        const t = Date.now();
        const next = fn(prev, t);
        if (next !== prev) AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
        setNow(t);
        return next;
      });
    },
    [storageKey],
  );

  const running = !!S && SIDES.some((k) => isRunning(S, k));

  // Tick while a clock runs; redraw when the app comes back to the front.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => st === 'active' && setNow(Date.now()));
    return () => sub.remove();
  }, []);

  // Keep the screen on while a clock runs.
  useEffect(() => {
    if (!running) return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  // Vibrate and flash at 5:00, 1:00 and 0:00 left.
  useEffect(() => {
    if (!S) return;
    for (const k of SIDES) {
      const rem = S.allotMin * 60000 - usedMs(S, k, now);
      const prev = lastRem.current[k];
      lastRem.current[k] = rem;
      if (prev == null || !isRunning(S, k)) continue;
      for (const th of ALERTS) {
        if (prev > th && rem <= th) {
          if (Platform.OS !== 'web') Vibration.vibrate(th === 0 ? [0, 300, 120, 300, 120, 300] : 200);
          setFlash(k);
          setTimeout(() => setFlash(null), 900);
        }
      }
    }
  }, [S, now]);

  // Keyboard shortcuts on a computer: P, D, Space.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'p' || e.key === 'P') { setFocus('p'); update((s, t) => toggle(s, 'p', t)); }
      else if (e.key === 'd' || e.key === 'D') { setFocus('d'); update((s, t) => toggle(s, 'd', t)); }
      else if (e.key === ' ') {
        e.preventDefault();
        update((s, t) => pauseAll(s, t));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [update]);

  if (!S) return null;
  const A = S.allotMin * 60000;
  const go = (k: TimerSide) => {
    if (!isRunning(S, k)) setFocus(k);
    update((s, t) => toggle(s, k, t));
  };

  return (
    <View style={{ gap: space.md }}>
      {!wide && (
        // Both clocks at a glance; tap one to start or pause it. The panel below shows the chosen side.
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          {SIDES.map((k) => {
            const run = isRunning(S, k);
            const rem = A - usedMs(S, k, now);
            const sideColor = k === 'p' ? c.plaintiff : c.defense;
            return (
              <Pressable
                key={k}
                onPress={() => setFocus(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected: focus === k }}
                style={{ flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface, borderWidth: focus === k ? 2 : 1, borderColor: focus === k ? sideColor : c.line, gap: 2 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sideColor }} />
                  <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>{S.labels[k]}</Text>
                </View>
                <Text style={{ color: rem < 0 ? c.bad : rem <= 5 * 60000 ? c.warn : c.ink, fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {rem < 0 ? `+${fmtUsed(-rem)}` : fmtLeft(rem)}
                </Text>
                <Text style={{ color: run ? c.good : c.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{run ? 'RUNNING' : 'TAP TO VIEW'}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <View style={wide ? { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' } : undefined}>
      {SIDES.filter((k) => wide || k === focus).map((k) => {
        const run = isRunning(S, k);
        const u = usedMs(S, k, now);
        const rem = A - u;
        const over = rem < 0;
        const warn = !over && rem <= 5 * 60000;
        const sideColor = k === 'p' ? c.plaintiff : c.defense;
        const tone = over ? c.bad : warn ? c.warn : c.ink;
        const cur = S.sides[k].cur;
        const wit = ACT_TYPES[cur.type].wit;
        return (
          <View
            key={k}
            accessibilityLabel={`${S.labels[k]} timer`}
            style={{
              flex: wide ? 1 : undefined,
              backgroundColor: flash === k ? (over ? c.bad : c.warn) + '33' : c.surface,
              borderRadius: radius.lg,
              borderWidth: run ? 3 : 1,
              borderColor: run ? sideColor : c.line,
              padding: space.lg,
              gap: space.sm,
            }}
          >
            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sideColor }} />
                <H2 numberOfLines={1} style={{ flex: 1 }}>{S.labels[k]}</H2>
              </View>
              <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, color: over ? c.bad : run ? c.good : c.muted }}>
                {over ? (run ? 'OVER TIME' : 'OVER') : run ? 'RUNNING' : u > 0 ? 'PAUSED' : 'READY'}
              </Text>
            </Row>

            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: c.muted, fontSize: 13 }}>{over ? 'Over time by' : 'Time remaining'}</Text>
              <Text accessibilityLiveRegion="polite" style={{ color: tone, fontSize: 64, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {over ? `+${fmtUsed(-rem)}` : fmtLeft(rem)}
              </Text>
              <View style={{ alignSelf: 'stretch', height: 6, backgroundColor: c.surfaceAlt, borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(100, (u / A) * 100)}%`, height: 6, backgroundColor: over ? c.bad : warn ? c.warn : sideColor }} />
              </View>
              <Row style={{ justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 4 }}>
                <Body muted>Used {fmtUsed(u)}</Body>
                <Body muted>Left {fmtLeft(rem)}</Body>
              </Row>
            </View>

            <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              <Body style={{ fontWeight: '700', flex: 1 }} numberOfLines={1}>{segName(S, k, curKey(S, k))}</Body>
              <Text style={{ color: c.ink, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmtUsed(segMs(S, k, curKey(S, k), now))}</Text>
            </Row>

            <Pressable
              onPress={() => go(k)}
              accessibilityRole="button"
              accessibilityState={{ selected: run }}
              style={({ pressed }) => ({
                backgroundColor: run ? c.bad : c.accent,
                borderRadius: radius.md,
                paddingVertical: 18,
                alignItems: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text style={{ color: run ? '#FFFFFF' : c.accentInk, fontSize: 20, fontWeight: '800' }}>{run ? 'Pause' : u > 0 ? 'Resume' : 'Start'}</Text>
            </Pressable>

            <Chips
              options={ACTS[k].map((type) => ({ id: type, label: ACT_TYPES[type].label }))}
              value={cur.type}
              onPick={(type) => update((s, t) => selectType(s, k, type, t))}
            />
            {wit && (
              <View style={{ gap: 4 }}>
                <Label>{wit === 'own' ? 'Our witness' : 'Their witness'}</Label>
                <Chips
                  options={witList(S, k, cur.type).map((name, i) => ({ id: String(i), label: name }))}
                  value={String(cur.w ?? 0)}
                  onPick={(w) => update((s, t) => selectWitness(s, k, Number(w), t))}
                />
              </View>
            )}

            {Object.keys(S.limits).length > 0 && (
              <View style={{ gap: 2 }}>
                {(Object.keys(S.limits) as LimitGroup[]).map((g) => {
                  const lim = S.limits[g]! * 60000;
                  const gu = groupMs(S, k, g, now);
                  return (
                    <Row key={g} style={{ justifyContent: 'space-between' }}>
                      <Body muted>{LIMIT_LABEL[g]}</Body>
                      <Text style={{ color: gu > lim ? c.bad : gu > lim - 60000 ? c.warn : c.muted, fontVariant: ['tabular-nums'] }}>
                        {fmtUsed(gu)} of {S.limits[g]}:00
                      </Text>
                    </Row>
                  );
                })}
              </View>
            )}

            <Row style={{ justifyContent: 'space-between' }}>
              {[
                [-60000, '−1 min'],
                [-10000, '−10 s'],
                [10000, '+10 s'],
                [60000, '+1 min'],
              ].map(([d, l]) => (
                <Pressable
                  key={l as string}
                  onPress={() => {
                    lastRem.current[k] = null; // no alerts from a manual correction
                    update((s, t) => adjust(s, k, d as number, t));
                  }}
                  accessibilityLabel={`Correct current activity ${l}`}
                  style={{ flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.sm, backgroundColor: c.surfaceAlt, marginHorizontal: 2 }}
                >
                  <Text style={{ color: c.accent, fontWeight: '600', fontSize: 13 }}>{l}</Text>
                </Pressable>
              ))}
            </Row>
          </View>
        );
      })}
      </View>

      <Row>
        <View style={{ flex: 1 }}><Button small kind="secondary" title={panel === 'breakdown' ? 'Hide breakdown' : 'Breakdown'} onPress={() => setPanel(panel === 'breakdown' ? 'none' : 'breakdown')} /></View>
        <View style={{ flex: 1 }}><Button small kind="secondary" title={copied ? 'Copied' : 'Copy all'} onPress={async () => { await Clipboard.setStringAsync(breakdownText(S, Date.now(), title)); setCopied(true); setTimeout(() => setCopied(false), 1500); }} /></View>
      </Row>
      <Row>
        <View style={{ flex: 1 }}><Button small kind="ghost" title="Settings" onPress={() => setPanel(panel === 'settings' ? 'none' : 'settings')} /></View>
        <View style={{ flex: 1 }}><Button small kind="ghost" title="Reset" onPress={() => setPanel(panel === 'reset' ? 'none' : 'reset')} /></View>
      </Row>

      {panel === 'reset' && (
        <Card>
          <H2>Reset both clocks?</H2>
          <Body muted>This clears both sides' times and the log. Minutes, names and witnesses stay.</Body>
          <Button kind="danger" title="Reset clocks" onPress={() => { lastRem.current = { p: null, d: null }; update((s) => resetClocks(s)); setPanel('none'); }} />
          <Button kind="ghost" title="Cancel" onPress={() => setPanel('none')} />
        </Card>
      )}

      {panel === 'breakdown' && (
        <Card>
          <H2>Breakdown</H2>
          {SIDES.map((k) => {
            const u = usedMs(S, k, now);
            const rows = segList(S, k, now);
            return (
              <View key={k} style={{ gap: 2, marginTop: space.sm }}>
                <Label>{S.labels[k]}</Label>
                <Body>Used {fmtUsed(u)} · {u > A ? `over by ${fmtUsed(u - A)}` : `left ${fmtLeft(A - u)}`}</Body>
                {rows.length === 0 ? (
                  <Body muted>No time used yet.</Body>
                ) : (
                  rows.map((r) => (
                    <Row key={r.key} style={{ justifyContent: 'space-between' }}>
                      <Body style={{ fontWeight: r.now ? '700' : '400' }}>{r.name}</Body>
                      <Text style={{ color: c.ink, fontVariant: ['tabular-nums'] }}>{fmtUsed(r.ms)}</Text>
                    </Row>
                  ))
                )}
              </View>
            );
          })}
          <Body muted>Copy all puts this breakdown and the full start and pause log on the clipboard.</Body>
        </Card>
      )}

      {panel === 'settings' && <Settings S={S} onSave={(n) => { lastRem.current = { p: null, d: null }; update((s) => ({ ...s, ...n })); setPanel('none'); }} onCancel={() => setPanel('none')} />}

      <Body muted>
        Starting one side pauses the other. Pause for objections; the time stays with the same activity. Times are saved on this device, so the timer keeps working without signal and survives the app closing.
        {Platform.OS === 'web' ? ' Keys: P and D start or pause each side, Space pauses both.' : ''}
      </Body>
    </View>
  );
}

function Chips<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (v: T) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable
            key={o.id}
            onPress={() => onPick(o.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : c.surface }}
          >
            <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Settings({ S, onSave, onCancel }: { S: TimerState; onSave: (n: Pick<TimerState, 'allotMin' | 'labels' | 'witnesses'>) => void; onCancel: () => void }) {
  const [min, setMin] = useState(String(S.allotMin));
  const [lp, setLp] = useState(S.labels.p);
  const [ld, setLd] = useState(S.labels.d);
  const [wp, setWp] = useState(S.witnesses.p.join('\n'));
  const [wd, setWd] = useState(S.witnesses.d.join('\n'));
  const lines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12);
  return (
    <Card>
      <H2>Timer settings</H2>
      <Field label="Minutes per side" value={min} onChangeText={setMin} keyboardType="number-pad" />
      <Field label="Plaintiff / prosecution name" value={lp} onChangeText={setLp} />
      <Field label="Defense name" value={ld} onChangeText={setLd} />
      <Field label={`${lp || 'Plaintiff'} witnesses, in calling order`} value={wp} onChangeText={setWp} multiline hint="One per line." />
      <Field label={`${ld || 'Defense'} witnesses, in calling order`} value={wd} onChangeText={setWd} multiline hint="One per line." />
      <Button
        title="Save settings"
        onPress={() => {
          const m = Math.round(Number(min));
          onSave({
            allotMin: m >= 1 && m <= 600 ? m : S.allotMin,
            labels: { p: lp.trim() || 'Plaintiff / Prosecution', d: ld.trim() || 'Defense' },
            witnesses: { p: lines(wp).length ? lines(wp) : S.witnesses.p, d: lines(wd).length ? lines(wd) : S.witnesses.d },
          });
        }}
      />
      <Button kind="ghost" title="Cancel" onPress={onCancel} />
    </Card>
  );
}
