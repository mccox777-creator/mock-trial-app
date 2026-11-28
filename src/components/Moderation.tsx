import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, Field, H2, Label, Pill, Row, Segmented } from './ui';
import { useStore } from '../lib/store';
import type { ReportKind, ReportReason, Tournament } from '../lib/types';

/** Listed for everyone: approved by a platform admin (or by being from an approved organizer) and not taken down. */
export const isListed = (t: Tournament) => t.approved !== false && !t.hidden;

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'fake', label: 'Fake' },
  { id: 'spam', label: 'Spam' },
  { id: 'abusive', label: 'Abusive' },
  { id: 'other', label: 'Other' },
];

/** "Report" link that opens a short form. Goes to the platform admins only. */
export function ReportButton({ kind, targetId, what, compact }: { kind: ReportKind; targetId: string; what: string; compact?: boolean }) {
  const { me, backend } = useStore();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('fake');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  if (done) return <Body muted>{done}</Body>;
  if (!open)
    return compact ? (
      <Text accessibilityRole="button" onPress={() => setOpen(true)} style={{ color: '#8A94A6', fontSize: 12, textDecorationLine: 'underline' }}>
        Report
      </Text>
    ) : (
      <Button small kind="ghost" title={`Report this ${what}`} onPress={() => setOpen(true)} />
    );
  return (
    <Card>
      <H2>{`Report this ${what}`}</H2>
      <Body muted>Only the site's admins see reports. Tell them what is wrong.</Body>
      <Segmented value={reason} options={REASONS} onChange={setReason} />
      <Field label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
      <Row>
        <Button
          small
          title="Send report"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await backend.report(kind, targetId, reason, details);
              setDone('Thanks. The admins will look at it.');
            } catch (e) {
              setDone(e instanceof Error ? e.message : 'Could not send the report.');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Button small kind="ghost" title="Cancel" onPress={() => setOpen(false)} />
      </Row>
    </Card>
  );
}

/** On the Me tab: ask to be approved as an organizer, or see where the request stands. */
export function OrganizerCard() {
  const { me, backend, refreshUser } = useStore();
  const [form, setForm] = useState({ name: me?.name ?? '', school: '', role: '', note: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const status = me.organizer ?? 'none';
  const adminCard = me.isAdmin ? (
    <Card onPress={() => router.push('/admin')}>
      <Row>
        <H2>Admin</H2>
        <Pill text={me.isOwner ? 'Owner' : 'Admin'} tone="good" />
      </Row>
      <Body muted>
        {me.isOwner
          ? 'Approve organizers, review listings, handle reports, and choose who the admins are.'
          : 'Approve organizers, review competitions waiting to be listed, and handle reports.'}
      </Body>
    </Card>
  ) : null;
  if (backend.kind === 'demo') return adminCard;

  return (
    <>
      {adminCard}
      {status === 'approved' ? null : status === 'pending' ? (
        <Card>
          <Row>
            <H2>Organizer approval</H2>
            <Pill text="Waiting" tone="warn" />
          </Row>
          <Body muted>Your request is with the site's admins. You can set up competitions now; they are listed for everyone once you are approved.</Body>
        </Card>
      ) : status === 'suspended' ? (
        <Card>
          <H2>Organizer access paused</H2>
          <Body muted>An admin has paused your organizer access. New competitions you make stay unlisted. Contact the site if this is a mistake.</Body>
        </Card>
      ) : (
        <Card>
          <H2>Run competitions</H2>
          <Body muted>
            {status === 'rejected'
              ? 'Your last request was not approved. You can send a new one with more detail.'
              : 'To keep fake competitions off the site, a site admin approves each organizer once. Until then, competitions you make are visible only to you.'}
          </Body>
          <Label>About you</Label>
          <Field label="Your name" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} maxLength={200} />
          <Field label="School or organization" value={form.school} onChangeText={(v) => setForm({ ...form, school: v })} maxLength={200} />
          <Field label="Your role" hint="For example: Director of Trial Advocacy" value={form.role} onChangeText={(v) => setForm({ ...form, role: v })} maxLength={200} />
          <Field label="Anything that helps (optional)" hint="A competition you run, or a link to your school page" value={form.note} onChangeText={(v) => setForm({ ...form, note: v })} multiline maxLength={1000} />
          {err && <Body style={{ color: '#B42318' }}>{err}</Body>}
          <Button
            title="Ask to be approved"
            disabled={busy || !form.name.trim() || !form.school.trim() || !form.role.trim()}
            onPress={async () => {
              setBusy(true);
              setErr(null);
              try {
                await backend.requestOrganizer(form);
                await refreshUser();
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Could not send the request.');
              } finally {
                setBusy(false);
              }
            }}
          />
        </Card>
      )}
    </>
  );
}
