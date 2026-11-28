import { Pressable, Text, View } from 'react-native';
import { radius, space, useTheme } from '../lib/theme';

/** A wrapping row of choices, for lists too long for a segmented control. */
export function Chips<T extends string>({ value, options, onChange }: { value: T | null; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Pressable key={o.id} onPress={() => onChange(o.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, backgroundColor: on ? c.accent : c.surfaceAlt }}>
            <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
