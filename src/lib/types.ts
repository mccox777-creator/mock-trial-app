import type { RuleSet } from './rules';
// Core domain model. Every competition-facing record carries a `level` so the
// same app serves law school, collegiate, and high school circuits.

export type Level = 'law_school' | 'collegiate' | 'high_school';

export const LEVELS: { id: Level; label: string; short: string; live: boolean }[] = [
  { id: 'law_school', label: 'Law School', short: 'Law', live: true },
  { id: 'collegiate', label: 'Collegiate', short: 'College', live: false },
  { id: 'high_school', label: 'High School', short: 'HS', live: false },
];

export type UserRole = 'competitor' | 'coach' | 'director';

export interface Profile {
  id: string;
  name: string;
  email: string;
  /** Teams this person coaches or competes on. */
  teamIds: string[];
  /** The subset of teamIds this person coaches. */
  coachOf?: string[];
}

export type ChatChannel = 'all' | 'judges' | 'coaches';
export type ChatRole = 'organizer' | 'judge' | 'coach' | 'competitor';

/** A message in a competition's group chat. There are no private messages. */
export interface Message {
  id: string;
  tournamentId: string;
  channel: ChatChannel;
  authorId: string;
  /** Set by the server from the author's profile, so nobody can post under another name. */
  authorName: string;
  authorRole: ChatRole | '';
  body: string;
  createdAt: string;
}

export interface Program {
  id: string;
  name: string; // e.g. "Lakeshore School of Law"
  level: Level;
  region: string;
}

export interface Team {
  id: string;
  programId: string;
  name: string; // e.g. "Lakeshore A"
  level: Level;
}

export type TournamentStatus = 'draft' | 'registration_open' | 'registration_closed' | 'in_progress' | 'final';

export interface Tournament {
  id: string;
  level: Level;
  name: string;
  hostProgramId: string | null;
  hostName: string;
  city: string;
  venue: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  registrationDeadline: string;
  teamCap: number;
  entryFee: number; // USD
  prelimRounds: number;
  ballotsPerRound: number;
  /** Side rule. alternate: flip every round. flip_even: rounds 2, 4, 6 flip from the round before (AMTA style). balanced: even out over the event. none: any. */
  sideConstraint: 'alternate' | 'flip_even' | 'balanced' | 'none';
  /** Rounds drawn at random before any power-matching (1 to 4). */
  randomRounds: number;
  /** How rounds after the random draws are paired. */
  pairingMethod: 'power' | 'random';
  /** Power-match style. high_high: 1 v 2, 3 v 4. high_low: best v worst. slide: top half v bottom half. */
  powerStyle: 'high_high' | 'high_low' | 'slide';
  /** Pair within groups of teams with the same record, moving one team down when a group is odd. */
  bracketed: boolean;
  /** Never pair two teams from the same school. */
  avoidSameSchool: boolean;
  /** Open: schools register directly. Invitational: schools request an invitation. */
  entryType: 'open' | 'invitational';
  /** Open competitions only: the director reviews each sign-up before confirming. */
  requireApproval: boolean;
  caseId: string | null;
  description: string;
  /** False: chat is announcements only, and only the organizer posts. */
  chatReplies: boolean;
  /** How teams are ranked: by ballots won first, or by trials won first. */
  rankBy: 'ballots' | 'wins';
  /** How judges score: the scale and which parts of the trial get a line on the sheet. */
  scoring: ScoringSetup;
  /** Ticked items from the rules checklist (see lib/rules.ts), plus any numeric details. */
  rules: RuleSet;
  /** Anything the checklist does not cover, one rule per line. */
  customRules: string;
  status: TournamentStatus;
  directorIds: string[];
  /** Witnesses per side; sets the lines on the judges' score sheet. */
  witnessesPerSide: number;
  /** Until the organizer publishes, only they see scores and standings. */
  resultsPublished: boolean;
  /** After publishing, the organizer may also return each team's own ballots to it. */
  ballotsReturned: boolean;
  /** When the organizer finalized results. After that (or AUTO_LOCK_DAYS after the last day) nothing can change. */
  finalizedAt: string | null;
  createdAt: string;
}

export type RegistrationStatus = 'pending' | 'approved' | 'waitlisted' | 'declined';

