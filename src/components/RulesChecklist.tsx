import { Pressable, Text, TextInput, View } from 'react-native';
import { Label } from './ui';
import { RULE_GROUPS, type RuleDef, type RuleSet } from '../lib/rules';
import { radius, space, useTheme } from '../lib/theme';

/** The organizer's rules checklist: tick what applies, fill in any minutes or limits. */
export function RulesChecklist({ rules, onChange }: { rules: RuleSet; onChange: (next: RuleSet) => void }) {
  return (
    <View style={{ gap: space.lg }}>
      {RULE_GROUPS.map((g) => (
        <View key={g.title} style={{ gap: space.sm }}>
          <Label>{g.title}</Label>
          {g.rules.map((r) => (
            <RuleRow key={r.id} rule={r} rules={rules} onChange={onChange} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A tickable row: label, optional help, and optional detail shown when ticked. */
export function CheckRow({ label, help, on, onToggle, children }: { label: string; help?: string; on: boolean; onToggle: () => void; children?: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ borderWidth: 1, borderColor: on ? c.accent : c.line, borderRadius: radius.md, backgroundColor: c.surface }}>
      <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', gap: space.md, padding: space.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 22, height: 22, borderRadius: 5, marginTop: 1, borderWidth: 2,
            borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {on && <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 14, lineHeight: 16 }}>✓</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{label}</Text>
          {help && <Text style={{ color: c.muted, fontSize: 13 }}>{help}</Text>}
        </View>
      </Pressable>
      {on && children}
    </View>
  );
}

function RuleRow({ rule, rules, onChange }: { rule: RuleDef; rules: RuleSet; onChange: (next: RuleSet) => void }) {
  const c = useTheme();
  const on = rules[rule.id] === true;
  const toggle = () => {
    const next = { ...rules, [rule.id]: !on };
    if (!on && rule.value && next[rule.value.id] === undefined) next[rule.value.id] = rule.value.default;
    onChange(next);
  };
  const raw = rule.value ? rules[rule.value.id] : undefined;
  return (
    <View style={{ borderWidth: 1, borderColor: on ? c.accent : c.line, borderRadius: radius.md, backgroundColor: c.surface }}>
      <Pressable onPress={toggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={{ flexDirection: 'row', gap: space.md, padding: space.md, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 22, height: 22, borderRadius: 5, marginTop: 1, borderWidth: 2,
            borderColor: on ? c.accent : c.muted, backgroundColor: on ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {on && <Text style={{ color: c.accentInk, fontWeight: '800', fontSize: 14, lineHeight: 16 }}>✓</Text>}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{rule.label}</Text>
          {rule.help && <Text style={{ color: c.muted, fontSize: 13 }}>{rule.help}</Text>}
        </View>
      </Pressable>
      {on && rule.value && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, paddingLeft: space.md + 22 + space.md }}>
          <Text style={{ color: c.muted, fontSize: 13, flexShrink: 1 }}>{rule.value.label}</Text>
          <TextInput
            value={raw === undefined ? '' : String(raw)}
            onChangeText={(v) => {
              const digits = v.replace(/[^0-9]/g, '');
              onChange({ ...rules, [rule.value!.id]: digits === '' ? '' : Number(digits) });
            }}
            keyboardType="number-pad"
            accessibilityLabel={`${rule.label}: ${rule.value.label}`}
            style={{ width: 64, borderWidth: 1, borderColor: c.line, borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8, color: c.ink, backgroundColor: c.bg, textAlign: 'center', fontSize: 15 }}
          />
          <Text style={{ color: c.muted, fontSize: 13 }}>{rule.value.unit}</Text>
        </View>
      )}
    </View>
  );
}
