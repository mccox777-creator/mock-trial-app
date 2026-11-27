import { router } from 'expo-router';
import { Body, Button, Card, Empty, H2, Label, LevelSwitcher, Loading, Pill, Row, Screen } from '../../components/ui';
import { useLevelData, useStore } from '../../lib/store';
import { fmtDateTime } from '../../lib/format';
import { KIND_LABEL } from '../../lib/labels';


export default function BulletinsScreen() {
  const d = useLevelData();
  const { me } = useStore();
  if (!d) return <Loading />;
  const directs = me ? d.tournaments.some((t) => t.directorIds.includes(me.id)) || d.cases.some((c) => c.createdBy === me.id) : false;
  const list = [...d.bulletins].sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  return (
    <Screen>
      <LevelSwitcher />
      {directs && <Button title="Post a bulletin" kind="secondary" onPress={() => router.push('/bulletin/new')} />}
      {list.length === 0 ? (
        <Empty title="No bulletins yet" body="Schedule changes, case corrections, and results show up here instead of in your inbox." />
      ) : (
        list.map((b) => {
          const t = b.tournamentId ? d.tournaments.find((x) => x.id === b.tournamentId) : null;
          const cs = b.caseId ? d.cases.find((x) => x.id === b.caseId) : null;
          return (
            <Card key={b.id} onPress={t ? () => router.push(`/tournament/${t.id}`) : cs ? () => router.push(`/case/${cs.id}`) : undefined}>
              <Row>
                <Pill text={KIND_LABEL[b.kind]} tone={b.kind === 'case' ? 'warn' : b.kind === 'results' ? 'good' : 'accent'} />
                <Label>{fmtDateTime(b.postedAt)}</Label>
              </Row>
              <H2>{b.title}</H2>
              <Body>{b.body}</Body>
              {(t || cs) && <Body muted>{t ? t.name : cs!.title}</Body>}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
