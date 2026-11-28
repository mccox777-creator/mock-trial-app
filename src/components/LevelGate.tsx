import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, H1, H2 } from './ui';
import { useStore } from '../lib/store';
import { LEVELS, type Level } from '../lib/types';
import { space, useTheme } from '../lib/theme';

/**
 * A new account picks its circuit once: law school, collegiate or high school. After that it sees and acts
 * only in that circuit (the database enforces it too), and only a site admin can change it.
 */
export function LevelGate({ children }: { children: React.ReactNode }) {
  const { me, backend, refreshUser } = useStore();
  const c = useTheme();
  const [choice, setChoice] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!me || me.level) return <>{children}</>;

  async function confirm() {
    if (!choice) return;
    setBusy(true);
    setErr(null);
    try {
      await backend.setMyLevel(choice);
      await refreshUser();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save. Try again.');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg }}>
        <H1>Which circuit are you in?</H1>
        <Body muted>
          Your account is for one circuit. You'll see its competitions, cases and rankings, and register, judge and coach only there. You can't switch later without asking a site admin.
        </Body>
        {LEVELS.map((l) => (
          <Card key={l.id} onPress={() => setChoice(l.id)} style={{ borderWidth: 2, borderColor: choice === l.id ? c.accent : 'transparent' }}>
            <H2>{l.label}</H2>
            {!l.live && <Body muted>Opening soon. Competitions appear as organizers add them.</Body>}
          </Card>
        ))}
        {err && <Body style={{ color: c.bad }}>{err}</Body>}
        <View>
          <Button title={choice ? `Continue with ${LEVELS.find((l) => l.id === choice)!.label}` : 'Choose one above'} onPress={confirm} disabled={!choice || busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
