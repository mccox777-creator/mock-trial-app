import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sessionStorage } from './secureStorage';
import type { AdminMember, AppData, Level, Notice, NotificationPrefs, OrganizerRequest, PastEvent, Profile, Report, ReportKind, ReportReason } from './types';
import { Platform } from 'react-native';
import { sampleData, DEMO_USERS } from './sampleData';

/** The circuit record that ships with the app: read only when someone opens the history. */
function bundledHistory(level: Level): PastEvent[] {
  return level === 'law_school' ? (require('../data/history-law-school.json') as PastEvent[]) : [];
}

/** The latest circuit record, published with the website on every merge (public/ratings-data/events.json). */
const LIVE_HISTORY_URL = 'https://app.mocktrialcentral.com/ratings-data/events.json';
const LIVE_HISTORY_KEY = 'mocktrial.history.law_school.v1';

const looksLikeHistory = (x: unknown): x is PastEvent[] =>
  Array.isArray(x) && x.length > 0 && x.every((e) => e && typeof e.id === 'string' && Array.isArray(e.results) && Array.isArray(e.participants));

/**
 * The circuit record for the phone app. The website always ships the newest record, but an installed app only has the
 * copy it was built with, so the app fetches the published one (new results show up without a new App Store build),
 * keeps the last good copy for offline use, and falls back to the built-in copy.
 */
async function latestHistory(level: Level): Promise<PastEvent[]> {
  const shipped = bundledHistory(level);
  if (level !== 'law_school' || Platform.OS === 'web') return shipped;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(LIVE_HISTORY_URL, { signal: ctl.signal, headers: { 'cache-control': 'no-cache' } });
    clearTimeout(timer);
    if (res.ok) {
      const live: unknown = await res.json();
      if (looksLikeHistory(live)) {
        AsyncStorage.setItem(LIVE_HISTORY_KEY, JSON.stringify(live)).catch(() => {});
        return live;
      }
    }
  } catch {
    // offline or slow: use the last copy we fetched
  }
  try {
    const saved = await AsyncStorage.getItem(LIVE_HISTORY_KEY);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    if (looksLikeHistory(parsed) && parsed.length >= shipped.length) return parsed;
  } catch {
    // ignore a damaged saved copy
  }
  return shipped;
}

export type TableName = keyof AppData;

/** What the ballot scanner read off a photo. Organizer confirms before anything is saved. */
export interface BallotReading {
  judge_name: string;
  plaintiff_scores: (number | null)[];
  defense_scores: (number | null)[];
  plaintiff_total_written: number | null;
  defense_total_written: number | null;
  unreadable_notes: string;
}

