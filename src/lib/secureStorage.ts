import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Where the sign-in session lives on the phone. iOS Keychain / Android Keystore via
// expo-secure-store, so another app or a device backup can't lift the session token.
// Secure store values are kept small, so the session is split into chunks.
const CHUNK = 1800;
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

async function clear(key: string) {
  const n = Number((await SecureStore.getItemAsync(`${key}.n`)) ?? 0);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  await SecureStore.deleteItemAsync(`${key}.n`);
}

export const sessionStorage =
  Platform.OS === 'web'
    ? AsyncStorage
    : {
        async getItem(k: string) {
          const key = safe(k);
          const n = await SecureStore.getItemAsync(`${key}.n`);
          if (n === null) return null;
          const parts: string[] = [];
          for (let i = 0; i < Number(n); i++) {
            const p = await SecureStore.getItemAsync(`${key}.${i}`);
            if (p === null) return null;
            parts.push(p);
          }
          return parts.join('');
        },
        async setItem(k: string, value: string) {
          const key = safe(k);
          await clear(key);
          const count = Math.ceil(value.length / CHUNK);
          for (let i = 0; i < count; i++) await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
          await SecureStore.setItemAsync(`${key}.n`, String(count));
        },
        async removeItem(k: string) {
          await clear(safe(k));
        },
      };
