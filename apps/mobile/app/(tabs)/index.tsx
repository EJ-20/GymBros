import { getHomeDashboardStats } from '@/src/analytics/homeStats';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import {
  fetchGlobalBenchmarks,
  topPercentFromPercentile,
  type GlobalBenchmarkPayload,
} from '@/src/sync/benchmarks';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { HomeDashboardStats } from '@/src/analytics/homeStats';
import { volumeKgToDisplayNumber, volumeUnitSuffix } from '@/src/lib/weightUnits';

function formatPct(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function leadershipLoadTile(
  bench: GlobalBenchmarkPayload | null,
  benchLoadError: string | null,
  user: unknown,
  backendReady: boolean
): { value: string; sub?: string; hint: string } {
  if (!backendReady) {
    return { value: '—', hint: 'Configure backend to see global rank' };
  }
  if (!user) {
    return { value: '—', hint: 'Sign in to see where you rank vs other lifters' };
  }
  if (benchLoadError) {
    return { value: '—', hint: benchLoadError };
  }
  if (!bench) {
    return { value: '…', hint: 'Loading cohort rank…' };
  }
  if (!bench.ok) {
    const hint =
      bench.message ??
      (bench.code === 'not_opted_in'
        ? 'Turn on global benchmarks under Account.'
        : 'Finish benchmark profile under Account, then sync.');
    return { value: '—', hint: hint };
  }
  const p = bench.global?.relative_weekly_load_percentile;
  if (p == null || Number.isNaN(p)) {
    return { value: '—', hint: 'Enable global benchmarks under Account.' };
  }
  const top = topPercentFromPercentile(p);
  return {
    value: `${formatPct(p)}%`,
    sub: 'ahead of lifters',
    hint:
      top != null
        ? `≈ Top ${top}% · weekly load vs body weight`
        : 'Weekly load vs body weight, global cohort',
  };
}

function sessionsRankWide(
  bench: GlobalBenchmarkPayload | null,
  benchLoadError: string | null,
  user: unknown,
  backendReady: boolean
): { value: string; hint: string } {
  if (!backendReady || !user || benchLoadError || !bench || !bench.ok) {
    return { value: '—', hint: 'workouts vs lifters' };
  }
  const p = bench.global?.sessions_7d_percentile;
  if (p == null || Number.isNaN(p)) {
    return { value: '—', hint: 'workouts vs lifters' };
  }
  const top = topPercentFromPercentile(p);
  return {
    value: `${formatPct(p)}%`,
    hint: top != null ? `ahead · ≈ top ${top}%` : 'ahead of cohort on frequency',
  };
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

function formatGymMinutes(totalMin: number): string {
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function HomeScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, backendReady, localDataVersion } = useAuth();
  const { unit } = useWeightUnit();
  const [stats, setStats] = useState<HomeDashboardStats>(() => getHomeDashboardStats());
  const [bench, setBench] = useState<GlobalBenchmarkPayload | null>(null);
  const [benchLoadError, setBenchLoadError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setStats(getHomeDashboardStats());
      let cancelled = false;
      if (!user || !backendReady) {
        setBench(null);
        setBenchLoadError(null);
        return () => {
          cancelled = true;
        };
      }
      void (async () => {
        const gb = await fetchGlobalBenchmarks();
        if (cancelled) return;
        if (gb.error) {
          setBenchLoadError(friendlyBackendError(gb.error));
          setBench(null);
        } else {
          setBenchLoadError(null);
          setBench(gb.data);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [localDataVersion, user, backendReady])
  );

  const { last7, prev7, last30, streakDays, allTimeCompleted, topExerciseLast7, lastSession, activeSession } =
    stats;

  const sessionDelta = deltaLabel(last7.sessions, prev7.sessions, 'session');
  const leadershipTile = leadershipLoadTile(bench, benchLoadError, user, backendReady);
  const sessionsRank = sessionsRankWide(bench, benchLoadError, user, backendReady);
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
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 100 + Math.max(insets.bottom, 0) },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, styles.sectionLabelFirst, { color: c.textMuted }]}>
          Last 7 days
        </Text>
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
            icon="trophy-outline"
            label="Leadership"
            value={leadershipTile.value}
            sub={leadershipTile.sub}
            hint={leadershipTile.hint}
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
        ) : null}

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
              <Text style={[styles.wideValue, { color: c.text }]}>{sessionsRank.value}</Text>
              <Text style={[styles.wideHint, { color: c.textMuted }]}>{sessionsRank.hint}</Text>
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

      <View
        pointerEvents="box-none"
        style={[
          styles.fabAnchor,
          {
            bottom: Math.max(insets.bottom, 16) + 16,
            paddingHorizontal: 24,
            justifyContent: I18nManager.isRTL ? 'flex-start' : 'flex-end',
          },
        ]}
      >
        <Link href="/(tabs)/workout" asChild>
          <Pressable
            style={({ pressed }) => [styles.workoutFabPressable, pressed && styles.workoutFabPressed]}
            accessibilityLabel={activeSession ? 'Continue workout' : 'Start workout'}
            accessibilityRole="button"
          >
            <View style={[styles.workoutFabSquare, { backgroundColor: c.tint, shadowColor: c.text }]}>
              <Ionicons name="add" size={34} color={c.onTintLight} />
            </View>
          </Pressable>
        </Link>
      </View>
    </View>
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
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 12, gap: 4 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 20,
    marginBottom: 10,
  },
  sectionLabelFirst: { marginTop: 0 },
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
  fabAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 10,
  },
  workoutFabPressable: {
    borderRadius: 18,
  },
  workoutFabPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
  /** Green fill lives on this View so web Link/anchor doesn’t strip backgroundColor. */
  workoutFabSquare: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
  },
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
