import { router } from 'expo-router';
import { Body, Button, Card, Empty, H2, LevelSwitcher, Loading, Mono, Pill, Row, Screen } from '../../components/ui';
import { useLevelData, useStore } from '../../lib/store';
import { fmtDateTime, nowLocal } from '../../lib/format';

export default function CasesScreen() {
  const d = useLevelData();
  const { me } = useStore();
  if (!d) return <Loading />;
  const now = nowLocal();
  const cases = [...d.cases].sort((a, b) => b.releaseAt.localeCompare(a.releaseAt));

  return (
    <Screen>
      <LevelSwitcher />
      {me && <Button title="Release a case" kind="secondary" onPress={() => router.push('/case/new')} />}
      {cases.length === 0 ? (
        <Empty title="No case files yet" body="Case authors and tournament directors publish case packets here, with a release date and any later corrections." />
      ) : (
        cases.map((cs) => {
          const embargoed = cs.releaseAt > now;
          const files = d.caseFiles.filter((f) => f.caseId === cs.id);
          const latest = files.map((f) => f.version).sort().pop();
          const used = d.tournaments.filter((t) => t.caseId === cs.id).length;
          return (
            <Card key={cs.id} onPress={() => router.push(`/case/${cs.id}`)}>
              <Mono muted>{cs.docket}</Mono>
              <H2>{cs.title}</H2>
              <Body muted numberOfLines={2}>
                {cs.summary}
              </Body>
              <Row>
                <Pill text={cs.kind === 'criminal' ? 'Criminal' : 'Civil'} />
                {embargoed ? <Pill text={`Releases ${fmtDateTime(cs.releaseAt)}`} tone="warn" /> : <Pill text={latest ? `Released · ${latest}` : 'Released'} tone="good" />}
                {used > 0 && <Pill text={`${used} competition${used === 1 ? '' : 's'}`} />}
              </Row>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
