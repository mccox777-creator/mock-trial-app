// Fictional sample season used in demo mode (no backend configured).
// Every school, team, and case here is invented.
import type { AppData, Ballot, Match, Program, Team, Tournament } from './types';
import { mulberry32, pairingSettings, suggestPairings } from './scoring';

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
    powerStyle: 'high_high',
    bracketed: false,
    avoidSameSchool: true,
    randomRounds: 1,
    entryType: 'open',
    requireApproval: true,
    caseId: null,
    description: '',
    rules: { ...COMMON_RULES },
    rankBy: 'ballots',
    chatReplies: true,
    scoring: { max: 10, parts: ['opening', 'direct', 'witness', 'cross', 'closing'], extra: [], comments: 'overall' },
    customRules: '',
    directorIds: [DEMO_DIRECTOR],
    witnessesPerSide: 3,
    resultsPublished: false,
    ballotsReturned: false,
    finalizedAt: null,
    createdAt: '2026-08-01T12:00:00',
    ...t,
  };
}

const COMMON_RULES = {
  woodshedding: true, woodsheddingMinutes: 30, inventionRule: true, negativeInference: true, fre: true, rebuttal: true,
  timeOpening: true, openingMinutes: 5, timeDirect: true, directMinutes: 25, timeCross: true, crossMinutes: 20, timeClosing: true, closingMinutes: 9,
  ownTimekeeper: true, noScouting: true, noCoachContact: true, rosterMin: true, rosterMinCount: 4, rosterMax: true, rosterMaxCount: 6,
};

const tournaments: Tournament[] = [
  tournament({
    id: 'harvest-invitational', name: 'Harvest Trial Invitational', status: 'final', resultsPublished: true, ballotsReturned: true, finalizedAt: '2026-10-19T10:00',
    hostProgramId: 'harbor', hostName: 'Harbor City Law School', city: 'Harbor City', venue: 'Harbor County Courthouse',
    startDate: '2026-10-16', endDate: '2026-10-18', registrationDeadline: '2026-09-25', caseId: 'state-v-delacroix',
    description: 'Four preliminary rounds, power-matched after Round 1. Awards for top four teams and best advocates.',
  }),
  tournament({
    id: 'great-lakes-cup', name: 'Great Lakes Advocacy Cup', status: 'final', resultsPublished: true, ballotsReturned: true,
    hostProgramId: 'lakeshore', hostName: 'Lakeshore School of Law', city: 'Lakeshore', venue: 'Lakeshore Federal Building',
    startDate: '2026-11-13', endDate: '2026-11-15', registrationDeadline: '2026-10-23', caseId: 'state-v-delacroix', entryFee: 400,
    description: 'Criminal case. Three ballots per round from practitioner judges.',
  }),
  tournament({
    id: 'winter-classic', name: 'Winter Trial Classic', status: 'registration_open',
    hostProgramId: 'pinecrest', hostName: 'Pinecrest Law Center', city: 'Pinecrest', venue: 'Pinecrest Justice Center',
    startDate: '2027-01-22', endDate: '2027-01-24', registrationDeadline: '2026-12-18', caseId: 'harmon-v-pryce', teamCap: 12,
    description: 'Civil case released December 15. Two teams per school maximum.',
    rules: { ...COMMON_RULES, teamsPerSchool: true, teamsPerSchoolMax: 2, witnessChoice: true, witnessNotice: true, witnessNoticeMinutes: 15, anyGender: true, spectators: true },
    scoring: { max: 10, parts: ['opening', 'direct', 'witness', 'cross', 'closing'], extra: [], comments: 'both' },
    customRules: 'Teams check in at the clerk\'s desk 20 minutes before each round.',
  }),
  tournament({
    id: 'spring-championship', name: 'Spring Invitational Championship', status: 'registration_open',
    hostProgramId: 'ridgeview', hostName: 'Ridgeview University College of Law', city: 'Ridgeview', venue: 'Ridgeview Moot Courtrooms',
    startDate: '2027-03-12', endDate: '2027-03-14', registrationDeadline: '2027-02-12', caseId: 'harmon-v-pryce', teamCap: 16, entryFee: 450, entryType: 'invitational',
    description: 'Season-ending invitational. Top eight after prelims advance to a single-elimination bracket.',
    scoring: { max: 15, parts: ['pretrial', 'opening', 'direct', 'witness', 'cross', 'evidence', 'closing', 'professionalism'], extra: [], comments: 'both' },
    rules: { ...COMMON_RULES, woodsheddingMinutes: 45, pretrialMotion: true, jury: true, upperLevelOnly: true, recordingAllowed: true },
  }),
];

