import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StoreProvider } from '../lib/store';
import { useTheme } from '../lib/theme';
import { PrivacyBanner } from '../components/PrivacyBanner';

function Nav() {
  const c = useTheme();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.ink, fontWeight: '700' },
        contentStyle: { backgroundColor: c.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="tournament/new" options={{ title: 'New competition', presentation: 'modal' }} />
      <Stack.Screen name="tournament/register" options={{ title: 'Sign up', presentation: 'modal' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="tournament/judge" options={{ title: 'Volunteer to judge', presentation: 'modal' }} />
      <Stack.Screen name="tournament/pair" options={{ title: 'Pair a round' }} />
      <Stack.Screen name="tournament/[id]" options={{ title: '' }} />
      <Stack.Screen name="team/[id]" options={{ title: 'Team' }} />
      <Stack.Screen name="match/[id]" options={{ title: 'Trial' }} />
      <Stack.Screen name="timer" options={{ title: 'Trial timer' }} />
      <Stack.Screen name="case/[id]" options={{ title: 'Case file' }} />
      <Stack.Screen name="history/[id]" options={{ title: 'Past competition' }} />
      <Stack.Screen name="history/school" options={{ title: 'School record' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
      <Stack.Screen name="case/new" options={{ title: 'Release a case', presentation: 'modal' }} />
      <Stack.Screen name="bulletin/new" options={{ title: 'Post a bulletin', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="auto" />
      <PrivacyBanner />
      <Nav />
    </StoreProvider>
  );
}
