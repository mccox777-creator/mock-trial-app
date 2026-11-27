import { useCallback, useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Body, Button, Card, Empty, H1, H2, Label, Loading, Pill, Row, Screen, Segmented } from '../components/ui';
import { useStore } from '../lib/store';
import { fmtDateTime, fmtRange } from '../lib/format';
import type { OrganizerRequest, Report } from '../lib/types';

const KIND: Record<Report['kind'], string> = { tournament: 'Competition', bulletin: 'Bulletin', message: 'Chat message', case: 'Case', team: 'Team', user: 'Person' };

/** Platform admins only. The database refuses these actions for anyone else, so this screen is only a convenience. */
export default function AdminScreen() {
  const { me, data, backend, refresh } = useStore();
  const [tab, setTab] = useState<'organizers' | 'competitions' | 'reports'>('organizers');
  const [requests, setRequests] = useState<OrganizerRequest[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rq, rp] = await Promise.all([backend.admin.organizerRequests(), backend.admin.reports()]);
      setRequests(rq);
      setReports(rp);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load.');
    }
  }, [backend]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (f: () => Promise<void>) => {
    setErr(null);
    try {
      await f();
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not work.');
    }
  };

  if (!me?.isAdmin) return <Screen><Empty title="Admins only" body="This page is for the site's admins." /></Screen>;
  if (!data || !requests || !reports) return <Loading />;

  const waiting = data.tournaments.filter((t) => t.status !== 'draft' && t.approved === false && !t.hidden);
  const hidden = data.tournaments.filter((t) => t.hidden);
  const openReports = reports.filter((r) => r.status === 'open');

  return (
    <Screen>
      <H1>Admin</H1>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { id: 'organizers', label: `Organizers (${requests.filter((r) => r.status === 'pending').length})` },
          { id: 'competitions', label: `Listings (${waiting.length})` },
          { id: 'reports', label: `Reports (${openReports.length})` },
        ]}
      />
      {err && <Body style={{ color: '#B42318' }}>{err}</Body>}

      {tab === 'organizers' &&
        (requests.length === 0 ? (
          <Empty title="No requests" body="People who ask to run competitions show up here." />
        ) : (
          requests.map((r) => (
            <Card key={r.userId}>
              <Row>
                <H2>{r.name}</H2>
                <Pill text={r.status} tone={r.status === 'approved' ? 'good' : r.status === 'pending' ? 'warn' : 'bad'} />
              </Row>
              <Body>{`${r.role}, ${r.school}`}</Body>
              {!!r.note && <Body muted>{r.note}</Body>}
              <Body muted>{`Asked ${fmtDateTime(r.requestedAt)}`}</Body>
              <Row>
                {r.status !== 'approved' && <Button small title="Approve" onPress={() => act(() => backend.admin.decideOrganizer(r.userId, 'approved'))} />}
                {r.status === 'pending' && <Button small kind="ghost" title="Turn down" onPress={() => act(() => backend.admin.decideOrganizer(r.userId, 'rejected'))} />}
                {r.status === 'approved' && <Button small kind="danger" title="Pause access" onPress={() => act(() => backend.admin.decideOrganizer(r.userId, 'suspended'))} />}
              </Row>
            </Card>
          ))
        ))}

      {tab === 'competitions' && (
        <>
          <Label>Waiting to be listed</Label>
          {waiting.length === 0 ? (
            <Body muted>Nothing waiting. Competitions from approved organizers are listed at once.</Body>
          ) : (
            waiting.map((t) => (
              <Card key={t.id}>
                <H2>{t.name}</H2>
                <Body muted>{[fmtRange(t.startDate, t.endDate), t.city, t.hostName].filter(Boolean).join(' · ')}</Body>
                <Row>
                  <Button small title="List it" onPress={() => act(() => backend.admin.setListing(t.id, { approved: true }))} />
                  <Button small kind="danger" title="Take down" onPress={() => act(() => backend.admin.setListing(t.id, { hidden: true }))} />
                  <Button small kind="ghost" title="Open" onPress={() => router.push(`/tournament/${t.id}`)} />
                </Row>
              </Card>
            ))
          )}
          <Label>Taken down</Label>
          {hidden.length === 0 ? (
            <Body muted>None.</Body>
          ) : (
            hidden.map((t) => (
              <Card key={t.id}>
                <H2>{t.name}</H2>
                <Button small kind="secondary" title="Put back" onPress={() => act(() => backend.admin.setListing(t.id, { hidden: false }))} />
              </Card>
            ))
          )}
        </>
      )}

      {tab === 'reports' &&
        (reports.length === 0 ? (
          <Empty title="No reports" body="When someone reports a competition, post or person, it shows up here." />
        ) : (
          reports.map((r) => {
            const t = r.kind === 'tournament' ? data.tournaments.find((x) => x.id === r.targetId) : undefined;
            return (
              <Card key={r.id}>
                <Row>
                  <H2>{`${KIND[r.kind]}: ${r.reason}`}</H2>
                  <Pill text={r.status} tone={r.status === 'open' ? 'warn' : 'neutral'} />
                </Row>
                <Body>{t ? t.name : r.targetId}</Body>
                {!!r.details && <Body muted>{r.details}</Body>}
                <Body muted>{fmtDateTime(r.createdAt)}</Body>
                <Row>
                  {t && <Button small kind="ghost" title="Open" onPress={() => router.push(`/tournament/${t.id}`)} />}
                  {t && !t.hidden && <Button small kind="danger" title="Take down" onPress={() => act(async () => { await backend.admin.setListing(t.id, { hidden: true }); await backend.admin.resolveReport(r.id, 'resolved'); })} />}
                  {(r.kind === 'bulletin' || r.kind === 'message') && r.status === 'open' && (
                    <Button small kind="danger" title="Delete it" onPress={() => act(async () => { await backend.admin.removePost(r.kind as 'bulletin' | 'message', r.targetId); await backend.admin.resolveReport(r.id, 'resolved'); })} />
                  )}
                  {r.status === 'open' && <Button small kind="secondary" title="Resolved" onPress={() => act(() => backend.admin.resolveReport(r.id, 'resolved'))} />}
                  {r.status === 'open' && <Button small kind="ghost" title="Dismiss" onPress={() => act(() => backend.admin.resolveReport(r.id, 'dismissed'))} />}
                </Row>
              </Card>
            );
          })
        ))}
    </Screen>
  );
}
