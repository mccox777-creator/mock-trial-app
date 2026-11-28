import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'mocktrial.blocked.v1';
let cache: string[] | null = null;
const listeners = new Set<(ids: string[]) => void>();

async function read(): Promise<string[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

/** People this person has hidden: their chat messages and posts are not shown on this device. */
export function useBlocked() {
  const [ids, setIds] = useState<string[]>(cache ?? []);
  useEffect(() => {
    read().then(setIds);
    listeners.add(setIds);
    return () => {
      listeners.delete(setIds);
    };
  }, []);
  const set = useCallback(async (next: string[]) => {
    cache = next;
    listeners.forEach((l) => l(next));
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // keep the in-memory list
    }
  }, []);
  return {
    blocked: ids,
    block: (id: string) => set([...new Set([...(cache ?? []), id])]),
    unblock: (id: string) => set((cache ?? []).filter((x) => x !== id)),
  };
}
