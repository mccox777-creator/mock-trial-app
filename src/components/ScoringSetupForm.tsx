import { View } from 'react-native';
import { Body, Card, Field, Label, Segmented } from './ui';
import { CheckRow } from './RulesChecklist';
import { COMMENT_MODES, SCALES, SHEET_MIN, SHEET_PARTS, sheetLines } from '../lib/judging';
import type { CommentMode, ScoringSetup } from '../lib/types';
import { space } from '../lib/theme';

export const MAX_EXTRA_LINES = 6;
export const parseExtraLines = (text: string) => text.split('\n').map((l) => l.trim()).filter(Boolean);

/** The organizer's score sheet setup: the scale, what gets scored, and any lines of their own. */
export function ScoringSetupForm({
  scoring,
  extraText,
  witnessesPerSide,
  onChange,
  onExtraText,
  error,
}: {
  scoring: ScoringSetup;
  extraText: string;
  witnessesPerSide: number;
  onChange: (next: ScoringSetup) => void;
  onExtraText: (text: string) => void;
  error?: string;
}) {
  const lines = sheetLines(witnessesPerSide, { ...scoring, extra: parseExtraLines(extraText) });
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 6 }}>
        <Label>Scale for every line</Label>
        <Segmented value={String(scoring.max)} onChange={(v) => onChange({ ...scoring, max: Number(v) })} options={SCALES.map((n) => ({ id: String(n), label: `${SHEET_MIN} to ${n}` }))} />
      </View>
      <View style={{ gap: space.sm }}>
        <Label>What judges score</Label>
        {SHEET_PARTS.map((part) => {
          const on = scoring.parts.includes(part.id);
          return (
            <CheckRow
              key={part.id}
              label={part.label}
              help={part.help}
              on={on}
              onToggle={() => onChange({ ...scoring, parts: on ? scoring.parts.filter((x) => x !== part.id) : [...scoring.parts, part.id] })}
            />
          );
        })}
      </View>
      <View style={{ gap: 6 }}>
        <Label>Judges' comments</Label>
        <Segmented<CommentMode>
          value={scoring.comments}
          onChange={(v) => onChange({ ...scoring, comments: v })}
          options={[{ id: 'none', label: 'None' }, { id: 'overall', label: 'One box' }, { id: 'per_line', label: 'Each line' }, { id: 'both', label: 'Both' }]}
        />
        <Body muted>{COMMENT_MODES.find((m) => m.id === scoring.comments)?.help} Teams see comments only if you return ballots to them.</Body>
      </View>
      <Field
        label={`Your own lines (optional, up to ${MAX_EXTRA_LINES})`}
        value={extraText}
        onChangeText={onExtraText}
        multiline
        placeholder="One per line. For example: Team presentation overall"
      />
      {error && <Body style={{ color: '#B3261E' }}>{error}</Body>}
      <Card>
        <Label>Judges will see</Label>
        <Body muted>
          {lines.length} line{lines.length === 1 ? '' : 's'} per side, each scored {SHEET_MIN} to {scoring.max}. Highest possible total: {lines.length * scoring.max}.
        </Body>
        {lines.map((l, i) => (
          <Body key={i}>
            {i + 1}. {l}
          </Body>
        ))}
      </Card>
    </View>
  );
}
