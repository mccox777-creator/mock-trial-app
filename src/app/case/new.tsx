import { useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Field, Label, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { isValidDateTime } from '../../lib/format';
import { LEVELS, type CaseKind, type Level } from '../../lib/types';

export default function NewCaseScreen() {
  const { me, level: current, save } = useStore();
  const [level, setLevel] = useState<Level>(current);
  const [title, setTitle] = useState('');
  const [docket, setDocket] = useState('');
  const [kind, setKind] = useState<CaseKind>('civil');
  const [summary, setSummary] = useState('');
  const [releaseAt, setReleaseAt] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!me) return <Screen><Body>Sign in from the Me tab to release a case.</Body></Screen>;

  return (
    <Screen>
      {!me.level && (
        <View style={{ gap: 6 }}>
          <Label>Circuit</Label>
          <Segmented<Level> value={level} onChange={setLevel} options={LEVELS.map((l) => ({ id: l.id, label: l.label }))} />
        </View>
      )}
      <Field label="Case caption" value={title} onChangeText={setTitle} placeholder="Harmon Logistics, Inc. v. Pryce" />
      <Field label="Docket number" value={docket} onChangeText={setDocket} placeholder="No. 2026-CV-1187" />
      <Segmented<CaseKind> value={kind} onChange={setKind} options={[{ id: 'civil', label: 'Civil' }, { id: 'criminal', label: 'Criminal' }]} />
      <Field label="Summary teams see before release" value={summary} onChangeText={setSummary} multiline />
      <Field label="Release date and time" value={releaseAt} onChangeText={setReleaseAt} placeholder="2026-12-15T12:00" hint="Files stay hidden from teams until this moment, then unlock for everyone at once." />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title="Create case"
        onPress={async () => {
          if (!title.trim()) return setErr('Add the case caption.');
          if (!isValidDateTime(releaseAt)) return setErr('Release time must look like 2026-12-15T12:00.');
          const id = newId('case');
          await save('cases', { id, level, title: title.trim(), docket: docket.trim(), kind, summary: summary.trim(), releaseAt, createdBy: me.id });
          router.replace(`/case/${id}`);
        }}
      />
    </Screen>
  );
}
