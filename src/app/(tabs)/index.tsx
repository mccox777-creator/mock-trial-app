import { router } from 'expo-router';
import { View } from 'react-native';
import { Body, Button, Card, DateBlock, Empty, H2, Label, LevelSwitcher, Loading, Pill, Row, Screen, effectiveStatus } from '../../components/ui';
import { useLevelData, useStore } from '../../lib/store';
import { fmtDate, fmtDateTime, fmtRange, nowLocal, todayLocal } from '../../lib/format';
import { LEVELS } from '../../lib/types';
import { space } from '../../lib/theme';

export default function ScheduleScreen() {
  const d = useLevelData();
  const { me, level, error } = useStore();
  if (!d) return error ? <Screen><Body>{error}</Body></Screen> : <Loading />;

  const today = todayLocal();
  // Unlisted (waiting for approval) and taken-down competitions show only to their organizers.
  const visible = d.tournaments.filter((t) => (t.status !== 'draft' && t.approved !== false && !t.hidden) || (me && t.directorIds.includes(me.id)));
  const upcoming = visible.filter((t) => t.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = visible.filter((t) => t.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
  const nextRelease = d.cases.filter((c) => c.releaseAt > nowLocal()).sort((a, b) => a.releaseAt.localeCompare(b.releaseAt))[0];
  const nextDeadline = upcoming.filter((t) => t.status === 'registration_open' && t.registrationDeadline >= today).sort((a, b) => a.registrationDeadline.localeCompare(b.registrationDeadline))[0];
  const levelLabel = LEVELS.find((l) => l.id === level)!.label;
  // Competitions whose organizers asked for judges, that this person hasn't volunteered for yet.
  const judgeCalls = upcoming.filter(
    (t) => d.bulletins.some((b) => b.tournamentId === t.id && b.kind === 'judges_needed') && !(me && d.judgeSignups.some((j) => j.tournamentId === t.id && j.userId === me.id)) && !(me && t.directorIds.includes(me.id)),
  );

  return (
    <Screen>
      <LevelSwitcher />

      {(nextDeadline || nextRelease) && (
        <Card>
          <Label>Coming up</Label>
          {nextDeadline && (
            <Body>
              Registration for <Body style={{ fontWeight: '700' }}>{nextDeadline.name}</Body> closes {fmtDate(nextDeadline.registrationDeadline)}.
            </Body>
          )}
          {nextRelease && (
            <Body>
              <Body style={{ fontWeight: '700' }}>{nextRelease.title}</Body> releases {fmtDateTime(nextRelease.releaseAt)}.
            </Body>
          )}
        </Card>
      )}

      <Button title="Create a competition" onPress={() => router.push('/tournament/new')} />

      {judgeCalls.length > 0 && (
        <>
          <Label style={{ marginTop: space.sm }}>Judges needed</Label>
          {judgeCalls.map((t) => (
            <Card key={t.id}>
              <H2 numberOfLines={2}>{t.name}</H2>
              <Body muted>
                {fmtRange(t.startDate, t.endDate)} · {t.city || t.hostName}
              </Body>
              <Button small title={me ? 'Volunteer to judge' : 'Sign in to volunteer'} onPress={() => router.push(me ? `/tournament/judge?id=${t.id}` : '/account')} />
            </Card>
          ))}
        </>
      )}

      <Label style={{ marginTop: space.sm }}>Upcoming and in session</Label>
      {upcoming.length === 0 ? (
        <Empty
          title={`No ${levelLabel.toLowerCase()} competitions yet`}
          body="Tournament directors list their competitions here. Teams sign up from the competition page."
        />
      ) : (
        upcoming.map((t) => <TournamentRow key={t.id} id={t.id} />)
      )}

      {past.length > 0 && <Label style={{ marginTop: space.sm }}>Completed this season</Label>}
      {past.map((t) => (
        <TournamentRow key={t.id} id={t.id} />
      ))}
    </Screen>
  );
}

function TournamentRow({ id }: { id: string }) {
  const d = useLevelData()!;
  const { me } = useStore();
  const t = d.tournaments.find((x) => x.id === id)!;
  const status = effectiveStatus(t);
  const approved = d.registrations.filter((r) => r.tournamentId === t.id && r.status === 'approved').length;
  const isDirector = !!me && t.directorIds.includes(me.id);
  return (
    <Card onPress={() => router.push(`/tournament/${t.id}`)}>
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <DateBlock date={t.startDate} />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <H2 numberOfLines={2}>{t.name}</H2>
          <Body muted numberOfLines={1}>
            {fmtRange(t.startDate, t.endDate)} · {t.city || t.hostName}
          </Body>
          <Row>
            <Pill text={status.text} tone={status.tone} />
            {t.entryType === 'invitational' && <Pill text="Invitational" />}
            {status.text === 'Registration open' && t.entryType === 'open' && <Pill text={`${approved}/${t.teamCap} teams`} />}
            {isDirector && <Pill text="You organize" tone="accent" />}
          </Row>
        </View>
      </View>
    </Card>
  );
}
