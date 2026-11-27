import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { radius, space, useTheme } from '../lib/theme';
import { LEVELS, type Level, type Tournament } from '../lib/types';
import { todayLocal } from '../lib/format';
import { useStore } from '../lib/store';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' });

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const c = useTheme();
  if (!scroll) return <View style={{ flex: 1, backgroundColor: c.bg, padding: space.lg }}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const c = useTheme();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line, padding: space.lg, gap: space.sm };
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.75 }]} accessibilityRole="button">
        {children}
      </Pressable>
    );
  return <View style={[base, style]}>{children}</View>;
}

type TxtProps = { children: React.ReactNode; muted?: boolean; style?: object; numberOfLines?: number };

export function H1({ children, style }: TxtProps) {
  const c = useTheme();
  return <Text style={[{ fontSize: 24, fontWeight: '800', color: c.ink, letterSpacing: -0.3 }, style]}>{children}</Text>;
}
export function H2({ children, style, numberOfLines }: TxtProps) {
  const c = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 17, fontWeight: '700', color: c.ink }, style]}>{children}</Text>;
}
export function Body({ children, muted, style, numberOfLines }: TxtProps) {
  const c = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: 15, lineHeight: 21, color: muted ? c.muted : c.ink }, style]}>{children}</Text>;
}
export function Label({ children, style }: TxtProps) {
  const c = useTheme();
  return <Text style={[{ fontSize: 12, fontWeight: '700', letterSpacing: 0.8, color: c.muted, textTransform: 'uppercase' }, style]}>{children}</Text>;
}
export function Mono({ children, muted, style }: TxtProps) {
  const c = useTheme();
  return <Text style={[{ fontSize: 13, fontVariant: ['tabular-nums'], color: muted ? c.muted : c.ink, fontFamily: MONO }, style]}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled, small }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'ghost'; disabled?: boolean; small?: boolean }) {
  const c = useTheme();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.bad : kind === 'secondary' ? c.surfaceAlt : 'transparent';
  const fg = kind === 'primary' ? c.accentInk : kind === 'danger' ? '#FFFFFF' : c.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.md,
        paddingVertical: small ? 8 : 13,
        paddingHorizontal: small ? 12 : 18,
        alignItems: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        borderWidth: kind === 'ghost' ? 1 : 0,
        borderColor: c.line,
      })}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>
    </Pressable>
  );
}

export function Pill({ text, tone = 'neutral' }: { text: string; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' }) {
  const c = useTheme();
  const color = tone === 'good' ? c.good : tone === 'warn' ? c.warn : tone === 'bad' ? c.bad : tone === 'accent' ? c.accent : c.muted;
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: color, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** Exhibit-sticker style side tag: P (plaintiff/prosecution) yellow, D (defense) blue. */
export function SideTag({ side, kind }: { side: 'p' | 'd'; kind?: 'civil' | 'criminal' }) {
  const c = useTheme();
  const label = side === 'd' ? 'DEF' : kind === 'criminal' ? 'PROS' : 'PL';
  return (
    <View style={{ backgroundColor: side === 'p' ? c.plaintiff : c.defense, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 44, alignItems: 'center' }}>
      <Text style={{ color: side === 'p' ? c.plaintiffInk : c.defenseInk, fontSize: 11, fontWeight: '800', letterSpacing: 0.6 }}>{label}</Text>
    </View>
  );
}

export function Field({ label, hint, error, ...props }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.ink, fontWeight: '600', fontSize: 14 }}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[
          { borderWidth: 1, borderColor: error ? c.bad : c.line, borderRadius: radius.md, padding: 12, fontSize: 16, color: c.ink, backgroundColor: c.surface },
          props.multiline && { minHeight: 96, textAlignVertical: 'top' },
        ]}
      />
      {error ? <Text style={{ color: c.bad, fontSize: 13 }}>{error}</Text> : hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surfaceAlt, borderRadius: radius.md, padding: 3, gap: 3 }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: on ? c.surface : 'transparent', alignItems: 'center' }}>
            <Text style={{ fontWeight: on ? '700' : '500', color: on ? c.ink : c.muted, fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LevelSwitcher() {
  const { level, setLevel } = useStore();
  return <Segmented<Level> value={level} options={LEVELS.map((l) => ({ id: l.id, label: l.label }))} onChange={setLevel} />;
}

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ padding: space.xl, borderRadius: radius.lg, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, gap: space.sm, alignItems: 'flex-start' }}>
      <H2>{title}</H2>
      <Body muted>{body}</Body>
      {action}
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }, style]}>{children}</View>;
}

export function Loading() {
  return (
    <Screen>
      <Body muted>Loading…</Body>
    </Screen>
  );
}

/** Status a viewer should see, derived from dates so it never goes stale. */
export function effectiveStatus(t: Tournament): { text: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'accent' } {
  const today = todayLocal();
  if (t.status === 'draft') return { text: 'Draft', tone: 'neutral' };
  if (t.status === 'final' || t.endDate < today) return { text: 'Final', tone: 'neutral' };
  if (t.startDate <= today) return { text: 'In session', tone: 'good' };
  if (t.status === 'registration_open' && t.registrationDeadline >= today) return { text: 'Registration open', tone: 'accent' };
  if (t.status === 'in_progress') return { text: 'Pairings posted', tone: 'accent' };
  return { text: 'Registration closed', tone: 'warn' };
}

export function DateBlock({ date }: { date: string }) {
  const c = useTheme();
  const [, m, d] = date.split('-').map(Number);
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m - 1];
  return (
    <View style={{ width: 52, borderRadius: radius.md, backgroundColor: c.surfaceAlt, alignItems: 'center', paddingVertical: 6 }}>
      <Text style={{ fontSize: 11, fontWeight: '800', color: c.accent, letterSpacing: 0.8 }}>{mon}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: c.ink }}>{d}</Text>
    </View>
  );
}
