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
  /** Whether teams must alternate sides between rounds. */
  sideConstraint: 'alternate' | 'balanced' | 'none';
  /** How rounds after the first are paired. */
  pairingMethod: 'power' | 'random';
  requireApproval: boolean;
  caseId: string | null;
  description: string;
  status: TournamentStatus;
  directorIds: string[];
  /** Staff (tab room) who may enter scores. Directors always can. */
  staffIds: string[];
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
}

export interface Ballot {
  id: string;
  matchId: string;
  judge: string; // "Ballot 1", or presiding judge's label
  pScore: number;
  dScore: number;
  enteredBy: string;
  enteredAt: string;
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
  provider: 'link' | 'mux' | 'cloudflare';
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
  matches: Match[];
  ballots: Ballot[];
  cases: TrialCase[];
  caseFiles: CaseFile[];
  bulletins: Bulletin[];
  recordings: Recording[];
}