function playTournament(t: Tournament, teamIds: string[], seed: number, roundsToScore: number) {
  const matches: Match[] = [];
  const ballots: Ballot[] = [];
  const rand = mulberry32(seed);
  const days = [t.startDate, t.startDate, t.endDate, t.endDate];
  for (let round = 1; round <= t.prelimRounds; round++) {
    const { pairs } = suggestPairings({ ...pairingSettings(t), teamIds, round, priorMatches: matches, ballots, seed: seed + round, schoolOf: (id) => teams.find((x) => x.id === id)?.programId });
    pairs.forEach((p, i) => {
      const id = `${t.id}-r${round}-${i + 1}`;
      const hour = round % 2 === 1 ? '09:00' : '14:00';
      matches.push({ id, tournamentId: t.id, round, startsAt: `${days[round - 1] ?? t.endDate}T${hour}`, courtroom: `Courtroom ${String.fromCharCode(65 + i)}`, judgeIds: [], ...p });
      if (round > roundsToScore) return;
      for (let b = 1; b <= t.ballotsPerRound; b++) {
        const base = 92 + Math.floor(rand() * 10);
        let edge = Math.round((strength[p.pTeamId] - strength[p.dTeamId]) * 1.6 + (rand() - 0.5) * 12);
        if (edge === 0) edge = rand() < 0.5 ? 1 : -1; // judges rarely tie; keep the sample realistic
        ballots.push({
          id: `${id}-b${b}`, matchId: id, judge: `Ballot ${b}`, judgeId: null, source: 'paper', sheet: null,
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
    {
      id: 'reg-spring-harbor-a', tournamentId: 'spring-championship', teamId: 'harbor-a', status: 'pending' as const,
      contactName: 'Team coach', contactEmail: 'coach@example.edu', submittedBy: 'demo-coach-2', createdAt: '2026-11-20T15:00',
      note: 'Harbor A finished second at the Harvest Invitational and would love a spot.',
    },
  ],
  judgeSignups: [
    ['demo-judge', 'Demo Judge', 'attorney', ''],
    ['sj-1', 'Hon. Rita Alvarez (sample)', 'judge', ''],
    ['sj-2', 'Marcus Webb (sample)', 'attorney', 'Lakeshore School of Law'],
    ['sj-3', 'Dana Okafor (sample)', 'attorney', ''],
    ['sj-4', 'Lena Petrov (sample)', 'alumni', 'Harbor City'],
    ['sj-5', 'Sam Whitfield (sample)', 'attorney', ''],
    ['sj-6', 'Priya Natarajan (sample)', 'judge', ''],
    ['sj-7', 'Owen Brandt (sample)', 'coach', 'Sterling'],
  ].map(([userId, name, background, conflicts], i) => ({
    id: `js-winter-${userId}`, tournamentId: 'winter-classic', userId, name, email: `${userId}@example.com`,
    background: background as 'attorney', rounds: [1, 2, 3, 4], conflicts, status: (i === 7 ? 'pending' : 'approved') as 'approved',
    createdAt: '2026-11-18T12:00',
  })),
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
  messages: [
    { id: 'msg-1', tournamentId: 'winter-classic', channel: 'all', authorId: DEMO_DIRECTOR, authorName: 'Demo Director', authorRole: 'organizer', body: 'Welcome to the Winter Trial Classic. Check-in opens at 8:00 AM in the Justice Center lobby.', createdAt: '2026-11-20T09:00:00' },
    { id: 'msg-2', tournamentId: 'winter-classic', channel: 'all', authorId: 'demo-coach', authorName: 'Demo Coach', authorRole: 'coach', body: 'Is there parking at the Justice Center, or should teams use the garage on 3rd?', createdAt: '2026-11-20T10:15:00' },
    { id: 'msg-3', tournamentId: 'winter-classic', channel: 'all', authorId: DEMO_DIRECTOR, authorName: 'Demo Director', authorRole: 'organizer', body: 'Use the 3rd Street garage. We will validate parking at check-in.', createdAt: '2026-11-20T10:30:00' },
    { id: 'msg-4', tournamentId: 'winter-classic', channel: 'judges', authorId: DEMO_DIRECTOR, authorName: 'Demo Director', authorRole: 'organizer', body: 'Judges: a short orientation runs at 8:30 AM in Courtroom A, with the score sheet and comment guidelines.', createdAt: '2026-11-21T09:00:00' },
  ],
  recordings: [
    {
      id: 'rec-1', matchId: 'great-lakes-cup-r4-1', title: 'Round 4, Courtroom A (full trial)', provider: 'youtube',
      url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ', visibility: 'coaches', uploadedBy: DEMO_DIRECTOR, createdAt: '2026-11-15T20:00',
    },
  ],
};

export const DEMO_USERS = {
  director: { id: DEMO_DIRECTOR, name: 'Demo Director', email: 'director@example.edu', teamIds: [] },
  judge: { id: 'demo-judge', name: 'Demo Judge', email: 'judge@example.com', teamIds: [] },
  coach: { id: 'demo-coach', name: 'Demo Coach', email: 'coach@example.edu', teamIds: ['lakeshore-a', 'lakeshore-b'], coachOf: ['lakeshore-a', 'lakeshore-b'] },
  competitor: { id: 'demo-competitor', name: 'Demo Competitor', email: 'student@example.edu', teamIds: ['lakeshore-a'], coachOf: [] },
};
