import { Tabs } from 'expo-router/tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../lib/theme';
import { HomeButton } from '../../components/NavButtons';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const c = useTheme();
  const icon = (name: IconName) => ({ color, size }: { color: unknown; size: number }) => <Ionicons name={name} color={String(color)} size={size} />;
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { color: c.ink, fontWeight: '800' },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Schedule', tabBarIcon: icon('calendar-outline') }} />
      <Tabs.Screen name="rankings" options={{ headerRight: () => <HomeButton />, title: 'Results', tabBarIcon: icon('podium-outline') }} />
      <Tabs.Screen name="cases" options={{ headerRight: () => <HomeButton />, title: 'Case Files', tabBarIcon: icon('folder-open-outline') }} />
      <Tabs.Screen name="bulletins" options={{ headerRight: () => <HomeButton />, title: 'Bulletins', tabBarIcon: icon('megaphone-outline') }} />
      <Tabs.Screen name="account" options={{ headerRight: () => <HomeButton />, title: 'Me', tabBarIcon: icon('person-circle-outline') }} />
    </Tabs>
  );
}
