// Catalog of rules competitions commonly set. Organizers tick the ones that apply in the
// wizard; ticked rules (with any values) appear on the competition's page.

export type RuleValue = boolean | number | string;
export type RuleSet = Record<string, RuleValue>;

export interface RuleDef {
  id: string;
  label: string;
  help?: string;
  /** Extra numeric detail shown when the rule is ticked. */
  value?: { id: string; label: string; unit: string; default: number };
}

export interface RuleGroup {
  title: string;
  rules: RuleDef[];
}

export const RULE_GROUPS: RuleGroup[] = [
  {
    title: 'Witnesses',
    rules: [
      {
        id: 'woodshedding',
        label: 'Woodshedding allowed',
        help: 'Teams may prepare their witnesses before the trial.',
        value: { id: 'woodsheddingMinutes', label: 'Time allowed before each round', unit: 'minutes', default: 30 },
      },
      { id: 'ownWitnesses', label: 'Teams supply their own witnesses', help: 'Otherwise the host provides witnesses for both sides.' },
      { id: 'witnessChoice', label: 'Teams choose which witnesses to call', help: 'Picked from the case file pool before each round.' },
      {
        id: 'witnessNotice',
        label: 'Witness call order disclosed in advance',
        value: { id: 'witnessNoticeMinutes', label: 'Notice before the round', unit: 'minutes', default: 15 },
      },
      { id: 'anyGender', label: 'Witnesses may be played by any gender', help: 'Teams may change pronouns and names to match.' },
      {
        id: 'inventionRule',
        label: 'Unfair extrapolation (invention of fact) objection',
        help: 'Witnesses may not invent material facts beyond the case file.',
      },
    ],
  },
  {
    title: 'Argument and evidence',
    rules: [
      {
        id: 'negativeInference',
        label: 'Negative inference rule',
        help: 'No argument that the other side is hiding something because a fact, document, or witness is not in the case file.',
      },
      { id: 'fre', label: 'Federal Rules of Evidence apply', help: 'Otherwise the competition’s own evidence rules apply.' },
      { id: 'pretrialMotion', label: 'Pretrial motion argued before trial' },
      { id: 'demonstratives', label: 'Team-made demonstrative exhibits allowed' },
      { id: 'jury', label: 'Jury trial (judges score as jurors)', help: 'Otherwise it is a bench trial.' },
      { id: 'rebuttal', label: 'Rebuttal closing allowed for plaintiff or prosecution' },
    ],
  },
  {
    title: 'Time limits',
    rules: [
      { id: 'timeTotal', label: 'Total time per side', help: 'One clock per side covering the whole trial.', value: { id: 'totalMinutes', label: 'Per side', unit: 'minutes', default: 70 } },
      { id: 'timeOpening', label: 'Opening statement limit', value: { id: 'openingMinutes', label: 'Per side', unit: 'minutes', default: 5 } },
      { id: 'timeDirect', label: 'Direct and redirect limit', value: { id: 'directMinutes', label: 'Per side, all witnesses', unit: 'minutes', default: 25 } },
      { id: 'timeCross', label: 'Cross and recross limit', value: { id: 'crossMinutes', label: 'Per side, all witnesses', unit: 'minutes', default: 20 } },
      { id: 'timeClosing', label: 'Closing argument limit', value: { id: 'closingMinutes', label: 'Per side, including rebuttal', unit: 'minutes', default: 9 } },
      { id: 'clockStops', label: 'Clock stops for objections' },
      { id: 'ownTimekeeper', label: 'Each team brings its own timekeeper' },
    ],
  },
  {
    title: 'Conduct',
    rules: [
      { id: 'noScouting', label: 'Scouting other teams is prohibited' },
      { id: 'noCoachContact', label: 'No coach contact with the team during a trial' },
      { id: 'spectators', label: 'Spectators allowed in courtrooms' },
      { id: 'recordingAllowed', label: 'Teams may record their own rounds' },
    ],
  },
  {
    title: 'Eligibility',
    rules: [
      { id: 'teamsPerSchool', label: 'Limit on teams per school', value: { id: 'teamsPerSchoolMax', label: 'Most teams per school', unit: 'teams', default: 2 } },
      { id: 'rosterMin', label: 'Minimum team roster', value: { id: 'rosterMinCount', label: 'At least', unit: 'students', default: 4 } },
      { id: 'rosterMax', label: 'Maximum team roster', value: { id: 'rosterMaxCount', label: 'At most', unit: 'students', default: 6 } },
      { id: 'upperLevelOnly', label: 'Only 2L and 3L students may compete' },
    ],
  },
];

export const ALL_RULES = RULE_GROUPS.flatMap((g) => g.rules);

/** The ticked rules, as short lines for the competition page. */
export function describeRules(rules: RuleSet): { group: string; lines: string[] }[] {
  return RULE_GROUPS.map((g) => ({
    group: g.title,
    lines: g.rules
      .filter((r) => rules[r.id] === true)
      .map((r) => (r.value ? `${r.label}: ${rules[r.value.id] ?? r.value.default} ${r.value.unit}` : r.label)),
  })).filter((g) => g.lines.length > 0);
}
