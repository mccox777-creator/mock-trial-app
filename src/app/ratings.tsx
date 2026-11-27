import { useMemo } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, H1, H2, Label, Loading, Screen } from '../components/ui';
import { CLASSES, chronological, eloFor, GAMES_PER_EVENT, PROVISIONAL_UNDER, START } from '../lib/elo';
import { useHistory } from '../lib/store';

/** Where the site publishes the rating data (public/ratings-data in the repository). */
const DATA = 'https://app.mocktrialcentral.com/ratings-data';
const CODE = 'https://github.com/mccox777-creator/mock-trial-app/blob/main';

const open = (url: string) => (Platform.OS === 'web' ? window.open(url, '_blank', 'noopener') : Linking.openURL(url));

const STEPS: { title: string; body: string[] }[] = [
  {
    title: '1. Everyone starts at 1500',
    body: ['A school gets a rating of 1500 at its first competition in the record (Spring 2023 onward).'],
  },
  {
    title: '2. Each competition is a set of games',
    body: [
      'A school’s finish is its best team’s finish: won (or qualified out of a regional), final, semifinal, quarterfinal, octofinal, or took part. A numbered place counts by its number, so 4th finishes ahead of 5th, and any place finishes ahead of schools that only took part.',
      'Finishing ahead of another school counts as a win against it. Finishing behind counts as a loss. Two schools that went out in the same round don’t count against each other.',
      'A competition run in this app uses its full final standings, so 1st beats 2nd beats 3rd and so on.',
    ],
  },
  {
    title: '3. Expected score',
    body: [
      'Against each school in a different round, a school’s expected score is 1 / (1 + 10^((their rating − your rating) / 400)), the same formula as chess. Equal ratings expect 0.5. A school rated 200 points higher expects about 0.76.',
      'Everyone’s rating before the competition is used, so the order schools are listed in doesn’t matter.',
    ],
  },
  {
    title: '4. The change',
    body: [
      'New rating = old rating + K × weight × (wins − expected), where wins is the number of schools finished ahead of and expected is the sum of the expected scores.',
      `Weight = min(${GAMES_PER_EVENT}, schools in the field − 1) / (schools in the field − 1). A competition is worth at most ${GAMES_PER_EVENT} games however big it is, so a 24-school event can’t move a rating three times as much as an 8-school one.`,
      'K is 40 for a school’s first 5 competitions, then 20, and 10 once a school reaches 2400, as in international chess.',
      'A competition counts for a school only if it finished in a different round from at least one other school there. A competition with no results recorded changes nothing.',
    ],
  },
  {
    title: '5. Order',
    body: [
      'Competitions are applied oldest first, by the date each one started. A competition with no date in the record takes the date of the one listed just before it. Competitions run in this app count as soon as they close (finalized, or 7 days after the last day) with published results.',
    ],
  },
  {
    title: '6. Classes',
    body: [
      `Under ${PROVISIONAL_UNDER} competitions a rating is provisional, marked *. Classes follow US Chess: ${CLASSES.filter((c) => c.min > 0)
        .map((c) => `${c.name} ${c.min}+`)
        .join(', ')}, Class E below.`,
    ],
  },
];

const DATA_NOTES = [
  'The results come from the circuit record of law school competitions, Spring 2023 through the current term, read line by line by a script that is published with the app.',
  'Names are matched to one school: nicknames and typos (for example "Johns", "Ole Miss", "Nova SE") become the school’s full name, and St. Thomas is assigned to Florida or Minnesota wherever the record or the other schools there make it clear.',
  'Known gaps: a few results name "St. Thomas" or "Loyola" without saying which school, so they are rated separately until confirmed. Online competitions split into divisions are rated as one competition. Some participant lists in the record are shorter than the team count, so a few schools that took part may be missing from those events.',
];

export default function RatingsMethod() {
  const { events } = useHistory();
  const example = useMemo(() => {
    if (!events?.length) return null;
    const { ranked, byEvent } = eloFor(events);
    const order = chronological(events);
    // The most recent competition the top-rated school played in.
    const top = ranked[0];
    for (let i = order.length - 1; i >= 0; i--) {
      const h = byEvent.get(order[i].id)?.get(top.school);
      if (h) return { school: top.school, e: order[i], h };
    }
    return null;
  }, [events]);

  return (
    <Screen>
      <H1>How school ratings are calculated</H1>
      <Body muted>
        School ratings use the Elo system from chess. Every rule is below, with the full data and a script that recomputes every rating from scratch, so anyone can check them.
      </Body>

      {STEPS.map((s) => (
        <Card key={s.title}>
          <H2>{s.title}</H2>
          {s.body.map((b) => (
            <Body key={b}>{b}</Body>
          ))}
        </Card>
      ))}

      <Label>Worked example from the real data</Label>
      {!events ? (
        <Loading />
      ) : example ? (
        <Card>
          <H2>
            {example.school} at {example.e.name}
          </H2>
          <Body muted>{[example.e.region, example.e.dates, `${example.e.term} ${example.e.season}`].filter(Boolean).join(' · ')}</Body>
          <Body>Rating before: {example.h.before.toFixed(2)}</Body>
          <Body>
            Finished ahead of {example.h.ahead} school{example.h.ahead === 1 ? '' : 's'} and behind {example.h.behind}, counting only schools in a different round.
          </Body>
          <Body>Expected score, summed over those schools: {example.h.expected.toFixed(4)}</Body>
          <Body>
            K = {example.h.k}, weight = {example.h.weight.toFixed(4)}
          </Body>
          <Body>
            Change = {example.h.k} × {example.h.weight.toFixed(4)} × ({example.h.ahead} − {example.h.expected.toFixed(4)}) = {(example.h.after - example.h.before).toFixed(2)}
          </Body>
          <Body>Rating after: {example.h.after.toFixed(2)}</Body>
          <Button small kind="ghost" title={`See every change for ${example.school}`} onPress={() => router.push({ pathname: '/history/school', params: { name: example.school } })} />
        </Card>
      ) : null}

      <Label>The data</Label>
      {DATA_NOTES.map((t) => (
        <Body key={t} muted>
          {t}
        </Body>
      ))}

      <Label>Check it yourself</Label>
      <Card>
        <Body>
          Download the results and the published ratings, then run the checking script (Python 3, nothing to install). It recomputes every rating from the results using only the rules on this page and reports any difference.
        </Body>
        <Button small kind="secondary" title="Results used (events.json)" onPress={() => open(`${DATA}/events.json`)} />
        <Button small kind="secondary" title="Current ratings (ratings.csv)" onPress={() => open(`${DATA}/ratings.csv`)} />
        <Button small kind="secondary" title="Every rating change, with its inputs (rating-changes.csv)" onPress={() => open(`${DATA}/rating-changes.csv`)} />
        <Button small kind="secondary" title="Checking script (verify_ratings.py)" onPress={() => open(`${DATA}/verify_ratings.py`)} />
        <Button small kind="ghost" title="The app's rating code" onPress={() => open(`${CODE}/src/lib/elo.ts`)} />
        <Button small kind="ghost" title="Full write-up" onPress={() => open(`${CODE}/docs/RATINGS.md`)} />
      </Card>
      <Body muted>
        The downloads cover the circuit record. Competitions run in this app join the ratings shown in the app the moment they close; their results are on each competition&apos;s page.
      </Body>
      <Body muted>Start rating {START}. Spot an error in a result? Tell the competition&apos;s organizer; once the record is corrected, every rating after it is recomputed.</Body>
    </Screen>
  );
}
