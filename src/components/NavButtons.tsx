import { Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../lib/theme';

/** Go home: close every open page and show the Schedule tab. Works even when the page was opened from a link. */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/');
}

/** "Back" at the top left of every page. With nothing to go back to (a page opened from a link), it goes home. */
export function BackButton() {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : goHome())}
      style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingLeft: 4 }}
    >
      <Ionicons name="chevron-back" size={22} color={c.accent} />
      <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Back</Text>
    </Pressable>
  );
}

/** "Home" at the top right of every page. */
export function HomeButton() {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Home"
      hitSlop={10}
      onPress={goHome}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12 }}
    >
      <Ionicons name="home-outline" size={20} color={c.accent} />
      <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Home</Text>
    </Pressable>
  );
}