/** Storage-agnostic backend. The app talks only to this interface. */
export interface Backend {
  kind: 'demo' | 'supabase';
  load(): Promise<AppData>;
  upsert<K extends TableName>(table: K, row: AppData[K][number]): Promise<void>;
  remove(table: TableName, id: string): Promise<void>;
  /** Calls back when another device changes data. Returns an unsubscribe. */
  subscribe(onChange: () => void): () => void;
  currentUser(): Promise<Profile | null>;
  signIn(email: string): Promise<{ needsCode: boolean }>;
  verifyCode?(email: string, code: string): Promise<void>;
  /** Password sign-in, for accounts given a password in the Supabase dashboard (such as Apple's review account). */
  signInWithPassword?(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Permanently delete the signed-in account. Shared records (results, ballots) stay without the person's name. */
  deleteAccount?(): Promise<void>;
  /** Store a picked file (case packet, exhibit) for a case and return a reference to save on the file record. */
  uploadFile(caseId: string, name: string, uri: string, mimeType: string): Promise<string>;
  /** Turn a saved file reference into a link to open now. Private files get a short-lived link, checked against the release time. */
  fileLink(ref: string): Promise<string>;
  /** Read a photographed paper ballot. */
  readBallot(matchId: string, imageBase64: string, mediaType: string, lines: string[]): Promise<BallotReading>;
  getPrefs(): Promise<NotificationPrefs | null>;
  savePrefs(p: NotificationPrefs): Promise<void>;
  /** Remember this phone so it can get alerts. */
  registerPushToken(token: string, platform: string): Promise<void>;
  inbox(): Promise<Notice[]>;
  markRead(ids: number[]): Promise<void>;
  /** Demo mode only: act as one of the sample users. */
  switchDemoUser?(who: keyof typeof DEMO_USERS | null): Promise<void>;
  /** Past competitions imported from the circuit's records (read-only). */
  loadHistory(level: Level): Promise<PastEvent[]>;
  /** Demo mode only: restore the sample season. */
  resetDemo?(): Promise<void>;
  /** Ask a platform admin to approve this account to run competitions. */
  requestOrganizer(r: { name: string; school: string; role: string; note: string }): Promise<void>;
  /** Flag something to the platform admins. */
  report(kind: ReportKind, targetId: string, reason: ReportReason, details: string): Promise<void>;
  /** Platform admins only; the database refuses everyone else. */
  admin: {
    organizerRequests(): Promise<OrganizerRequest[]>;
    decideOrganizer(userId: string, status: 'approved' | 'rejected' | 'suspended'): Promise<void>;
    reports(): Promise<Report[]>;
    resolveReport(id: number, status: 'resolved' | 'dismissed'): Promise<void>;
    setListing(tournamentId: string, patch: { approved?: boolean; hidden?: boolean }): Promise<void>;
    removePost(kind: 'bulletin' | 'message', id: string): Promise<void>;
    /** Everyone with the admin or owner role. */
    admins(): Promise<AdminMember[]>;
    /** Owner only: make the person who signs in with this email an admin. */
    addAdmin(email: string): Promise<void>;
    /** Owner only. The owner can't be removed. */
    removeAdmin(userId: string): Promise<void>;
  };
}

const EMPTY: AppData = {
  programs: [], teams: [], tournaments: [], registrations: [], judgeSignups: [], matches: [], ballots: [],
  cases: [], caseFiles: [], bulletins: [], recordings: [], messages: [],
};

// ---------- Demo backend: sample season, saved on the device ----------

const DEMO_KEY = 'mocktrial.demo.v5';
const DEMO_USER_KEY = 'mocktrial.demo.user';
const DEMO_PREFS_KEY = 'mocktrial.demo.prefs';
const DEMO_INBOX: Notice[] = [
  { id: 3, kind: 'judges_needed', title: 'Judges needed: Spring Invitational Championship', body: 'Ridgeview needs 6 more judges for Rounds 1 to 4, March 12 to 14.', link: '/tournament/spring-championship', createdAt: '2026-11-26T15:00:00', readAt: null },
  { id: 2, kind: 'chat', title: 'Demo Director · Winter Trial Classic', body: 'Use the 3rd Street garage. We will validate parking at check-in.', link: '/tournament/winter-classic', createdAt: '2026-11-20T10:30:00', readAt: null },
  { id: 1, kind: 'new_competition', title: 'New competition: Winter Trial Classic', body: 'Jan 22, 2027 in Pinecrest. Registration closes Dec 18.', link: '/tournament/winter-classic', createdAt: '2026-11-02T09:00:00', readAt: '2026-11-02T12:00:00' },
];

const DEMO_ADMIN: Backend['admin'] = {
  organizerRequests: async () => [],
  decideOrganizer: async () => {},
  reports: async () => [],
  resolveReport: async () => {},
  setListing: async () => {},
  removePost: async () => {},
  admins: async () => [{ userId: 'demo-director', name: 'Demo Director', email: 'director@example.edu', role: 'owner', addedAt: '2026-11-01T09:00:00' }],
  addAdmin: async () => {
    throw new Error('In the demo, admins can\'t be added. This works once you sign in on the live app.');
  },
  removeAdmin: async () => {},
};

function demoBackend(): Backend {
  let cache: AppData | null = null;
  const listeners = new Set<() => void>();
  const save = async () => {
    try {
      await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(cache));
    } catch {}
    listeners.forEach((l) => l());
  };
  return {
    kind: 'demo',
    async loadHistory(level) {
      return bundledHistory(level);
    },
    async load() {
      if (!cache) {
        try {
          const raw = await AsyncStorage.getItem(DEMO_KEY);
          cache = raw ? { ...EMPTY, ...JSON.parse(raw) } : JSON.parse(JSON.stringify(sampleData)) as AppData;
        } catch {
          cache = JSON.parse(JSON.stringify(sampleData)) as AppData;
        }
      }
      return cache!;
    },
    async upsert(table, row) {
      const data = await this.load();
      const list = data[table] as { id: string }[];
      const i = list.findIndex((r) => r.id === (row as { id: string }).id);
      const next = i === -1 ? [...list, row] : list.map((r, j) => (j === i ? row : r));
      cache = { ...data, [table]: next };
      await save();
    },
    async remove(table, id) {
      const data = await this.load();
      cache = { ...data, [table]: (data[table] as { id: string }[]).filter((r) => r.id !== id) };
      await save();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async currentUser() {
      try {
        const who = (await AsyncStorage.getItem(DEMO_USER_KEY)) as keyof typeof DEMO_USERS | null;
        if (who === null) return DEMO_USERS.director; // first launch: show organizer tools
        return who in DEMO_USERS ? DEMO_USERS[who] : null;
      } catch {
        return DEMO_USERS.director;
      }
    },
    async signIn() {
      return { needsCode: false };
    },
    async getPrefs() {
      try {
        const raw = await AsyncStorage.getItem(DEMO_PREFS_KEY);
        return raw ? (JSON.parse(raw) as NotificationPrefs) : null;
      } catch {
        return null;
      }
    },
    async savePrefs(p) {
      await AsyncStorage.setItem(DEMO_PREFS_KEY, JSON.stringify(p));
    },
    async registerPushToken() {},
    async inbox() {
      return DEMO_INBOX;
    },
    async markRead() {},
    async uploadFile(_caseId, _name, uri) {
      return uri; // demo mode keeps the file on this device only
    },
    async fileLink(ref) {
      return ref;
    },
    async readBallot(_matchId, _img, _type, lines) {
      // Demo mode has no server, so it simulates a reading to show the confirm step.
      await new Promise((r) => setTimeout(r, 900));
      const pick = () => 6 + Math.floor(Math.random() * 4);
      return {
        judge_name: 'Scanned ballot (demo)',
        plaintiff_scores: lines.map(pick),
        defense_scores: lines.map((_, i) => (i === 2 ? null : pick())),
        plaintiff_total_written: null,
        defense_total_written: null,
        unreadable_notes: 'Demo mode: these scores are simulated. Line 3 for the defense was left blank to show how unreadable lines are flagged.',
      };
    },
    async signOut() {
      await AsyncStorage.setItem(DEMO_USER_KEY, 'none');
    },
    async switchDemoUser(who) {
      await AsyncStorage.setItem(DEMO_USER_KEY, who ?? 'none');
    },
    async resetDemo() {
      cache = JSON.parse(JSON.stringify(sampleData)) as AppData;
      await save();
    },
    async requestOrganizer() {},
    async report() {},
    admin: DEMO_ADMIN,
  };
}

// ---------- Supabase backend ----------

const TABLES: Record<TableName, string> = {
  programs: 'programs', teams: 'teams', tournaments: 'tournaments', registrations: 'registrations', judgeSignups: 'judge_signups',
  matches: 'matches', ballots: 'ballots', cases: 'cases', caseFiles: 'case_files',
  bulletins: 'bulletins', recordings: 'recordings', messages: 'messages',
};

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const mapKeys = (o: Record<string, unknown>, f: (k: string) => string) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [f(k), v]));

function supabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { storage: sessionStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  return {
    kind: 'supabase',
    async load() {
      const entries = await Promise.all(
        (Object.keys(TABLES) as TableName[]).map(async (k) => {
          const { data, error } = await sb.from(TABLES[k]).select('*');
          if (error) throw error;
          return [k, (data ?? []).map((r) => mapKeys(r, toCamel))] as const;
        }),
      );
      const data = Object.fromEntries(entries) as unknown as AppData;
      // Public standings: ballots you can't read in full still count, as totals only, once results are published.
      const { data: pub } = await sb.from('published_results').select('*');
      const have = new Set(data.ballots.map((b) => b.id));
      for (const r of pub ?? []) {
        if (have.has(r.id)) continue;
        data.ballots.push({ id: r.id, matchId: r.match_id, judge: 'Ballot', judgeId: null, source: 'paper', sheet: null, comments: null, pScore: Number(r.p_score), dScore: Number(r.d_score), enteredBy: '', enteredAt: '' });
      }
      return data;
    },
    async loadHistory(level) {
      const out: PastEvent[] = [];
      // Page through: a season list runs to several hundred rows.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb.from('past_events').select('*').eq('level', level).order('ord', { ascending: true }).range(from, from + 999);
        if (error) throw error;
        out.push(...(data ?? []).map((r) => mapKeys(r, toCamel) as unknown as PastEvent));
        if (!data || data.length < 1000) break;
      }
      // The circuit record ships with the app, so nothing has to be imported. Rows in the database
      // (added later, or corrections) take the place of the shipped entry with the same id.
      const have = new Set(out.map((e) => e.id));
      return [...(await latestHistory(level)).filter((e) => !have.has(e.id)), ...out];
    },
    async upsert(table, row) {
      const { error } = await sb.from(TABLES[table]).upsert(mapKeys(row as unknown as Record<string, unknown>, toSnake));
      if (error) throw error;
    },
    async remove(table, id) {
      const { error } = await sb.from(TABLES[table]).delete().eq('id', id);
      if (error) throw error;
    },
    subscribe(fn) {
      const ch = sb
        .channel('mocktrial-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => fn())
        .subscribe();
      return () => {
        sb.removeChannel(ch);
      };
    },
    async currentUser() {
      const { data } = await sb.auth.getUser();
      const u = data.user;
      if (!u) return null;
      const { data: prof } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
      const [{ data: mine }, { data: req }, { data: admin }] = await Promise.all([
        sb.from('team_members').select('team_id, role').eq('user_id', u.id),
        sb.from('organizer_requests').select('status').eq('user_id', u.id).maybeSingle(),
        sb.rpc('is_admin'),
      ]);
      const { data: owner } = admin === true ? await sb.rpc('is_owner') : { data: false };
      return {
        id: u.id,
        email: u.email ?? '',
        name: (prof?.name as string) || u.email || 'Member',
        teamIds: (prof?.team_ids as string[]) ?? [],
        coachOf: (mine ?? []).filter((m) => m.role === 'coach').map((m) => m.team_id as string),
        isAdmin: admin === true,
        isOwner: owner === true,
        organizer: (req?.status as Profile['organizer']) ?? 'none',
      };
    },
    async signIn(email) {
      const { error } = await sb.auth.signInWithOtp({ email });
      if (error) throw error;
      return { needsCode: true };
    },
    async verifyCode(email, code) {
      const { error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' });
      if (error) throw error;
    },
    async signInWithPassword(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async deleteAccount() {
      const { error } = await sb.rpc('delete_my_account');
      if (error) throw error;
      await sb.auth.signOut({ scope: 'local' });
    },
    async getPrefs() {
      const { data } = await sb.from('notification_prefs').select('*').maybeSingle();
      return data ? (mapKeys(data, toCamel) as unknown as NotificationPrefs) : null;
    },
    async savePrefs(p) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error('Sign in first.');
      const { error } = await sb.from('notification_prefs').upsert({ ...mapKeys(p as unknown as Record<string, unknown>, toSnake), user_id: u.user.id, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    async registerPushToken(token, platform) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return;
      await sb.from('push_tokens').upsert({ token, platform, user_id: u.user.id });
    },
    async inbox() {
      const { data } = await sb.from('notifications').select('id, kind, title, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(50);
      return (data ?? []).map((r) => mapKeys(r, toCamel) as unknown as Notice);
    },
    async markRead(ids) {
      if (ids.length) await sb.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
    },
    async readBallot(matchId, imageBase64, mediaType, lines) {
      const { data, error } = await sb.functions.invoke('read-ballot', { body: { matchId, imageBase64, mediaType, lines } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as BallotReading;
    },
    async uploadFile(caseId, name, uri, mimeType) {
      const body = await (await fetch(uri)).arrayBuffer();
      // Files live under the case's folder; the database lets only the case's author or organizer
      // upload there, and lets nobody else download until the release time.
      const path = `${caseId}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}-${name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80)}`;
      const { error } = await sb.storage.from('case-files').upload(path, body, { contentType: mimeType });
      if (error) throw error;
      return `storage:case-files/${path}`;
    },
    async requestOrganizer(r) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new Error('Sign in first.');
      const row = { user_id: u.user.id, name: r.name.trim(), school: r.school.trim(), role: r.role.trim(), note: r.note.trim(), status: 'pending' };
      const { data: had } = await sb.from('organizer_requests').select('status').eq('user_id', u.user.id).maybeSingle();
      const { error } = had ? await sb.from('organizer_requests').update(row).eq('user_id', u.user.id) : await sb.from('organizer_requests').insert(row);
      if (error) throw error;
    },
    async report(kind, targetId, reason, details) {
      const { error } = await sb.from('reports').insert({ kind, target_id: targetId, reason, details: details.trim() });
      if (error && error.code === '23505') throw new Error('You have already reported this. The admins will look at it.');
      if (error) throw error;
    },
    admin: {
      async organizerRequests() {
        const { data, error } = await sb.from('organizer_requests').select('*').order('requested_at', { ascending: false });
        if (error) throw error;
        return (data ?? []).map((r) => mapKeys(r, toCamel) as unknown as OrganizerRequest);
      },
      async decideOrganizer(userId, status) {
        const { error } = await sb.from('organizer_requests').update({ status }).eq('user_id', userId);
        if (error) throw error;
      },
      async reports() {
        const { data, error } = await sb.from('reports').select('id, kind, target_id, reason, details, status, created_at').order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return (data ?? []).map((r) => mapKeys(r, toCamel) as unknown as Report);
      },
      async resolveReport(id, status) {
        const { error } = await sb.from('reports').update({ status }).eq('id', id);
        if (error) throw error;
      },
      async setListing(tournamentId, patch) {
        const { error } = await sb.from('tournaments').update(patch).eq('id', tournamentId);
        if (error) throw error;
      },
      async removePost(kind, id) {
        const { error } = await sb.from(kind === 'bulletin' ? 'bulletins' : 'messages').delete().eq('id', id);
        if (error) throw error;
      },
      async admins() {
        const { data, error } = await sb.rpc('list_admins');
        if (error) throw error;
        return ((data ?? []) as Record<string, unknown>[]).map((r) => mapKeys(r, toCamel) as unknown as AdminMember);
      },
      async addAdmin(email) {
        const { error } = await sb.rpc('add_admin', { p_email: email.trim() });
        if (error) throw new Error(error.message);
      },
      async removeAdmin(userId) {
        const { error } = await sb.rpc('remove_admin', { p_user: userId });
        if (error) throw new Error(error.message);
      },
    },
    async fileLink(ref) {
      if (!ref.startsWith('storage:case-files/')) return ref;
      // A fresh 5-minute link each time, so a shared link stops working quickly.
      const { data, error } = await sb.storage.from('case-files').createSignedUrl(ref.slice('storage:case-files/'.length), 300);
      if (error) throw new Error('This file is not available to you yet.');
      return data.signedUrl;
    },
  };
}

export function createBackend(): Backend {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? supabaseBackend(url, key) : demoBackend();
}
