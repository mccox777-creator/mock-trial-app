import { useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Empty, Pill, Row, Segmented } from './ui';
import { newId, useStore } from '../lib/store';
import { canPost, channelsFor, chatRole, postingNote } from '../lib/chat';
import { fmtDateTime } from '../lib/format';
import type { ChatChannel, Message, Tournament } from '../lib/types';
import { radius, space, useTheme } from '../lib/theme';

const ROLE_LABEL: Record<string, string> = { organizer: 'Organizer', judge: 'Judge', coach: 'Coach', competitor: 'Competitor' };

/** Group chat for one competition. Everyone, plus judges-only and coaches-only rooms. No private messages. */
export function ChatPanel({ t }: { t: Tournament }) {
  const c = useTheme();
  const { data, me, save, remove } = useStore();
  const [channel, setChannel] = useState<ChatChannel>('all');
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const role = data ? chatRole(t, me, data) : null;
  const msgs = useMemo(
    () => (data ? data.messages.filter((m) => m.tournamentId === t.id && m.channel === channel).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []),
    [data, t.id, channel],
  );
  if (!data || !role) return <Empty title="Chat is for this competition's teams, judges, and organizer" body="Once your team or your judging is confirmed, the conversation shows up here." />;
  const channels = channelsFor(role);
  const postable = canPost(t, role, channel);
  const note = postingNote(t, role);

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setErr(null);
    const m: Message = { id: newId('msg'), tournamentId: t.id, channel, authorId: me!.id, authorName: me!.name, authorRole: role!, body: body.slice(0, 2000), createdAt: new Date().toISOString() };
    try {
      await save('messages', m);
      setDraft('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send. Try again.');
    }
    setBusy(false);
  }

  return (
    <>
      {channels.length > 1 && <Segmented value={channel} onChange={setChannel} options={channels} />}
      {role === 'organizer' && (
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <Body muted style={{ flex: 1 }}>
            {t.chatReplies === false ? 'Announcements only: just you can post.' : 'Judges and coaches can reply.'}
            {t.level === 'high_school' ? ' High school students can read but never post.' : ''}
          </Body>
          <Button small kind="ghost" title={t.chatReplies === false ? 'Allow replies' : 'Announcements only'} onPress={() => save('tournaments', { ...t, chatReplies: t.chatReplies === false })} />
        </Row>
      )}
      {msgs.length === 0 ? (
        <Body muted>No messages here yet.</Body>
      ) : (
        msgs.map((m) => {
          const mine = m.authorId === me?.id;
          const canDelete = mine || role === 'organizer';
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', gap: 2 }}>
              <Row style={{ gap: 6 }}>
                <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>{mine ? 'You' : m.authorName || ROLE_LABEL[m.authorRole] || 'Member'}</Text>
                {m.authorRole === 'organizer' && <Pill text="Organizer" tone="accent" />}
                {m.authorRole === 'judge' && <Pill text="Judge" />}
                {m.authorRole === 'coach' && <Pill text="Coach" />}
              </Row>
              <Pressable
                onLongPress={canDelete ? () => remove('messages', m.id) : undefined}
                accessibilityHint={canDelete ? 'Long press to delete' : undefined}
                style={{ backgroundColor: mine ? c.accent : c.surface, borderWidth: mine ? 0 : 1, borderColor: c.line, borderRadius: radius.lg, paddingVertical: 8, paddingHorizontal: 12 }}
              >
                <Text style={{ color: mine ? c.accentInk : c.ink, fontSize: 15 }}>{m.body}</Text>
              </Pressable>
              <Text style={{ color: c.muted, fontSize: 11, alignSelf: mine ? 'flex-end' : 'flex-start' }}>{fmtDateTime(m.createdAt.slice(0, 16))}</Text>
            </View>
          );
        })
      )}
      {postable ? (
        <Card>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={channel === 'all' ? 'Message everyone in this competition' : `Message ${channel}`}
            placeholderTextColor={c.muted}
            multiline
            maxLength={2000}
            accessibilityLabel="Message"
            style={{ minHeight: 44, color: c.ink, fontSize: 15, paddingVertical: 6 }}
          />
          {err && <Body style={{ color: c.bad }}>{err}</Body>}
          <Button title="Send" onPress={send} disabled={busy || !draft.trim()} />
        </Card>
      ) : (
        note && <Body muted>{note}</Body>
      )}
      <Body muted style={{ fontSize: 12 }}>
        Group chat only, no private messages. The organizer can remove any message, and every message is kept in the competition's history.
      </Body>
    </>
  );
}
