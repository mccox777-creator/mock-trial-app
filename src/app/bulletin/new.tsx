import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Body, Button, Card, Field, H2, Label, Screen, Segmented } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { nowLocal } from '../../lib/format';
import type { BulletinKind } from '../../lib/types';

export default function NewBulletinScreen() {
  const { tournamentId, caseId } = useLocalSearchParams<{ tournamentId?: string; caseId?: string }>();
  const { data, me, level, save } = useStore();
  const mine = data && me ? data.tournaments.filter((t) => t.directorIds.includes(me.id)) : [];
  const [tid, setTid] = useState<string>(tournamentId ?? (caseId ? 'none' : mine[0]?.id ?? 'none'));
  const [kind, setKind] = useState<BulletinKind>(caseId ? 'case' : 'general');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [err, setErr] = useState<string | null>(null);

  if (!data || !me) return <Screen><Body>Sign in from the Me tab to post bulletins.</Body></Screen>;
  const cs = caseId ? data.cases.find((c) => c.id === caseId) : undefined;
  const t = data.tournaments.find((x) => x.id === tid);

  return (
    <Screen>
      {cs ? (
        <Card>
          <Label>Case bulletin for</Label>
          <H2>{cs.title}</H2>
        </Card>
      ) : mine.length > 0 ? (
        <>
          <Label>Competition</Label>
          <Segmented value={tid} onChange={setTid} options={mine.map((x) => ({ id: x.id, label: x.name }))} />
        </>
      ) : null}
      {!cs && (
        <Segmented<BulletinKind>
          value={kind}
          onChange={setKind}
          options={[{ id: 'general', label: 'News' }, { id: 'schedule', label: 'Schedule' }, { id: 'results', label: 'Results' }]}
        />
      )}
      <Field label="Headline" value={title} onChangeText={setTitle} placeholder="Round 3 moved to 2:30 PM" />
      <Field label="Details" value={body} onChangeText={setBody} multiline />
      <Body muted>Everyone following this circuit sees it in Bulletins. Push notifications arrive once accounts are live.</Body>
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title="Post bulletin"
        onPress={async () => {
          if (!title.trim() || !body.trim()) return setErr('Add a headline and details.');
          if (!cs && !t) return setErr('Choose which competition this is about.');
          await save('bulletins', {
            id: newId('b'), level: cs?.level ?? t?.level ?? level, tournamentId: cs ? null : t?.id ?? null, caseId: cs?.id ?? null,
            kind: cs ? 'case' : kind, title: title.trim(), body: body.trim(), postedAt: nowLocal(), postedBy: me.id,
          });
          router.back();
        }}
      />
    </Screen>
  );
}
