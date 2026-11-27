// Two-clock trial timer, ported from Chris's Mock Trial Timer (github.com/mccox777-creator/Competition-Timer).
// One clock per side. Time is booked to the current activity (Opening, Direct of a witness, and so on).
// Clocks read the device's system clock, not ticks, so they stay right if the phone locks or the app restarts.

export type TimerSide = 'p' | 'd';
export type ActType = 'open' | 'direct' | 'cross' | 'redirect' | 'recross' | 'close' | 'rebut';

/** "own" = this side's own witnesses, "opp" = the other side's witnesses. */
export const ACT_TYPES: Record<ActType, { label: string; wit?: 'own' | 'opp'; group: LimitGroup }> = {
  open: { label: 'Opening', group: 'opening' },
  direct: { label: 'Direct', wit: 'own', group: 'direct' },
  cross: { label: 'Cross', wit: 'opp', group: 'cross' },
  redirect: { label: 'Redirect', wit: 'own', group: 'direct' },
  recross: { label: 'Recross', wit: 'opp', group: 'cross' },
  close: { label: 'Closing', group: 'closing' },
  rebut: { label: 'Rebuttal', group: 'closing' },
};
export const ACTS: Record<TimerSide, ActType[]> = {
  p: ['open', 'direct', 'cross', 'redirect', 'recross', 'close', 'rebut'],
  d: ['open', 'direct', 'cross', 'redirect', 'recross', 'close'],
};

/** Category limits some competitions set instead of, or as well as, one total per side. */
export type LimitGroup = 'opening' | 'direct' | 'cross' | 'closing';
export const LIMIT_LABEL: Record<LimitGroup, string> = { opening: 'Opening', direct: 'Direct and redirect', cross: 'Cross and recross', closing: 'Closing and rebuttal' };

export interface Cur {
  type: ActType;
  w: number | null;
}
export interface Seg {
  ms: number;
  first: number;
}
export interface SideState {
  since: number | null;
  cur: Cur;
  segs: Record<string, Seg>;
}
export interface LogEntry {
  t: 'run' | 'adj';
  k: TimerSide;
  a: string;
  start?: number;
  end?: number;
  at?: number;
  dur: number;
}
export interface TimerState {
  allotMin: number;
  limits: Partial<Record<LimitGroup, number>>;
  labels: Record<TimerSide, string>;
  witnesses: Record<TimerSide, string[]>;
  sides: Record<TimerSide, SideState>;
  log: LogEntry[];
}

export const DEFAULT_MINUTES = 70;
/** Vibrate and flash when time left crosses these. */
export const ALERTS = [5 * 60000, 60000, 0];

const freshSide = (): SideState => ({ since: null, cur: { type: 'open', w: null }, segs: {} });
export function freshTimer(over: Partial<Pick<TimerState, 'allotMin' | 'limits' | 'labels' | 'witnesses'>> = {}): TimerState {
  return {
    allotMin: over.allotMin ?? DEFAULT_MINUTES,
    limits: over.limits ?? {},
    labels: over.labels ?? { p: 'Plaintiff / Prosecution', d: 'Defense' },
    witnesses: over.witnesses ?? { p: ['Witness 1', 'Witness 2', 'Witness 3'], d: ['Witness 4', 'Witness 5', 'Witness 6'] },
    sides: { p: freshSide(), d: freshSide() },
    log: [],
  };
}

/** Read saved state defensively; anything malformed falls back to a fresh timer. */
export function parseTimer(raw: string | null, base: TimerState): TimerState {
  if (!raw) return base;
  try {
    const s = JSON.parse(raw);
    const side = (k: TimerSide): SideState => {
      const v = s?.sides?.[k] ?? {};
      const cur = v.cur && ACT_TYPES[v.cur.type as ActType] ? v.cur : { type: 'open', w: null };
      return { since: typeof v.since === 'number' ? v.since : null, cur, segs: v.segs && typeof v.segs === 'object' ? v.segs : {} };
    };
    const names = (a: unknown, d: string[]) => (Array.isArray(a) && a.length ? a.map(String).slice(0, 12) : d);
    return {
      allotMin: Number(s.allotMin) > 0 ? Number(s.allotMin) : base.allotMin,
      limits: s.limits && typeof s.limits === 'object' ? s.limits : base.limits,
      labels: { ...base.labels, ...(s.labels ?? {}) },
      witnesses: { p: names(s.witnesses?.p, base.witnesses.p), d: names(s.witnesses?.d, base.witnesses.d) },
      sides: { p: side('p'), d: side('d') },
      log: Array.isArray(s.log) ? s.log.slice(-2000) : [],
    };
  } catch {
    return base;
  }
}

