import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Label, Pill, Row, Segmented } from './ui';
import { newId } from '../lib/store';
import { personKey } from '../lib/stats';
import { CLASS_YEARS, TRIAL_ROLES, trialRoleLabel, type ClassYear, type Level, type RosterEntry, type TrialRole } from '../lib/types';
import { radius, space, useTheme } from '../lib/theme';

/** A roster row being edited. id is set for rows already saved. */
export interface RosterDraft {
  id?: string;
  key: string;
  name: string;
  role: RosterEntry['role'];
  classYear: ClassYear | null;
  roles: TrialRole[];
}

type CaseKind = 'civil' | 'criminal' | undefined;

let seq = 0;
export const blankRow = (role: RosterEntry['role'], level: Level): RosterDraft => ({
  key: `new-${++seq}`, name: '', role, classYear: role === 'student' && level === 'law_school' ? '2L' : null, roles: [],
});

export const draftsFrom = (entries: RosterEntry[]): RosterDraft[] =>
  entries.map((e) => ({ id: e.id, key: e.id, name: e.name, role: e.role, classYear: e.classYear, roles: e.roles ?? [] }));

/** What's wrong with a roster, or null. Class years are asked for at law school competitions. */
export function rosterProblem(rows: RosterDraft[], level: Level): string | null {
  const filled = rows.filter((r) => r.name.trim());
  if (level === 'law_school' && filled.some((r) => r.role === 'student' && !r.classYear)) return 'Mark each student 2L, 3L or Other.';
  if (filled.some((r) => r.role === 'student' && r.roles.length === 0)) return 'Pick at least one part (attorney or witness, and side) for each student.';
  const names = filled.map((r) => `${r.role}:${r.name.trim().toLowerCase()}`);
  if (new Set(names).size !== names.length) return 'Someone is listed twice.';
  if (filled.length > 40) return 'A roster can list at most 40 people.';
  return null;
}

/** Save a roster: add new rows, update changed ones, remove rows that were taken out. */
export async function saveRoster(
  rows: RosterDraft[],
  existing: RosterEntry[],
  where: { tournamentId: string; registrationId: string; teamId: string },
  save: (row: RosterEntry) => Promise<void>,
  remove: (id: string) => Promise<void>,
) {
  const keep = rows.filter((r) => r.name.trim());
  for (const r of keep) {
    const before = r.id ? existing.find((e) => e.id === r.id) : undefined;
    const roles = r.role === 'student' ? TRIAL_ROLES.filter((x) => r.roles.includes(x)) : [];
    const row: RosterEntry = { ...where, id: r.id ?? newId('ro'), name: r.name.trim(), role: r.role, classYear: r.role === 'student' ? r.classYear : null, roles };
    if (before && before.name === row.name && before.role === row.role && before.classYear === row.classYear && (before.roles ?? []).join() === roles.join()) continue;
    await save(row);
  }
  for (const e of existing) if (!keep.some((r) => r.id === e.id)) await remove(e.id);
}

/** Editable list of a team's coaches and students for one competition. */
export function RosterEditor({ rows, onChange, level, kind }: { rows: RosterDraft[]; onChange: (rows: RosterDraft[]) => void; level: Level; kind?: CaseKind }) {
  const set = (key: string, patch: Partial<RosterDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const drop = (key: string) => onChange(rows.filter((r) => r.key !== key));
  const group = (role: RosterEntry['role']) => (
    <View style={{ gap: space.sm }}>
      <Label>{role === 'coach' ? 'Coaches' : 'Students'}</Label>
      {rows.filter((r) => r.role === role).map((r) => (
        <View key={r.key} style={{ gap: 6 }}>
          <Row style={{ flexWrap: 'nowrap' }}>
            <NameInput value={r.name} onChangeText={(name) => set(r.key, { name })} placeholder={role === 'coach' ? 'Coach name' : 'Student name'} />
            <RemoveButton onPress={() => drop(r.key)} />
          </Row>
          {role === 'student' && level === 'law_school' && (
            <Segmented<ClassYear> value={r.classYear ?? '2L'} onChange={(classYear) => set(r.key, { classYear })} options={CLASS_YEARS} />
          )}
          {role === 'student' && (
            <RoleToggles value={r.roles} kind={kind} onChange={(roles) => set(r.key, { roles })} />
          )}
        </View>
      ))}
      <Button small kind="secondary" title={role === 'coach' ? 'Add a coach' : 'Add a student'} onPress={() => onChange([...rows, blankRow(role, level)])} />
    </View>
  );
  return (
    <View style={{ gap: space.lg }}>
      {group('coach')}
      {group('student')}
    </View>
  );
}

/** Pick any of the four parts; a student who swings sides can play more than one. */
function RoleToggles({ value, onChange, kind }: { value: TrialRole[]; onChange: (v: TrialRole[]) => void; kind?: CaseKind }) {
  const c = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {TRIAL_ROLES.map((x) => {
        const on = value.includes(x);
        return (
          <Pressable key={x} onPress={() => onChange(on ? value.filter((v) => v !== x) : [...value, x])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accent : 'transparent' }}>
            <Text style={{ color: on ? c.accentInk : c.ink, fontWeight: '600', fontSize: 13 }}>{trialRoleLabel(x, kind)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function NameInput(props: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  const c = useTheme();
  return (
    <TextInput
      {...props}
      autoCapitalize="words"
      placeholderTextColor={c.muted}
      accessibilityLabel={props.placeholder}
      style={{ flex: 1, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 12, fontSize: 16, color: c.ink, backgroundColor: c.surface }}
    />
  );
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  const c = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Remove" hitSlop={8} style={{ paddingHorizontal: 10, paddingVertical: 8 }}>
      <Text style={{ color: c.muted, fontSize: 20, fontWeight: '600' }}>×</Text>
    </Pressable>
  );
}

/** Read-only roster. Names link to each person's stats page when results are public. */
export function RosterList({ entries, programId, linked, kind }: { entries: RosterEntry[]; programId?: string; linked: boolean; kind?: CaseKind }) {
  const c = useTheme();
  if (entries.length === 0) return <Body muted>No roster listed yet.</Body>;
  const coaches = entries.filter((e) => e.role === 'coach');
  const students = entries.filter((e) => e.role === 'student');
  const name = (e: RosterEntry) =>
    linked && programId ? (
      <Pressable key={e.id} accessibilityRole="link" onPress={() => router.push(`/stats/person?key=${encodeURIComponent(personKey(e.role, programId, e.name))}`)}>
        <Text style={{ color: c.accent, fontWeight: '600', fontSize: 15 }}>{e.name}</Text>
      </Pressable>
    ) : (
      <Text key={e.id} style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{e.name}</Text>
    );
  return (
    <View style={{ gap: 6 }}>
      {coaches.length > 0 && (
        <Row>
          <Body muted>{coaches.length === 1 ? 'Coach:' : 'Coaches:'}</Body>
          {coaches.map(name)}
        </Row>
      )}
      {students.map((e) => (
        <Row key={e.id}>
          {name(e)}
          {e.classYear && <Pill text={e.classYear === 'other' ? 'Other' : e.classYear} />}
          {(e.roles ?? []).length > 0 && <Body muted>{e.roles.map((x) => trialRoleLabel(x, kind)).join(', ')}</Body>}
        </Row>
      ))}
    </View>
  );
}
