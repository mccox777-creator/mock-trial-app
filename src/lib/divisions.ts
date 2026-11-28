// Size divisions for the Mock Trial ELO Ratings, the way college football groups schools by size.
// The ratings themselves don't change: every school keeps one rating from every competition it
// entered, including wins over schools in other divisions. Divisions only decide which list a school
// also appears in, next to the overall list.
//
// Size = total JD enrollment (all class years, full and part time) from the ABA Standard 509
// compilation, built by scripts/enrollment/build.py into src/data/school-enrollment.json.
import enrollmentData from '../data/school-enrollment.json';

export type DivisionId = 'large' | 'mid' | 'small';

export interface Division {
  id: DivisionId;
  label: string;
  /** Short label for chips and tabs. */
  short: string;
  /** Inclusive lower bound of total JD enrollment. */
  min: number;
  /** Exclusive upper bound, or null for no limit. */
  max: number | null;
}

/** Largest first. Cutoffs: under 500, 500 to 799, 800 and up. */
export const DIVISIONS: Division[] = [
  { id: 'large', label: 'Large schools (800+ JD students)', short: 'Large', min: 800, max: null },
  { id: 'mid', label: 'Mid-size schools (500–799 JD students)', short: 'Mid-size', min: 500, max: 800 },
  { id: 'small', label: 'Small schools (under 500 JD students)', short: 'Small', min: 0, max: 500 },
];

interface EnrollmentFile {
  source: string;
  sourceUrl: string;
  year: number;
  schools: Record<string, { enrollment: number | null; aba?: string; note?: string }>;
}

const data = enrollmentData as EnrollmentFile;

export const ENROLLMENT_SOURCE = { source: data.source, url: data.sourceUrl, year: data.year };

/** Total JD enrollment for a school, by its name in the ratings, or null if unknown. */
export function enrollmentOf(school: string): number | null {
  return data.schools[school]?.enrollment ?? null;
}

/** The ABA's name for the school and any note on how it was matched. */
export function enrollmentInfo(school: string) {
  return data.schools[school] ?? null;
}

export function divisionFor(enrollment: number | null): Division | null {
  if (enrollment == null) return null;
  return DIVISIONS.find((d) => enrollment >= d.min && (d.max == null || enrollment < d.max)) ?? null;
}

/** A school's division, or null when it has no ABA enrollment (it then appears only in the overall list). */
export function divisionOf(school: string): Division | null {
  return divisionFor(enrollmentOf(school));
}

/** Keeps rows (already sorted best first) in one division. */
export function inDivision<T extends { school: string }>(rows: T[], id: DivisionId): T[] {
  return rows.filter((r) => divisionOf(r.school)?.id === id);
}
