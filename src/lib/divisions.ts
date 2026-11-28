// Groupings for the Mock Trial ELO Ratings, the way college football groups schools.
// The ratings themselves don't change: every school keeps one rating from every competition it
// entered, including wins over schools in other groups. Groupings only decide which extra lists a
// school appears in, next to the overall list.
//
// Two ways to carve the list, both from the ABA Standard 509 reports (2025), built by
// scripts/enrollment/build.py into src/data/school-enrollment.json:
// - Size: total JD enrollment (all class years, full and part time).
// - Selectivity: median LSAT of the entering class.
import enrollmentData from '../data/school-enrollment.json';

export type DivisionId = 'large' | 'mid' | 'small';
export type SelectivityId = 'elite' | 'selective' | 'other';
export type TierId = DivisionId | SelectivityId;
export type GroupingId = 'size' | 'lsat';

export interface Tier<T extends TierId = TierId> {
  id: T;
  label: string;
  /** Short label for chips and tabs. */
  short: string;
  /** Inclusive lower bound of the measure (enrollment or median LSAT). */
  min: number;
  /** Exclusive upper bound, or null for no limit. */
  max: number | null;
}
export type Division = Tier<DivisionId>;

/** Size, largest first. Cutoffs: under 500, 500 to 799, 800 and up. */
export const DIVISIONS: Tier<DivisionId>[] = [
  { id: 'large', label: 'Large schools (800+ JD students)', short: 'Large', min: 800, max: null },
  { id: 'mid', label: 'Mid-size schools (500–799 JD students)', short: 'Mid-size', min: 500, max: 800 },
  { id: 'small', label: 'Small schools (under 500 JD students)', short: 'Small', min: 0, max: 500 },
];

/** Selectivity by median LSAT, most selective first. Cutoffs: under 160, 160 to 167, 168 and up. */
export const SELECTIVITY: Tier<SelectivityId>[] = [
  { id: 'elite', label: 'Elite schools (median LSAT 168+)', short: 'Elite', min: 168, max: null },
  { id: 'selective', label: 'Selective schools (median LSAT 160–167)', short: 'Selective', min: 160, max: 168 },
  { id: 'other', label: 'Other schools (median LSAT under 160)', short: 'Others', min: 0, max: 160 },
];

interface SchoolFacts {
  enrollment: number | null;
  lsat?: number | null;
  gpa?: number | null;
  aba?: string;
  note?: string;
}
interface EnrollmentFile {
  source: string;
  sourceUrl: string;
  year: number;
  schools: Record<string, SchoolFacts>;
}

const data = enrollmentData as EnrollmentFile;

export const ENROLLMENT_SOURCE = { source: data.source, url: data.sourceUrl, year: data.year };

/** Total JD enrollment for a school, by its name in the ratings, or null if unknown. */
export function enrollmentOf(school: string): number | null {
  return data.schools[school]?.enrollment ?? null;
}

/** Median LSAT of the school's entering class, or null if unknown. */
export function lsatOf(school: string): number | null {
  return data.schools[school]?.lsat ?? null;
}

/** Median undergraduate GPA of the school's entering class, or null if unknown. */
export function gpaOf(school: string): number | null {
  return data.schools[school]?.gpa ?? null;
}

/** The ABA's name for the school and any note on how it was matched. */
export function enrollmentInfo(school: string) {
  return data.schools[school] ?? null;
}

function tierFor<T extends TierId>(tiers: Tier<T>[], v: number | null): Tier<T> | null {
  if (v == null) return null;
  return tiers.find((d) => v >= d.min && (d.max == null || v < d.max)) ?? null;
}

export function divisionFor(enrollment: number | null): Division | null {
  return tierFor(DIVISIONS, enrollment);
}

/** A school's size division, or null when it has no ABA enrollment (it then appears only in the overall list). */
export function divisionOf(school: string): Division | null {
  return divisionFor(enrollmentOf(school));
}

/** A school's selectivity tier by median LSAT, or null when unknown. */
export function selectivityOf(school: string): Tier<SelectivityId> | null {
  return tierFor(SELECTIVITY, lsatOf(school));
}

export interface Grouping {
  id: GroupingId;
  /** Shown before the tier chips, e.g. "By size". */
  label: string;
  tiers: Tier[];
  tierOf(school: string): Tier | null;
  /** The measure, as shown beside a school, e.g. "553 JD students". */
  describe(school: string): string | null;
}

export const GROUPINGS: Grouping[] = [
  {
    id: 'size',
    label: 'By size',
    tiers: DIVISIONS,
    tierOf: divisionOf,
    describe: (s) => (enrollmentOf(s) == null ? null : `${enrollmentOf(s)} JD students`),
  },
  {
    id: 'lsat',
    label: 'By LSAT',
    tiers: SELECTIVITY,
    tierOf: selectivityOf,
    describe: (s) => (lsatOf(s) == null ? null : `median LSAT ${lsatOf(s)}, GPA ${gpaOf(s)?.toFixed(2)}`),
  },
];

/** The grouping a tier belongs to. */
export function groupingOfTier(id: TierId): Grouping {
  return GROUPINGS.find((g) => g.tiers.some((t) => t.id === id))!;
}

/** Keeps rows (already sorted best first) in one tier of either grouping. */
export function inTier<T extends { school: string }>(rows: T[], id: TierId): T[] {
  const g = groupingOfTier(id);
  return rows.filter((r) => g.tierOf(r.school)?.id === id);
}

/** Keeps rows (already sorted best first) in one size division. */
export function inDivision<T extends { school: string }>(rows: T[], id: DivisionId): T[] {
  return inTier(rows, id);
}
