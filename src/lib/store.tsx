import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createBackend, type Backend, type TableName } from './backend';
import type { AppData, Level, PastEvent, Profile, Tournament } from './types';
import { DEMO_USERS } from './sampleData';

interface StoreValue {
  backend: Backend;
  data: AppData | null;
  error: string | null;
  me: Profile | null;
  level: Level;
  setLevel: (l: Level) => void;
  save: <K extends TableName>(table: K, row: AppData[K][number]) => Promise<void>;
  remove: (table: TableName, id: string) => Promise<void>;
  refresh: () => Promise<void>;
  refreshUser: () => Promise<void>;
  canManage: (t: Tournament | undefined) => boolean;
  switchDemoUser?: (who: keyof typeof DEMO_USERS | null) => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const backend = useRef(createBackend()).current;
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [level, setLevel] = useState<Level>('law_school');

  const refresh = useCallback(async () => {
    try {
      setData({ ...(await backend.load()) });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load data.');
    }
  }, [backend]);

  const refreshUser = useCallback(async () => {
    setMe(await backend.currentUser());
  }, [backend]);

  useEffect(() => {
    refresh();
    refreshUser();
    return backend.subscribe(refresh);
  }, [backend, refresh, refreshUser]);

  const value = useMemo<StoreValue>(
    () => ({
      backend,
      data,
      error,
      me,
      level,
      setLevel,
      save: async (table, row) => {
        await backend.upsert(table, row);
        await refresh();
      },
      remove: async (table, id) => {
        await backend.remove(table, id);
        await refresh();
      },
      refresh,
      refreshUser,
      canManage: (t) => !!t && !!me && t.directorIds.includes(me.id),
      switchDemoUser: backend.switchDemoUser
        ? async (who) => {
            await backend.switchDemoUser!(who);
            await refreshUser();
          }
        : undefined,
    }),
    [backend, data, error, me, level, refresh, refreshUser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside StoreProvider');
  return v;
}

/** Data filtered to the selected circuit level. */
export function useLevelData() {
  const { data, level } = useStore();
  return useMemo(() => {
    if (!data) return null;
    const tournaments = data.tournaments.filter((t) => t.level === level);
    const tIds = new Set(tournaments.map((t) => t.id));
    return {
      ...data,
      tournaments,
      teams: data.teams.filter((t) => t.level === level),
      programs: data.programs.filter((p) => p.level === level),
      cases: data.cases.filter((c) => c.level === level),
      bulletins: data.bulletins.filter((b) => b.level === level),
      matches: data.matches.filter((m) => tIds.has(m.tournamentId)),
      judgeSignups: data.judgeSignups.filter((j) => tIds.has(j.tournamentId)),
      messages: data.messages.filter((m) => tIds.has(m.tournamentId)),
    };
  }, [data, level]);
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const historyCache = new Map<string, Promise<PastEvent[]>>();
/** Past competitions for the selected circuit, loaded once per level. */
export function useHistory() {
  const { backend, level } = useStore();
  const [state, setState] = useState<{ level: Level; events: PastEvent[] | null; error: string | null }>({ level, events: null, error: null });
  useEffect(() => {
    let live = true;
    let p = historyCache.get(level);
    if (!p) {
      p = backend.loadHistory(level);
      historyCache.set(level, p);
      p.catch(() => historyCache.delete(level));
    }
    p.then((events) => live && setState({ level, events, error: null })).catch((e) => live && setState({ level, events: [], error: e instanceof Error ? e.message : 'Could not load past results.' }));
    return () => {
      live = false;
    };
  }, [backend, level]);
  return state.level === level ? state : { level, events: null, error: null };
}