export interface Registration {
  id: string;
  tournamentId: string;
  teamId: string;
  status: RegistrationStatus;
  contactName: string;
  contactEmail: string;
  /** Message to the director, used for invitation requests. */
  note?: string;
  submittedBy: string;
  createdAt: string;
}

export interface Match {
  id: string;
  tournamentId: string;
  round: number;
  startsAt: string; // ISO local datetime, e.g. 2027-01-22T09:00
  courtroom: string;
  pTeamId: string;
  dTeamId: string;
  /** Judges the organizer assigned to this trial (user ids). */
  judgeIds: string[];
}

export type SheetPart = 'pretrial' | 'opening' | 'direct' | 'witness' | 'cross' | 'evidence' | 'closing' | 'professionalism';

export interface ScoringSetup {
  /** Top of the scale: 10 or 15. Every line is scored from 1 to this. */
  max: number;
  parts: SheetPart[];
  /** The organizer's own extra lines, scored for each side. */
  extra: string[];
  /** Where judges can write comments: nowhere, one box for the whole ballot, after each performance, or both. */
  comments: CommentMode;
}

export type CommentMode = 'none' | 'overall' | 'per_line' | 'both';

/** A judge's written comments. Per-line comments are kept per side, in sheet-line order. */
export interface BallotComments {
  overall?: string;
  p?: string[];
  d?: string[];
}

export interface ScoreSheet {
  p: number[]; // one score per line, same order as sheetLines()
  d: number[];
}

export interface Ballot {
  id: string;
  matchId: string;
  judge: string; // judge's name, or "Ballot 1" for a paper ballot
  /** The judge who submitted it in the app; null for paper ballots the organizer typed in. */
  judgeId: string | null;
  source: 'app' | 'paper';
  /** Line-by-line scores, when entered that way. Totals are always stored. */
  sheet: ScoreSheet | null;
  /** Written comments, when the organizer turned them on. Shared with teams only if ballots are returned. */
  comments?: BallotComments | null;
  pScore: number;
  dScore: number;
  enteredBy: string;
  enteredAt: string;
}

export type JudgeBackground = 'judge' | 'attorney' | 'coach' | 'alumni' | 'other';

export interface JudgeSignup {
  id: string;
  tournamentId: string;
  userId: string;
  name: string;
  email: string;
  background: JudgeBackground;
  /** Rounds this judge can cover. */
  rounds: number[];
  /** Schools the judge has ties to and must not judge. */
  conflicts: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}

export type CaseKind = 'civil' | 'criminal';

export interface CaseFile {
  id: string;
  caseId: string;
  label: string; // "Full case packet", "Exhibit 14 (corrected)"
  version: string; // "v1.0"
  url: string | null;
  addedAt: string;
}

export interface TrialCase {
  id: string;
  level: Level;
  title: string; // "State v. Delacroix"
  docket: string; // "No. 2026-CR-0412"
  kind: CaseKind;
  summary: string;
  releaseAt: string; // ISO datetime; files are hidden from competitors until then
  createdBy: string;
}

export type BulletinKind = 'general' | 'case' | 'schedule' | 'results';

export interface Bulletin {
  id: string;
  level: Level;
  tournamentId: string | null;
  caseId: string | null;
  kind: BulletinKind;
  title: string;
  body: string;
  postedAt: string;
  postedBy: string;
}

export type VideoVisibility = 'teams' | 'coaches' | 'public';

export interface Recording {
  id: string;
  matchId: string;
  title: string;
  /** 'link' for now; 'mux' / 'cloudflare' once a video service is chosen. */
  /** Round video lives on YouTube (unlisted); the app stores the link. */
  provider: 'youtube' | 'link';
  url: string;
  visibility: VideoVisibility;
  uploadedBy: string;
  createdAt: string;
}

export interface AppData {
  programs: Program[];
  teams: Team[];
  tournaments: Tournament[];
  registrations: Registration[];
  judgeSignups: JudgeSignup[];
  matches: Match[];
  ballots: Ballot[];
  cases: TrialCase[];
  caseFiles: CaseFile[];
  bulletins: Bulletin[];
  recordings: Recording[];
  messages: Message[];
}
