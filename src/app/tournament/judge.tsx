import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Field, H2, Label, Loading, Row, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { fmtRange, nowLocal } from '../../lib/format';
import { BACKGROUND_LABEL } from '../../lib/judging';
import type { JudgeBackground } from '../../lib/types';
import { radius, useTheme } from '../../lib/theme';

export default function JudgeSignupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me, save } = useStore();
  const c = useTheme();
  const t = data?.tournaments.find((x) => x.id === id);
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [background, setBackground] = useState<JudgeBackground>('attorney');
  const [rounds, setRounds] = useState<number[]>(() => Array.from({ length: t?.prelimRounds ?? 4 }, (_, i) => i + 1));
  const [conflicts, setConflicts] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!data) return <Loading />;
  if (!t) return <Screen><Body>Competition not found.</Body></Screen>;
  if (!me) return <Screen><Body>Sign in from the Me tab to volunteer.</Body></Screen>;

  return (
    <Screen>
      <Card>
        <Label>Volunteer to judge</Label>
        <H2>{t.name}</H2>
        <Body muted>
          {fmtRange(t.startDate, t.endDate)} · {t.city}
        </Body>
      </Card>
      <Field label="Your name as it should appear to the organizer" value={name} onChangeText={setName} />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
      <View style={{ gap: 6 }}>
        <Label>Background</Label>
        <Segmented<JudgeBackground>
          value={background}
          onChange={setBackground}
          options={[
            { id: 'judge', label: 'Judge' },
            { id: 'attorney', label: 'Attorney' },
            { id: 'alumni', label: 'Alumni' },
            { id: 'other', label: 'Other' },
          ]}
        />
        <Body muted>{BACKGROUND_LABEL[background]}</Body>
      </View>
      <View style={{ gap: 6 }}>
        <Label>Rounds you can judge</Label>
        <Row>
          {Array.from({ length: t.prelimRounds }, (_, i) => i + 1).map((r) => {
            const on = rounds.includes(r);
            return (
              <Pressable
                key={r}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setRounds((x) => (on ? x.filter((y) => y !== r) : [...x, r].sort()))}
                style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: c.surface }}
              >
                <Text style={{ color: on ? c.accent : c.ink, fontWeight: '700' }}>Round {r}</Text>
              </Pressable>
            );
          })}
        </Row>
      </View>
      <Field
        label="Conflicts (optional)"
        value={conflicts}
        onChangeText={setConflicts}
        placeholder="Schools you attended, coach, or work with"
        hint="You won't be assigned to trials involving these schools."
      />
      {err && <Body style={{ color: c.bad }}>{err}</Body>}
      <Button
        title="Send to the organizer"
        onPress={async () => {
          if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return setErr('Add your name and a valid email address.');
          if (rounds.length === 0) return setErr('Pick at least one round.');
          await save('judgeSignups', {
            id: newId('js'), tournamentId: t.id, userId: me.id, name: name.trim(), email: email.trim(), background, rounds, conflicts: conflicts.trim(),
            status: 'pending', createdAt: nowLocal(),
          });
          router.back();
        }}
      />
    </Screen>
  );
}
