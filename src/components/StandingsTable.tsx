import { Pressable, Text, View } from 'react-native';
import type { Standing } from '../lib/scoring';
import type { Team } from '../lib/types';
import { ballotsText, signed } from '../lib/format';
import { space, useTheme } from '../lib/theme';

export function StandingsTable({ standings, teams, onTeam }: { standings: Standing[]; teams: Team[]; onTeam?: (id: string) => void }) {
  const c = useTheme();
  const num = { width: 46, textAlign: 'right' as const, fontVariant: ['tabular-nums' as const], color: c.ink, fontSize: 14 };
  const head = { ...num, color: c.muted, fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 };
  return (
    <View>
      <View style={{ flexDirection: 'row', paddingHorizontal: space.lg, paddingVertical: 10, backgroundColor: c.surfaceAlt }}>
        <Text style={[head, { width: 28, textAlign: 'left' }]}>#</Text>
        <Text style={[head, { flex: 1, textAlign: 'left' }]}>TEAM</Text>
        <Text style={head}>W-L</Text>
        <Text style={head}>BAL</Text>
        <Text style={head}>CS</Text>
        <Text style={head}>PD</Text>
      </View>
      {standings.map((s, i) => {
        const team = teams.find((t) => t.id === s.teamId);
        return (
          <Pressable key={s.teamId} disabled={!onTeam} onPress={() => onTeam?.(s.teamId)} accessibilityRole={onTeam ? 'button' : undefined} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
            <Text style={[num, { width: 28, textAlign: 'left', fontWeight: '800', color: s.rank <= 3 ? c.accent : c.muted }]}>{s.rank}</Text>
            <Text style={{ flex: 1, color: c.ink, fontWeight: '600', fontSize: 15 }} numberOfLines={1}>
              {team?.name ?? 'Unknown team'}
            </Text>
            <Text style={num}>{`${s.wins}-${s.losses}${s.ties ? `-${s.ties}` : ''}`}</Text>
            <Text style={num}>{ballotsText(s.ballots)}</Text>
            <Text style={num}>{s.cs}</Text>
            <Text style={[num, { color: s.pointDiff >= 0 ? c.good : c.bad }]}>{signed(s.pointDiff)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
