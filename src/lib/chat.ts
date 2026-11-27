import type { AppData, ChatChannel, ChatRole, Profile, Tournament } from './types';

/** This person's role in a competition's chat, or null if they aren't part of it. Mirrors chat_role() in the database. */
export function chatRole(t: Tournament, me: Profile | null, data: AppData): ChatRole | null {
  if (!me) return null;
  if (t.directorIds.includes(me.id)) return 'organizer';
  if (data.judgeSignups.some((j) => j.tournamentId === t.id && j.userId === me.id && j.status === 'approved')) return 'judge';
  const teams = data.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').map((r) => r.teamId);
  if (teams.some((id) => me.coachOf?.includes(id))) return 'coach';
  if (teams.some((id) => me.teamIds.includes(id))) return 'competitor';
  return null;
}

export function channelsFor(role: ChatRole): { id: ChatChannel; label: string }[] {
  const all = { id: 'all' as const, label: 'Everyone' };
  if (role === 'organizer') return [all, { id: 'judges', label: 'Judges' }, { id: 'coaches', label: 'Coaches' }];
  if (role === 'judge') return [all, { id: 'judges', label: 'Judges' }];
  if (role === 'coach') return [all, { id: 'coaches', label: 'Coaches' }];
  return [all];
}

/** Who may post here. High school students read only; "announcements only" leaves just the organizer. */
export function canPost(t: Tournament, role: ChatRole | null, channel: ChatChannel): boolean {
  if (!role) return false;
  if (role === 'organizer') return true;
  if (t.chatReplies === false) return false;
  if (channel === 'judges') return role === 'judge';
  if (channel === 'coaches') return role === 'coach';
  if (role === 'competitor') return t.level !== 'high_school';
  return true;
}

export function postingNote(t: Tournament, role: ChatRole | null): string | null {
  if (role === 'organizer') return null;
  if (t.chatReplies === false) return 'Announcements only. The organizer has turned off replies.';
  if (role === 'competitor' && t.level === 'high_school') return 'Students can read the chat. Your coach can reply for your team.';
  return null;
}