const clone = (s: TimerState): TimerState => JSON.parse(JSON.stringify(s));
export const other = (k: TimerSide): TimerSide => (k === 'p' ? 'd' : 'p');
export const isRunning = (s: TimerState, k: TimerSide) => s.sides[k].since != null;
const elapsed = (s: TimerState, k: TimerSide, now: number) => (isRunning(s, k) ? Math.max(0, now - s.sides[k].since!) : 0);

export const keyOf = (cur: Cur) => (ACT_TYPES[cur.type].wit ? `${cur.type}:${cur.w ?? 0}` : cur.type);
export const curKey = (s: TimerState, k: TimerSide) => keyOf(s.sides[k].cur);
export function witList(s: TimerState, k: TimerSide, type: ActType) {
  return ACT_TYPES[type].wit === 'own' ? s.witnesses[k] : s.witnesses[other(k)];
}
export function segName(s: TimerState, k: TimerSide, key: string) {
  const [type, w] = key.split(':') as [ActType, string | undefined];
  const t = ACT_TYPES[type];
  if (!t) return key;
  if (w == null) return t.label;
  return `${t.label}: ${witList(s, k, type)[+w] ?? `Witness ${+w + 1}`}`;
}
export function segMs(s: TimerState, k: TimerSide, key: string, now: number) {
  return (s.sides[k].segs[key]?.ms ?? 0) + (key === curKey(s, k) ? elapsed(s, k, now) : 0);
}
export function usedMs(s: TimerState, k: TimerSide, now: number) {
  let t = elapsed(s, k, now);
  for (const seg of Object.values(s.sides[k].segs)) t += seg.ms;
  return t;
}
export function groupMs(s: TimerState, k: TimerSide, g: LimitGroup, now: number) {
  const keys = new Set([...Object.keys(s.sides[k].segs), curKey(s, k)]);
  let t = 0;
  for (const key of keys) if (ACT_TYPES[key.split(':')[0] as ActType]?.group === g) t += segMs(s, k, key, now);
  return t;
}

function addSeg(s: TimerState, k: TimerSide, key: string, ms: number, at: number) {
  const segs = s.sides[k].segs;
  if (!segs[key]) segs[key] = { ms: 0, first: at };
  segs[key].ms = Math.max(0, segs[key].ms + ms);
}
/** Bank the running time into the current activity and keep the clock going. */
function settle(s: TimerState, k: TimerSide, now: number) {
  const side = s.sides[k];
  if (side.since == null) return;
  const dur = Math.max(0, now - side.since);
  if (dur > 0) {
    addSeg(s, k, curKey(s, k), dur, side.since);
    s.log.push({ t: 'run', k, a: curKey(s, k), start: side.since, end: now, dur });
  }
  side.since = now;
}

// ---------- actions: each returns a new state ----------
export function pause(prev: TimerState, k: TimerSide, now: number): TimerState {
  if (!isRunning(prev, k)) return prev;
  const s = clone(prev);
  settle(s, k, now);
  s.sides[k].since = null;
  return s;
}
export function start(prev: TimerState, k: TimerSide, now: number): TimerState {
  if (isRunning(prev, k)) return prev;
  const s = clone(pause(prev, other(k), now)); // one clock at a time
  s.sides[k].since = now;
  return s;
}
export const toggle = (s: TimerState, k: TimerSide, now: number) => (isRunning(s, k) ? pause(s, k, now) : start(s, k, now));
export const pauseAll = (s: TimerState, now: number) => pause(pause(s, 'p', now), 'd', now);

