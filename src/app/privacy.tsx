import { Body, Card, H1, H2, Screen } from '../components/ui';

/** Who to write to about privacy requests. Set before launch. */
export const PRIVACY_CONTACT = '';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What this app holds',
    body: [
      'Names, email addresses, schools, teams and roles of the people who sign in.',
      'Competition entries, schedules, pairings, scores, ballots and judges’ comments.',
      'Competition chat messages and links to trial videos.',
    ],
  },
  {
    title: 'Who can see it',
    body: [
      'Public: competition names, dates, team and school names, and final results once the organizer publishes them.',
      'Ballots and judges’ comments: only the competition’s organizer, the judge who wrote them, and, if the organizer returns ballots, the team they are about.',
      'Team membership: only coaches add students to a team.',
      'These rules are enforced by the database itself, not just by the app’s screens.',
    ],
  },
  {
    title: 'Students and FERPA',
    body: [
      'The Family Educational Rights and Privacy Act (FERPA) protects students’ education records held by their schools. Schools share student information with this app only to run mock trial competitions, and we use it only for that.',
      'We never sell student information, never use it for advertising, and never share it beyond what this notice describes.',
      'High school students can read competition chat but cannot post; their coach speaks for the team. There are no private messages between adults and students.',
      'A school, a student, or an eligible student’s parent can ask to see, correct or remove that student’s information.',
    ],
  },
  {
    title: 'Keeping it safe',
    body: [
      'Information is encrypted in transit and every change is logged.',
      'Results lock 7 days after a competition ends (or sooner, when the organizer finalizes it), so they cannot be changed afterward without a record.',
    ],
  },
];

export default function Privacy() {
  return (
    <Screen>
      <H1>Privacy notice</H1>
      {SECTIONS.map((s) => (
        <Card key={s.title}>
          <H2>{s.title}</H2>
          {s.body.map((b) => (
            <Body key={b}>{b}</Body>
          ))}
        </Card>
      ))}
      <Body muted>
        {PRIVACY_CONTACT
          ? `Questions or requests: ${PRIVACY_CONTACT}.`
          : 'Questions or requests: contact the organizer of your competition, who will pass them on.'}
      </Body>
    </Screen>
  );
}
