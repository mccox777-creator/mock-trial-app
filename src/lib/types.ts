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
  /** Platform admin: approves organizers and handles reports. */
  isAdmin?: boolean;
  /** The circuit they chose when they made their account. They see and act only in it. Null until chosen. */
  level?: Level | null;
  /** Where their request to run competitions stands. 'approved' organizers' competitions are listed at once. */
  organizer?: OrganizerStatus;
}

export type OrganizerStatus = 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';

export interface OrganizerRequest {
  userId: string;
  name: string;
  school: string;
  role: string;
  note: string;
  status: Exclude<OrganizerStatus, 'none'>;
  requestedAt: string;
}

export type ReportKind = 'tournament' | 'bulletin' | 'message' | 'case' | 'team' | 'user';
export type ReportReason = 'fake' | 'spam' | 'abusive' | 'other';

export interface Report {
  id: number;
  kind: ReportKind;
  targetId: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
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
  /** Set by the server: false until a platform admin approves the organizer or the competition. Unapproved competitions are unlisted. */
  approved?: boolean;
  /** Set by a platform admin to take a competition down. */
  hidden?: boolean;
  /** Most teams one school may enter; null for no limit. */
  maxTeamsPerSchool?: number | null;
}

export type RegistrationStatus = 'pending' | 'approved' | 'waitlisted' | 'declined' | 'withdrawn';

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

export type BulletinKind = 'general' | 'case' | 'schedule' | 'results' | 'judges_needed';

export type NoticeKind = 'my_competitions' | 'chat' | 'results' | 'new_competition' | 'case_release' | 'judges_needed';

/** What a person wants to hear about, and how. */
export interface NotificationPrefs {
  /** Circuits followed for circuit-wide notices. Your own competitions always count. */
  levels: Level[];
  kinds: NoticeKind[];
  push: boolean;
  email: boolean;
  /** One email a day instead of one per notice. */
  emailDigest: boolean;
  willingToJudge: boolean;
  judgeLevels: Level[];
  judgeRegion: string;
}

/** One entry in a person's inbox. */
export interface Notice {
  id: number;
  kind: NoticeKind;
  title: string;
  body: string;
  link: string;
  createdAt: string;
  readAt: string | null;
}

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

/** A student's year of law school at the time of one competition. 'other': LLM, part-time 4L, and the like. */
export type ClassYear = '2L' | '3L' | 'other';

export const CLASS_YEARS: { id: ClassYear; label: string }[] = [
  { id: '2L', label: '2L' },
  { id: '3L', label: '3L' },
  { id: 'other', label: 'Other' },
];

/** What a student does at a competition: attorney or witness, for the plaintiff/prosecution (p) or the defense (d). */
export type TrialRole = 'p_attorney' | 'p_witness' | 'd_attorney' | 'd_witness';

export const TRIAL_ROLES: TrialRole[] = ['p_attorney', 'p_witness', 'd_attorney', 'd_witness'];

export function trialRoleLabel(r: TrialRole, kind?: 'civil' | 'criminal') {
  const side = r.startsWith('p') ? (kind === 'criminal' ? 'Prosecution' : kind === 'civil' ? 'Plaintiff' : 'P') : kind ? 'Defense' : 'D';
  return `${side} ${r.endsWith('attorney') ? 'attorney' : 'witness'}`;
}

/** One person on a team's roster at one competition. People are matched across competitions by school and name. */
export interface RosterEntry {
  id: string;
  tournamentId: string;
  registrationId: string;
  teamId: string;
  name: string;
  role: 'coach' | 'student';
  /** Students only: their year at this competition. */
  classYear: ClassYear | null;
  /** Students only: the parts they play, set at registration. */
  roles: TrialRole[];
}

export type AwardKind = 'best_advocate' | 'best_witness' | 'best_opening' | 'best_closing' | 'best_direct' | 'best_cross' | 'other';

export const AWARD_KINDS: { id: AwardKind; label: string }[] = [
  { id: 'best_advocate', label: 'Best Advocate' },
  { id: 'best_witness', label: 'Best Witness' },
  { id: 'best_opening', label: 'Best Opening' },
  { id: 'best_closing', label: 'Best Closing' },
  { id: 'best_direct', label: 'Best Direct' },
  { id: 'best_cross', label: 'Best Cross' },
  { id: 'other', label: 'Other' },
];

/** An individual award given at a competition. Public once results are published. */
export interface Award {
  id: string;
  tournamentId: string;
  kind: AwardKind;
  /** The organizer's own name for it; required for 'other'. */
  label: string;
  /** 1 for the top award, 2 for second; null when not ranked. */
  place: number | null;
  teamId: string;
  recipient: string;
  /** Set when picked from the team's roster. */
  rosterEntryId: string | null;
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
  rosterEntries: RosterEntry[];
  awards: Award[];
}

/** How a team finished at a past competition. "advanced" = qualified out of a regional to the national round. */
export type PastFinish = 'winner' | 'finalist' | 'advanced' | 'semifinalist' | 'quarterfinalist' | 'octofinalist' | 'place';

/** A finished competition: imported from the circuit's results records, or run in the app and closed. Read-only. */
export interface PastEvent {
  id: string;
  level: Level;
  /** "2025-26" */
  season: string;
  term: 'Fall' | 'Spring';
  name: string;
  host: string | null;
  region: string | null;
  dates: string | null;
  teamCount: number | null;
  schoolCount: number | null;
  /** source 'TCPR': missing from the circuit record, filled in from the Trial Competition Performance Rankings. */
  results: { school: string; team: string; finish: PastFinish; place: number | null; source?: 'TCPR' }[];
  /** Team names as listed, e.g. "Nova Southeastern 2". */
  participants: string[];
  /** The source text had a line the importer couldn't read; worth a look. */
  needsReview: boolean;
  /** Position in the source record: terms newest first, competitions within a term roughly oldest first. */
  ord: number;
  /** Set when this comes from a competition run in the app (added once it closes), not the imported record. */
  tournamentId?: string;
  /** 'TCPR': the whole competition is missing from the circuit record and comes from the TCPR spreadsheet. */
  source?: 'TCPR';
}
