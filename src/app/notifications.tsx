import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, Field, H2, Label, Loading, Pill, Row, Screen, Segmented } from '../components/ui';
import { CheckRow } from '../components/RulesChecklist';
import { useStore } from '../lib/store';
import { fmtDateTime } from '../lib/format';
import { LEVELS, type Level, type Notice, type NoticeKind, type NotificationPrefs } from '../lib/types';
import { space } from '../lib/theme';

const KINDS: { id: NoticeKind; label: string; help: string }[] = [
  { id: 'my_competitions', label: 'My competitions', help: 'Pairings, schedule changes and announcements for competitions you organize, judge, or compete in.' },
  { id: 'chat', label: 'Chat messages', help: 'New messages in those competitions. Phone alerts and inbox only, never email.' },
  { id: 'results', label: 'Results', help: 'When results are published for those competitions.' },
  { id: 'new_competition', label: 'New competitions', help: 'When a competition opens in a circuit you follow.' },
  { id: 'case_release', label: 'Case releases', help: 'New cases and corrections in a circuit you follow.' },
  { id: 'judges_needed', label: 'Calls for judges', help: 'When an organizer needs judges in a circuit you judge in.' },
];

export const DEFAULT_PREFS: NotificationPrefs = {
  levels: [],
  kinds: ['my_competitions', 'chat', 'results', 'new_competition', 'case_release', 'judges_needed'],
  push: true,
  email: true,
  emailDigest: false,
  willingToJudge: false,
  judgeLevels: [],
  judgeRegion: '',
};

const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);

/** Notification settings and inbox. */
export default function NotificationsScreen() {
  const { backend, me } = useStore();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [inbox, setInbox] = useState<Notice[]>([]);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!me) return;
    backend.getPrefs().then((p) => setPrefs({ ...DEFAULT_PREFS, ...(p ?? {}) }));
    backend.inbox().then(setInbox);
  }, [backend, me]);

  if (!me)
    return (
      <Screen>
        <Body>Sign in to choose your notifications.</Body>
        <Button title="Go to sign in" onPress={() => router.replace('/account')} />
      </Screen>
    );
  if (!prefs) return <Loading />;

  const update = (p: Partial<NotificationPrefs>) => {
    setPrefs({ ...prefs, ...p });
    setSaved('idle');
  };
  async function save() {
    setSaved('saving');
    try {
      await backend.savePrefs(prefs!);
      setSaved('saved');
    } catch {
      setSaved('error');
    }
  }
  const unread = inbox.filter((n) => !n.readAt);

  return (
    <Screen>
      {inbox.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Label>Inbox{unread.length ? ` · ${unread.length} new` : ''}</Label>
            {unread.length > 0 && (
              <Button
                small
                kind="ghost"
                title="Mark all read"
                onPress={async () => {
                  await backend.markRead(unread.map((n) => n.id));
                  setInbox(inbox.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
                }}
              />
            )}
          </Row>
          {inbox.slice(0, 10).map((n) => (
            <Card key={n.id} onPress={n.link ? () => router.push(n.link as never) : undefined}>
              <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                <H2 style={{ flex: 1 }}>{n.title}</H2>
                {!n.readAt && <Pill text="New" tone="accent" />}
              </Row>
              {n.body ? <Body>{n.body}</Body> : null}
              <Body muted>{fmtDateTime(n.createdAt.slice(0, 16))}</Body>
            </Card>
          ))}
        </View>
      )}

      <Label style={{ marginTop: space.sm }}>Circuits you follow</Label>
      <Body muted>For new competitions, case releases, and calls for judges. Anything about your own competitions reaches you either way.</Body>
      {LEVELS.map((l) => (
        <CheckRow key={l.id} label={l.label} on={prefs.levels.includes(l.id)} onToggle={() => update({ levels: toggle<Level>(prefs.levels, l.id) })} />
      ))}

      <Label style={{ marginTop: space.sm }}>What you hear about</Label>
      {KINDS.map((k) => (
        <CheckRow key={k.id} label={k.label} help={k.help} on={prefs.kinds.includes(k.id)} onToggle={() => update({ kinds: toggle(prefs.kinds, k.id) })} />
      ))}

      <Label style={{ marginTop: space.sm }}>How</Label>
      <CheckRow label="Phone alerts" help="Free. You can also turn them off in your phone's settings." on={prefs.push} onToggle={() => update({ push: !prefs.push })} />
      <CheckRow label="Email" help={`Sent to ${me.email}.`} on={prefs.email} onToggle={() => update({ email: !prefs.email })}>
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md }}>
          <Segmented value={prefs.emailDigest ? 'digest' : 'each'} onChange={(v) => update({ emailDigest: v === 'digest' })} options={[{ id: 'each', label: 'As they happen' }, { id: 'digest', label: 'Once a day' }]} />
        </View>
      </CheckRow>

      <Label style={{ marginTop: space.sm }}>Judging</Label>
      <CheckRow
        label="I'm willing to judge"
        help="Organizers looking for judges in your circuits can reach you. They never see your email until you volunteer for their competition."
        on={prefs.willingToJudge}
        onToggle={() => update({ willingToJudge: !prefs.willingToJudge })}
      >
        <View style={{ paddingHorizontal: space.md, paddingBottom: space.md, gap: space.sm }}>
          <Body muted>Circuits you'd judge</Body>
          {LEVELS.map((l) => (
            <CheckRow key={l.id} label={l.label} on={prefs.judgeLevels.includes(l.id)} onToggle={() => update({ judgeLevels: toggle<Level>(prefs.judgeLevels, l.id) })} />
          ))}
          <Field label="Your region (optional)" value={prefs.judgeRegion} onChangeText={(v) => update({ judgeRegion: v.slice(0, 100) })} placeholder="Midwest, or a city" />
        </View>
      </CheckRow>

      <Button title={saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : 'Save settings'} onPress={save} disabled={saved === 'saving'} />
      {saved === 'error' && <Body style={{ color: '#B3261E' }}>Could not save. Check your connection and try again.</Body>}
      {backend.kind === 'demo' && <Body muted>Demo mode: settings are kept on this device, and no alerts or emails are sent.</Body>}
    </Screen>
  );
}