function setCur(prev: TimerState, k: TimerSide, cur: Cur, now: number): TimerState {
  if (keyOf(cur) === keyOf(prev.sides[k].cur)) return prev;
  const s = clone(prev);
  settle(s, k, now); // time so far goes to the old activity
  s.sides[k].cur = cur;
  return s;
}
export function selectType(s: TimerState, k: TimerSide, type: ActType, now: number): TimerState {
  let w: number | null = null;
  const wit = ACT_TYPES[type].wit;
  if (wit) {
    // Follow the witness the other side is working with (Defense crossing the witness Plaintiff just directed).
    const oc = s.sides[other(k)].cur;
    const ot = ACT_TYPES[oc.type];
    if (ot.wit && ot.wit !== wit) w = oc.w ?? 0;
    else if (ACT_TYPES[s.sides[k].cur.type].wit === wit) w = s.sides[k].cur.w ?? 0;
    else w = 0;
    if (w >= witList(s, k, type).length) w = 0;
  }
  return setCur(s, k, { type, w }, now);
}
export const selectWitness = (s: TimerState, k: TimerSide, w: number, now: number) => setCur(s, k, { type: s.sides[k].cur.type, w }, now);

/** Correct the current activity's time (and so the totals) by delta ms. */
export function adjust(prev: TimerState, k: TimerSide, delta: number, now: number): TimerState {
  const key = curKey(prev, k);
  const cur = segMs(prev, k, key, now);
  const applied = Math.max(0, cur + delta) - cur;
  if (!applied) return prev;
  const s = clone(prev);
  addSeg(s, k, key, applied, now);
  s.log.push({ t: 'adj', k, a: key, at: now, dur: applied });
  return s;
}
export function resetClocks(s: TimerState): TimerState {
  return { ...freshTimer({ allotMin: s.allotMin, limits: s.limits, labels: s.labels, witnesses: s.witnesses }) };
}

// ---------- reading ----------
/** Activities with time, in the order they first happened. */
export function segList(s: TimerState, k: TimerSide, now: number) {
  const segs = s.sides[k].segs;
  const ck = curKey(s, k);
  const run = isRunning(s, k);
  const keys = Object.keys(segs).filter((key) => segMs(s, k, key, now) >= 1000 || (key === ck && run));
  if (run && !segs[ck]) keys.push(ck);
  keys.sort((a, b) => (segs[a]?.first ?? now) - (segs[b]?.first ?? now));
  return keys.map((key) => ({ key, name: segName(s, k, key), ms: segMs(s, k, key, now), now: key === ck }));
}

export function mmss(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  return `${m}:${String(totalSec % 60).padStart(2, '0')}`;
}
export const fmtUsed = (ms: number) => mmss(Math.floor(Math.max(0, ms) / 1000));
export const fmtLeft = (ms: number) => mmss(Math.ceil(Math.max(0, ms) / 1000));
const clockTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });

/** Plain-text breakdown and log, for pasting into a ballot, email, or chat. */
export function breakdownText(s: TimerState, now: number, title?: string) {
  const A = s.allotMin * 60000;
  const out: string[] = [];
  if (title) out.push(title, '');
  for (const k of ['p', 'd'] as TimerSide[]) {
    const u = usedMs(s, k, now);
    out.push(`${s.labels[k]}: used ${fmtUsed(u)}, ${u > A ? `over by ${fmtUsed(u - A)}` : `left ${fmtLeft(A - u)}`}`);
    for (const g of Object.keys(s.limits) as LimitGroup[]) {
      const lim = s.limits[g]! * 60000;
      const gu = groupMs(s, k, g, now);
      out.push(`  ${LIMIT_LABEL[g]}: ${fmtUsed(gu)} of ${s.limits[g]}:00${gu > lim ? ` (over by ${fmtUsed(gu - lim)})` : ''}`);
    }
    for (const r of segList(s, k, now)) out.push(`  ${r.name}: ${fmtUsed(r.ms)}`);
    out.push('');
  }
  if (s.log.length) {
    out.push('Log');
    for (const e of s.log) {
      const name = segName(s, e.k, e.a);
      out.push(
        e.t === 'run'
          ? `${clockTime(e.start!)} to ${clockTime(e.end!)}  ${s.labels[e.k]}, ${name}: ${fmtUsed(e.dur)}`
          : `${clockTime(e.at!)}  Correction to ${s.labels[e.k]}, ${name}: ${e.dur < 0 ? '-' : '+'}${fmtUsed(Math.abs(e.dur))}`,
      );
    }
  }
  return out.join('\n');
}
