import { getHomeDashboardStats } from '@/src/analytics/homeStats';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { HomeDashboardStats } from '@/src/analytics/homeStats';
import { volumeKgToDisplayNumber, volumeUnitSuffix } from '@/src/lib/weightUnits';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatCompactDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function deltaLabel(current: number, previous: number, unit: string): { text: string; up: boolean | null } {
  if (previous === 0 && current === 0) return { text: `0 ${unit}`, up: null };
  if (previous === 0) return { text: `+${current} vs prior week`, up: true };
  const d = current - previous;
  if (d === 0) return { text: `Same as prior week`, up: null };
  return {
    text: `${d > 0 ? '+' : ''}${d} ${unit} vs prior week`,
    up: d > 0,
  };
}

function pctVolumeDelta(current: number, previous: number): { text: string; up: boolean | null } {
  if (previous === 0 && current === 0) return { text: 'No change', up: null };
  if (previous === 0) return { text: 'New volume this week', up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return { text: 'Same volume as prior week', up: null };
  return { text: `${pct > 0 ? '+' : ''}${pct}% volume vs prior week`, up: pct > 0 };
}

function formatGymMinutes(totalMin: number): string {
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function TodayScreen() {
  const c = useColors();
  const { localDataVersion } = useAuth();
  const { unit } = useWeightUnit();
  const [stats, setStats] = useState<HomeDashboardStats>(() => getHomeDashboardStats());

  useFocusEffect(
    useCallback(() => {
      setStats(getHomeDashboardStats());
    }, [localDataVersion])
  );

  const { last7, prev7, last30, streakDays, allTimeCompleted, topExerciseLast7, lastSession, activeSession } =
    stats;

  const sessionDelta = deltaLabel(last7.sessions, prev7.sessions, 'session');
  const volumeDelta = pctVolumeDelta(last7.volumeKg, prev7.volumeKg);
  const vol7Display = volumeKgToDisplayNumber(last7.volumeKg, unit);
  const vol30Display = volumeKgToDisplayNumber(last30.volumeKg, unit);
  const lastSessVolDisplay = lastSession
    ? volumeKgToDisplayNumber(repo.sessionVolumeKg(lastSession.id), unit)
    : 0;

  const lastDurationMin =
    lastSession?.endedAt != null
      ? Math.round(
          (new Date(lastSession.endedAt).getTime() - new Date(lastSession.startedAt).getTime()) / 60_000
        )
      : null;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerBlock}>
        <Text style={[styles.kicker, { color: c.textMuted }]}>{greeting()}</Text>
        <Text style={[styles.heroTitle, { color: c.text }]}>Today</Text>
        <Text style={[styles.dateLine, { color: c.textMuted }]}>
          {new Date().toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {activeSession ? (
        <View style={[styles.heroCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.heroAccent, { backgroundColor: c.tint }]} />
          <View style={styles.heroInner}>
            <View style={styles.heroRow}>
              <View style={[styles.pulseDot, { backgroundColor: c.tint }]} />
              <Text style={[styles.heroLabel, { color: c.tint }]}>In progress</Text>
            </View>
            <Text style={[styles.heroHeadline, { color: c.text }]}>Workout running</Text>
            <Text style={[styles.heroMeta, { color: c.textMuted }]}>
              Started {formatCompactDate(activeSession.startedAt)} ·{' '}
              {new Date(activeSession.startedAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
            <Link href="/(tabs)/workout" asChild>
              <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
                <Text style={[styles.primaryBtnText, { color: c.onTint }]}>Continue workout</Text>
                <Ionicons name="arrow-forward" size={18} color={c.onTint} style={styles.btnIcon} />
              </Pressable>
            </Link>
          </View>
        </View>
      ) : (
        <View style={[styles.heroCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.heroAccent, { backgroundColor: c.tint }]} />
          <View style={styles.heroInner}>
            <Text style={[styles.heroHeadline, { color: c.text }]}>Ready when you are</Text>
            <Text style={[styles.heroMeta, { color: c.textMuted }]}>
              Log sets, save routines, and sync from Account when you are online.
            </Text>
            <Link href="/(tabs)/workout" asChild>
              <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
                <Ionicons name="barbell-outline" size={20} color={c.tint} style={styles.btnIconLeft} />
                <Text style={[styles.primaryBtnText, { color: c.tint }]}>Start workout</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Last 7 days</Text>
      <View style={styles.statGrid}>
        <StatTile
          c={c}
          icon="calendar-outline"
          label="Sessions"
          value={String(last7.sessions)}
          hint={sessionDelta.text}
          hintUp={sessionDelta.up}
        />
        <StatTile
          c={c}
          icon="bar-chart-outline"
          label="Volume"
          value={
            vol7Display >= 1000
              ? `${(vol7Display / 1000).toFixed(1)}k`
              : String(vol7Display)
          }
          sub={volumeUnitSuffix(unit)}
          hint={volumeDelta.text}
          hintUp={volumeDelta.up}
        />
        <StatTile
          c={c}
          icon="flame-outline"
          label="Streak"
          value={streakDays > 0 ? `${streakDays}d` : '—'}
          hint={streakDays > 0 ? 'Consecutive training days' : 'Train any day to start'}
        />
        <StatTile
          c={c}
          icon="time-outline"
          label="Time in gym"
          value={formatGymMinutes(last7.totalMin)}
          hint="Completed sessions, last 7 days"
        />
      </View>

      <View style={[styles.wideCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={styles.wideHeader}>
          <Ionicons name="trending-up-outline" size={20} color={c.tint} />
          <Text style={[styles.wideTitle, { color: c.text }]}>Last 30 days</Text>
        </View>
        <View style={styles.wideRow}>
          <View style={styles.wideCol}>
            <Text style={[styles.wideValue, { color: c.text }]}>{last30.sessions}</Text>
            <Text style={[styles.wideHint, { color: c.textMuted }]}>sessions</Text>
          </View>
          <View style={[styles.wideDivider, { backgroundColor: c.border }]} />
          <View style={styles.wideCol}>
            <Text style={[styles.wideValue, { color: c.text }]}>
              {vol30Display.toLocaleString()}
            </Text>
            <Text style={[styles.wideHint, { color: c.textMuted }]}>
              {volumeUnitSuffix(unit)} volume
            </Text>
          </View>
          <View style={[styles.wideDivider, { backgroundColor: c.border }]} />
          <View style={styles.wideCol}>
            <Text style={[styles.wideValue, { color: c.text }]}>{allTimeCompleted}</Text>
            <Text style={[styles.wideHint, { color: c.textMuted }]}>finished (all time)</Text>
          </View>
        </View>
      </View>

      {topExerciseLast7 ? (
        <View style={[styles.insightCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.sectionLabel, { color: c.textMuted, marginBottom: 6 }]}>Most sets (7d)</Text>
          <Text style={[styles.insightTitle, { color: c.text }]}>{topExerciseLast7.name}</Text>
          <Text style={{ color: c.textMuted, fontSize: 14 }}>
            {topExerciseLast7.setCount} set{topExerciseLast7.setCount === 1 ? '' : 's'} logged this week
          </Text>
        </View>
      ) : null}

      {lastSession ? (
        <View style={[styles.lastCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.lastHeader}>
            <Text style={[styles.sectionLabel, { color: c.textMuted, marginBottom: 0 }]}>Last session</Text>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{formatCompactDate(lastSession.startedAt)}</Text>
          </View>
          <Text style={[styles.lastVolume, { color: c.text }]}>
            {lastSessVolDisplay.toLocaleString()} {volumeUnitSuffix(unit)}
            {lastSession.perceivedExertion != null ? ` · RPE ${lastSession.perceivedExertion}` : ''}
          </Text>
          <Text style={{ color: c.textMuted, fontSize: 14 }}>
            {lastDurationMin != null ? `${lastDurationMin} min` : ''}
          </Text>
          {lastSession.notes ? (
            <Text style={{ color: c.textMuted, fontSize: 14 }} numberOfLines={2}>
              {lastSession.notes}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.emptyHint, { borderColor: c.border }]}>
          <Text style={{ color: c.textMuted, textAlign: 'center', lineHeight: 20 }}>
            Complete a workout to unlock week-over-week trends and streaks.
          </Text>
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Shortcuts</Text>
      <View style={styles.shortcuts}>
        <Link href="/routines" asChild>
          <Pressable style={[styles.shortcutBtn, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="list-outline" size={22} color={c.tint} />
            <Text style={[styles.shortcutText, { color: c.text }]}>Routines</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/history" asChild>
          <Pressable style={[styles.shortcutBtn, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="calendar-outline" size={22} color={c.tint} />
            <Text style={[styles.shortcutText, { color: c.text }]}>History</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)/compare" asChild>
          <Pressable style={[styles.shortcutBtn, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="people-outline" size={22} color={c.tint} />
            <Text style={[styles.shortcutText, { color: c.text }]}>Compare</Text>
          </Pressable>
        </Link>
      </View>
    </ScrollView>
  );
}

function StatTile({
  c,
  icon,
  label,
  value,
  sub,
  hint,
  hintUp,
}: {
  c: ReturnType<typeof useColors>;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  sub?: string;
  hint: string;
  hintUp?: boolean | null;
}) {
  return (
    <View style={[styles.statTile, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.statTileTop}>
        <Ionicons name={icon} size={18} color={c.tint} />
        <Text style={[styles.statLabel, { color: c.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      {sub ? <Text style={[styles.statSub, { color: c.textMuted }]}>{sub}</Text> : null}
      <Text
        style={[
          styles.statHint,
          {
            color:
              hintUp === true ? c.tint : hintUp === false ? c.danger : c.textMuted,
          },
        ]}
        numberOfLines={2}
      >
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48, gap: 4 },
  headerBlock: { marginBottom: 8 },
  kicker: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  heroTitle: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  dateLine: { fontSize: 15, marginTop: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 10,
  },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  heroAccent: { width: 4 },
  heroInner: { flex: 1, padding: 18, gap: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  heroLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroHeadline: { fontSize: 22, fontWeight: '700' },
  heroMeta: { fontSize: 15, lineHeight: 22 },
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryBtnText: { fontWeight: '700', fontSize: 16 },
  btnIcon: { marginLeft: 4 },
  btnIconLeft: { marginRight: -4 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  statTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  statTileTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  statSub: { fontSize: 12, marginTop: -2 },
  statHint: { fontSize: 11, lineHeight: 15, marginTop: 6 },
  wideCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 6, gap: 12 },
  wideHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wideTitle: { fontSize: 17, fontWeight: '700' },
  wideRow: { flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between' },
  wideCol: { flex: 1, alignItems: 'center', minWidth: 0 },
  wideValue: { fontSize: 18, fontWeight: '800' },
  wideHint: { fontSize: 11, marginTop: 2, textAlign: 'center' },
  wideDivider: { width: 1, minHeight: 40, alignSelf: 'center' },
  insightCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 6 },
  insightTitle: { fontSize: 18, fontWeight: '700' },
  lastCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginTop: 6, gap: 6 },
  lastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lastVolume: { fontSize: 17, fontWeight: '700' },
  emptyHint: {
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4, marginBottom: 8 },
  shortcutBtn: {
    flex: 1,
    minWidth: '30%',
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  shortcutText: { fontSize: 13, fontWeight: '600' },
});
