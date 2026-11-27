// Fictional sample season used in demo mode (no backend configured).
// Every school, team, and case here is invented.
import type { AppData, Ballot, Match, Program, Team, Tournament } from './types';
import { mulberry32, suggestPairings } from './scoring';

const DEMO_DIRECTOR = 'demo-director';

const programs: Program[] = [
  ['lakeshore', 'Lakeshore School of Law', 'Midwest'],
  ['ridgeview', 'Ridgeview University College of Law', 'Southeast'],
  ['harbor', 'Harbor City Law School', 'Northeast'],
  ['pinecrest', 'Pinecrest Law Center', 'West'],
  ['sterling', 'Sterling College of Law', 'Southwest'],
  ['granite', 'Granite State School of Law', 'Northeast'],
].map(([id, name, region]) => ({ id, name, region, level: 'law_school' as const }));

const teams: Team[] = programs.flatMap((p) =>
  ['A', 'B'].map((suffix) => ({
    id: `${p.id}-${suffix.toLowerCase()}`,
    programId: p.id,
    name: `${p.name.split(' ')[0]} ${suffix}`,
    level: 'law_school' as const,
  })),
);

// Hidden "strength" so sample results look like a real season.
const strength: Record<string, number> = {
  'lakeshore-a': 6, 'harbor-a': 5, 'ridgeview-a': 5, 'pinecrest-a': 4, 'sterling-a': 3, 'granite-a': 3,
  'lakeshore-b': 2, 'harbor-b': 2, 'ridgeview-b': 1, 'pinecrest-b': 1, 'sterling-b': 0, 'granite-b': 0,
};

function tournament(t: Partial<Tournament> & Pick<Tournament, 'id' | 'name' | 'startDate' | 'endDate' | 'status'>): Tournament {
  return {
    level: 'law_school',
    hostProgramId: null,
    hostName: '',
    city: '',
    venue: '',
    registrationDeadline: t.startDate,
    teamCap: 16,
    entryFee: 350,
    prelimRounds: 4,
    ballotsPerRound: 3,
    sideConstraint: 'alternate',
    pairingMethod: 'power',
    requireApproval: true,
    caseId: null,
    description: '',
    directorIds: [DEMO_DIRECTOR],
    staffIds: [],
    createdAt: '2026-08-01T12:00:00',
    ...t,
  };
}

const tournaments: Tournament[] = [
  tournament({
    id: 'harvest-invitational', name: 'Harvest Trial Invitational', status: 'final',
    hostProgramId: 'harbor', hostName: 'Harbor City Law School', city: 'Harbor City', venue: 'Harbor County Courthouse',
    startDate: '2026-10-16', endDate: '2026-10-18', registrationDeadline: '2026-09-25', caseId: 'state-v-delacroix',
    description: 'Four preliminary rounds, power-matched after Round 1. Awards for top four teams and best advocates.',
  }),
  tournament({
    id: 'great-lakes-cup', name: 'Great Lakes Advocacy Cup', status: 'final',
    hostProgramId: 'lakeshore', hostName: 'Lakeshore School of Law', city: 'Lakeshore', venue: 'Lakeshore Federal Building',
    startDate: '2026-11-13', endDate: '2026-11-15', registrationDeadline: '2026-10-23', caseId: 'state-v-delacroix', entryFee: 400,
    description: 'Criminal case. Three ballots per round from practitioner judges.',
  }),
  tournament({
    id: 'winter-classic', name: 'Winter Trial Classic', status: 'registration_open',
    hostProgramId: 'pinecrest', hostName: 'Pinecrest Law Center', city: 'Pinecrest', venue: 'Pinecrest Justice Center',
    startDate: '2027-01-22', endDate: '2027-01-24', registrationDeadline: '2026-12-18', caseId: 'harmon-v-pryce', teamCap: 12,
    description: 'Civil case released December 15. Two teams per school maximum.',
  }),
  tournament({
    id: 'spring-championship', name: 'Spring Invitational Championship', status: 'registration_open',
    hostProgramId: 'ridgeview', hostName: 'Ridgeview University College of Law', city: 'Ridgeview', venue: 'Ridgeview Moot Courtrooms',
    startDate: '2027-03-12', endDate: '2027-03-14', registrationDeadline: '2027-02-12', caseId: 'harmon-v-pryce', teamCap: 16, entryFee: 450,
    description: 'Season-ending invitational. Top eight after prelims advance to a single-elimination bracket.',
  }),
];

function playTournament(t: Tournament, teamIds: string[], seed: number, roundsToScore: number) {
  const matches: Match[] = [];
  const ballots: Ballot[] = [];
  const rand = mulberry32(seed);
  const days = [t.startDate, t.startDate, t.endDate, t.endDate];
  for (let round = 1; round <= t.prelimRounds; round++) {
    const pairs = suggestPairings({ teamIds, round, priorMatches: matches, ballots, method: t.pairingMethod, sideConstraint: t.sideConstraint, seed: seed + round });
    pairs.forEach((p, i) => {
      const id = `${t.id}-r${round}-${i + 1}`;
      const hour = round % 2 === 1 ? '09:00' : '14:00';
      matches.push({ id, tournamentId: t.id, round, startsAt: `${days[round - 1] ?? t.endDate}T${hour}`, courtroom: `Courtroom ${String.fromCharCode(65 + i)}`, ...p });
      if (round > roundsToScore) return;
      for (let b = 1; b <= t.ballotsPerRound; b++) {
        const base = 92 + Math.floor(rand() * 10);
        let edge = Math.round((strength[p.pTeamId] - strength[p.dTeamId]) * 1.6 + (rand() - 0.5) * 12);
        if (edge === 0) edge = rand() < 0.5 ? 1 : -1; // judges rarely tie; keep the sample realistic
        ballots.push({
          id: `${id}-b${b}`, matchId: id, judge: `Ballot ${b}`,
          pScore: base + Math.ceil(edge / 2), dScore: base - Math.floor(edge / 2),
          enteredBy: DEMO_DIRECTOR, enteredAt: `${days[round - 1]}T18:00`,
        });
      }
    });
  }
  return { matches, ballots };
}

