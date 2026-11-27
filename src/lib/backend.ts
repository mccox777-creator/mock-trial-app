import AsyncStorage from '@react-native-async-storage/async-storage';
import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sessionStorage } from './secureStorage';
import type { AppData, Profile } from './types';
import { sampleData, DEMO_USERS } from './sampleData';

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
  signOut(): Promise<void>;
  /** Store a picked file (case packet, exhibit) for a case and return a reference to save on the file record. */
  uploadFile(caseId: string, name: string, uri: string, mimeType: string): Promise<string>;
  /** Turn a saved file reference into a link to open now. Private files get a short-lived link, checked against the release time. */
  fileLink(ref: string): Promise<string>;
  /** Read a photographed paper ballot. */
  readBallot(matchId: string, imageBase64: string, mediaType: string, lines: string[]): Promise<BallotReading>;
  /** Demo mode only: act as one of the sample users. */
  switchDemoUser?(who: keyof typeof DEMO_USERS | null): Promise<void>;
  /** Demo mode only: restore the sample season. */
  resetDemo?(): Promise<void>;
}

const EMPTY: AppData = {
  programs: [], teams: [], tournaments: [], registrations: [], judgeSignups: [], matches: [], ballots: [],
  cases: [], caseFiles: [], bulletins: [], recordings: [],
};

// ---------- Demo backend: sample season, saved on the device ----------

const DEMO_KEY = 'mocktrial.demo.v3';
const DEMO_USER_KEY = 'mocktrial.demo.user';

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
  };
}

// ---------- Supabase backend ----------

const TABLES: Record<TableName, string> = {
  programs: 'programs', teams: 'teams', tournaments: 'tournaments', registrations: 'registrations', judgeSignups: 'judge_signups',
  matches: 'matches', ballots: 'ballots', cases: 'cases', caseFiles: 'case_files',
  bulletins: 'bulletins', recordings: 'recordings',
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
      return Object.fromEntries(entries) as unknown as AppData;
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
      return {
        id: u.id,
        email: u.email ?? '',
        name: (prof?.name as string) || u.email || 'Member',
        teamIds: (prof?.team_ids as string[]) ?? [],
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
    async signOut() {
      await sb.auth.signOut();
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
