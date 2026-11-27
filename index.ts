import { Platform } from 'react-native';

// Hosted web previews are served from an unknown sub-path; start the router at "/".
if (process.env.EXPO_PUBLIC_WEB_PREVIEW === '1' && Platform.OS === 'web' && typeof window !== 'undefined' && window.location.pathname !== '/') {
  try {
    window.history.replaceState(null, '', '/');
  } catch {}
}

require('expo-router/entry');