const harvest = playTournament(tournaments[0], teams.slice(0, 10).map((t) => t.id), 101, 4);
const lakes = playTournament(tournaments[1], teams.map((t) => t.id), 202, 4);

export const sampleData: AppData = {
  programs,
  teams,
  tournaments,
  registrations: [
    ...[
      ['harvest-invitational', teams.slice(0, 10)],
      ['great-lakes-cup', teams],
    ].flatMap(([tid, list]) =>
      (list as Team[]).map((team) => ({
        id: `reg-${tid}-${team.id}`, tournamentId: tid as string, teamId: team.id, status: 'approved' as const,
        contactName: 'Team coach', contactEmail: 'coach@example.edu', submittedBy: 'demo-coach', createdAt: '2026-09-01T10:00',
      })),
    ),
    ...['lakeshore-a', 'harbor-a', 'ridgeview-a', 'sterling-a', 'granite-b'].map((teamId, i) => ({
      id: `reg-winter-${teamId}`, tournamentId: 'winter-classic', teamId, status: (i < 4 ? 'approved' : 'pending') as 'approved' | 'pending',
      contactName: 'Team coach', contactEmail: 'coach@example.edu', submittedBy: 'demo-coach', createdAt: `2026-11-0${i + 2}T10:00`,
    })),
  ],
  matches: [...harvest.matches, ...lakes.matches],
  ballots: [...harvest.ballots, ...lakes.ballots],
  cases: [
    {
      id: 'state-v-delacroix', level: 'law_school', title: 'State v. Delacroix', docket: 'No. 2026-CR-0412', kind: 'criminal',
      summary: 'Arson and insurance fraud. The defendant, a restaurant owner, is accused of setting the fire that destroyed his struggling bistro. Three witnesses per side.',
      releaseAt: '2026-08-15T12:00', createdBy: DEMO_DIRECTOR,
    },
    {
      id: 'harmon-v-pryce', level: 'law_school', title: 'Harmon Logistics, Inc. v. Pryce', docket: 'No. 2026-CV-1187', kind: 'civil',
      summary: 'Breach of a non-compete and misappropriation of trade secrets after a dispatch manager leaves for a rival freight company.',
      releaseAt: '2026-12-15T12:00', createdBy: DEMO_DIRECTOR,
    },
  ],
  caseFiles: [
    { id: 'cf-1', caseId: 'state-v-delacroix', label: 'Full case packet', version: 'v1.0', url: null, addedAt: '2026-08-15T12:00' },
    { id: 'cf-2', caseId: 'state-v-delacroix', label: 'Exhibit 9, fire marshal diagram (corrected)', version: 'v1.1', url: null, addedAt: '2026-09-20T09:00' },
    { id: 'cf-3', caseId: 'harmon-v-pryce', label: 'Full case packet', version: 'v1.0', url: null, addedAt: '2026-11-20T09:00' },
  ],
  bulletins: [
    {
      id: 'bl-1', level: 'law_school', tournamentId: null, caseId: 'state-v-delacroix', kind: 'case',
      title: 'Case Bulletin 2: Exhibit 9 corrected',
      body: 'The scale on the fire marshal diagram was mislabeled. Replace Exhibit 9 with v1.1. No witness statements change.',
      postedAt: '2026-09-20T09:00', postedBy: DEMO_DIRECTOR,
    },
    {
      id: 'bl-2', level: 'law_school', tournamentId: 'great-lakes-cup', caseId: null, kind: 'results',
      title: 'Great Lakes Advocacy Cup results posted',
      body: 'Final standings and all ballots are in the app. Thank you to our 36 volunteer judges.',
      postedAt: '2026-11-15T19:30', postedBy: DEMO_DIRECTOR,
    },
    {
      id: 'bl-3', level: 'law_school', tournamentId: 'winter-classic', caseId: null, kind: 'schedule',
      title: 'Winter Trial Classic: registration closes December 18',
      body: 'Eight of twelve slots remain. Coaches can register directly from the tournament page.',
      postedAt: '2026-11-24T08:00', postedBy: DEMO_DIRECTOR,
    },
  ],
  recordings: [
    {
      id: 'rec-1', matchId: 'great-lakes-cup-r4-1', title: 'Round 4, Courtroom A (full trial)', provider: 'link',
      url: 'https://example.com/recordings/great-lakes-r4-a', visibility: 'coaches', uploadedBy: DEMO_DIRECTOR, createdAt: '2026-11-15T20:00',
    },
  ],
};

export const DEMO_USERS = {
  director: { id: DEMO_DIRECTOR, name: 'Demo Director', email: 'director@example.edu', teamIds: [] },
  coach: { id: 'demo-coach', name: 'Demo Coach', email: 'coach@example.edu', teamIds: ['lakeshore-a', 'lakeshore-b'] },
  competitor: { id: 'demo-competitor', name: 'Demo Competitor', email: 'student@example.edu', teamIds: ['lakeshore-a'] },
};
