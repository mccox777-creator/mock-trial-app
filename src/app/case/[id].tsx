import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Body, Button, Card, Empty, Field, H1, H2, Label, Loading, Mono, Pill, Row, Screen } from '../../components/ui';
import { newId, useStore } from '../../lib/store';
import { fmtDateTime, nowLocal } from '../../lib/format';
import { space } from '../../lib/theme';

export default function CaseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, me } = useStore();
  if (!data) return <Loading />;
  const cs = data.cases.find((c) => c.id === id);
  if (!cs) return <Screen><Empty title="Case not found" body="It may have been withdrawn by its author." /></Screen>;

  const embargoed = cs.releaseAt > nowLocal();
  const owner = !!me && (cs.createdBy === me.id || data.tournaments.some((t) => t.caseId === cs.id && t.directorIds.includes(me.id)));
  const files = data.caseFiles.filter((f) => f.caseId === cs.id).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const bulletins = data.bulletins.filter((b) => b.caseId === cs.id).sort((a, b) => b.postedAt.localeCompare(a.postedAt));
  const used = data.tournaments.filter((t) => t.caseId === cs.id);

  return (
    <Screen>
      <Mono muted>{cs.docket}</Mono>
      <H1>{cs.title}</H1>
      <Row>
        <Pill text={cs.kind === 'criminal' ? 'Criminal' : 'Civil'} />
        {embargoed ? <Pill text={`Releases ${fmtDateTime(cs.releaseAt)}`} tone="warn" /> : <Pill text={`Released ${fmtDateTime(cs.releaseAt)}`} tone="good" />}
      </Row>
      <Body>{cs.summary}</Body>

      <Label style={{ marginTop: space.sm }}>Files</Label>
      {embargoed && !owner ? (
        <Empty title="Not released yet" body={`The case packet unlocks for every team at the same moment: ${fmtDateTime(cs.releaseAt)}. You'll get a bulletin when it does.`} />
      ) : files.length === 0 ? (
        <Body muted>No files uploaded yet.</Body>
      ) : (
        files.map((f) => (
          <Card key={f.id} onPress={f.url && /^(https|file|blob|content):/.test(f.url) ? () => WebBrowser.openBrowserAsync(f.url!) : undefined}>
            <Row style={{ justifyContent: 'space-between' }}>
              <H2 style={{ flex: 1 }}>{f.label}</H2>
              <Mono muted>{f.version}</Mono>
            </Row>
            <Body muted>
              Added {fmtDateTime(f.addedAt)}
              {f.url ? '' : ' · sample entry, no file attached'}
            </Body>
          </Card>
        ))
      )}
      {owner && <AddFile caseId={cs.id} />}

      {bulletins.length > 0 && <Label style={{ marginTop: space.sm }}>Case bulletins and errata</Label>}
      {bulletins.map((b) => (
        <Card key={b.id}>
          <Mono muted>{fmtDateTime(b.postedAt)}</Mono>
          <H2>{b.title}</H2>
          <Body>{b.body}</Body>
        </Card>
      ))}
      {owner && <Button title="Post a case bulletin" kind="secondary" onPress={() => router.push(`/bulletin/new?caseId=${cs.id}`)} />}

      {used.length > 0 && <Label style={{ marginTop: space.sm }}>Used at</Label>}
      {used.map((t) => (
        <Card key={t.id} onPress={() => router.push(`/tournament/${t.id}`)}>
          <H2>{t.name}</H2>
        </Card>
      ))}
    </Screen>
  );
}

function AddFile({ caseId }: { caseId: string }) {
  const { backend, save } = useStore();
  const [label, setLabel] = useState('');
  const [version, setVersion] = useState('v1.0');
  const [picked, setPicked] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!open) return <Button title="Upload a file" kind="secondary" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <H2>Upload a file</H2>
      <Field label="What is it?" value={label} onChangeText={setLabel} placeholder="Full case packet, or Exhibit 14 (corrected)" />
      <Field label="Version" value={version} onChangeText={setVersion} />
      <Button
        title={picked ? `Picked: ${picked.name}` : 'Choose a PDF or document'}
        kind="ghost"
        onPress={async () => {
          const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'] });
          if (!res.canceled) setPicked(res.assets[0]);
        }}
      />
      {err && <Body style={{ color: '#B3261E' }}>{err}</Body>}
      <Button
        title="Upload"
        disabled={busy}
        onPress={async () => {
          if (!label.trim() || !picked) return setErr('Name the file and choose it from your device.');
          setBusy(true);
          setErr(null);
          try {
            const url = await backend.uploadFile(picked.name, picked.uri, picked.mimeType ?? 'application/octet-stream');
            await save('caseFiles', { id: newId('cf'), caseId, label: label.trim(), version: version.trim() || 'v1.0', url, addedAt: nowLocal() });
            setOpen(false);
            setLabel('');
            setPicked(null);
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Upload failed. Try again on a stronger connection.');
          }
          setBusy(false);
        }}
      />
    </Card>
  );
}
