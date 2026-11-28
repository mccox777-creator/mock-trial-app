import { useMemo } from 'react';
import { Linking, Platform } from 'react-native';
import { router } from 'expo-router';
import { Body, Button, Card, H1, H2, Label, Loading, Screen } from '../components/ui';
import { chronological, eloFor, GAMES_PER_EVENT, PROVISIONAL_UNDER, SCALE_SHIFT, START } from '../lib/elo';
import { useHistory } from '../lib/store';

/** Where the site publishes the rating data (public/ratings-data in the repository). */
const DATA = 'https://app.mocktrialcentral.com/ratings-data';
const CODE = 'https://github.com/mccox777-creator/mock-trial-app/blob/main';

const open = (url: string) => (Platform.OS === 'web' ? window.open(url, '_blank', 'noopener') : Linking.openURL(url));

const STEPS: { title: string; body: string[] }[] = [
  {
    title: `1. Everyone starts at ${START}`,
    body: [
      `A school gets a rating of ${START} at its first competition in the record (Spring 2023 onward).`,
      `Chess starts players at 1500; this scale sits ${SCALE_SHIFT} higher, so numbers look like chess ratings for strong players. Ratings only depend on the gaps between schools, so the starting number changes no result and no order. The K cutoff below is moved up by the same ${SCALE_SHIFT}.`,
    ],
  },
  {
    title: '2. Each competition is a set of games',
    body: [
      'Every team is its own competitor. A team finishes: won (or qualified out of a regional), final, semifinal, quarterfinal, octofinal, or took part. A numbered place counts by its number, so 4th finishes ahead of 5th, and any place finishes ahead of teams that only took part.',
      'Each team plays every team from another school: finishing ahead counts as a win, finishing behind as a loss, and going out in the same round doesn’t count. Teams from the same school never count against each other. A school with two teams plays the field twice, and its rating moves by the average of its teams’ results, so a strong team lifts it and a team that goes out early pulls it down.',
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
      'New rating = old rating + K × weight × (wins − expected) ÷ teams, where wins counts every team (from another school) that the school’s teams finished ahead of, expected is the sum of the expected scores for those same games, and teams is how many teams the school entered.',
      `Weight = min(${GAMES_PER_EVENT}, n) / n, where n is the number of teams from other schools. Each team’s competition is worth at most ${GAMES_PER_EVENT} games however big it is, so a 24-team event can’t move a rating three times as much as an 8-team one.`,
      `K is 40 for a school’s first 5 competitions, then 20, and 10 once a school reaches ${2400 + SCALE_SHIFT} (international chess uses 2400 on its 1500-start scale).`,
      'A competition counts for a school only if one of its teams finished in a different round from a team of another school. A competition with no results recorded changes nothing.',
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
      `Under ${PROVISIONAL_UNDER} competitions a rating is provisional, marked *. Each school is listed by its place among all schools, with its peer group and tier underneath. Peer groups: the three size divisions (total JD enrollment under 500, 500–799, 800+), each split at a median LSAT of 160, from the ABA Standard 509 reports. Within its group a school is Tier 1 (top 5%), Tier 2 (to 13%), Tier 3 (to 25%), Tier 4 (to 50%) or Tier 5 (the rest). Provisional schools get a tier like any other.`,
    ],
  },
];

const DATA_NOTES = [
  'The results come from the circuit record of law school competitions, Spring 2023 through the current term, read line by line by a script that is published with the app.',
  'Names are matched to one school: nicknames and typos (for example "Johns", "Ole Miss", "Nova SE") become the school’s full name, and St. Thomas is assigned to Florida or Minnesota wherever the record or the other schools there make it clear.',
  'Where the record is missing a result, it is filled in from the Trial Competition Performance Rankings (TCPR), used as a backstop: only empty places are filled, nothing in the record is changed, and nothing before Spring 2023 is added. Each one is marked "from TCPR" on its competition page and in the data.',
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
      <H1>Mock Trial ELO Ratings: how they are calculated</H1>
      <Body muted>
        The Mock Trial ELO Ratings use the Elo system from chess. Every rule is below, with the full data and a script that recomputes every rating from scratch, so anyone can check them.
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
            Entered {example.h.teams} team{example.h.teams === 1 ? '' : 's'}. Finished ahead of {example.h.ahead} team{example.h.ahead === 1 ? '' : 's'} and behind {example.h.behind}, counting only teams from other schools in a different round.
          </Body>
          <Body>Expected score, summed over those games: {example.h.expected.toFixed(4)}</Body>
          <Body>
            K = {example.h.k}, weight = {example.h.weight.toFixed(4)}
          </Body>
          <Body>
            Change = {example.h.k} × {example.h.weight.toFixed(4)} × ({example.h.ahead} − {example.h.expected.toFixed(4)}) ÷ {example.h.teams} = {(example.h.after - example.h.before).toFixed(2)}
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
