import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import type { HealthDailySnapshot } from '@/src/health/healthRepo';
import { fetchTodayStepCountFromDevice } from '@/src/health/deviceSteps';
import { listRecentHealthDaily, localCalendarDayKey, mergeHealthDaily } from '@/src/health/healthRepo';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function fmtInt(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return String(Math.round(n));
}

function fmt1(n: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toFixed(1);
}

function fmtSleep(min: number | null): string {
  if (min == null || Number.isNaN(min)) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function Metric({
  label,
  value,
  c,
}: {
  label: string;
  value: string;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.metric, { borderColor: c.border }]}>
      <Text style={[styles.metricLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

function DayCard({ row, c }: { row: HealthDailySnapshot; c: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.dayTitle, { color: c.text }]}>{row.day}</Text>
        <Text style={[styles.sourcePill, { color: c.textMuted }]}>{row.source}</Text>
      </View>
      <View style={styles.grid}>
        <Metric label="Steps" value={fmtInt(row.steps)} c={c} />
        <Metric label="Active kcal" value={fmt1(row.activeEnergyKcal)} c={c} />
        <Metric label="Sleep" value={fmtSleep(row.sleepMinutes)} c={c} />
        <Metric label="Exercise min" value={fmtInt(row.exerciseMinutes)} c={c} />
        <Metric label="Resting HR" value={fmtInt(row.restingHeartRateBpm)} c={c} />
        <Metric label="Avg HR" value={fmtInt(row.avgHeartRateBpm)} c={c} />
        <Metric label="Distance (km)" value={row.distanceMeters != null ? fmt1(row.distanceMeters / 1000) : '—'} c={c} />
        <Metric label="VO₂ max" value={fmt1(row.vo2Max)} c={c} />
        <Metric label="SpO₂ %" value={fmt1(row.bloodOxygenPercent)} c={c} />
        <Metric label="Resp. rate" value={fmt1(row.respiratoryRate)} c={c} />
        <Metric label="HRV (ms)" value={fmtInt(row.hrvSdnnMs)} c={c} />
        <Metric label="Weight (kg)" value={fmt1(row.bodyMassKg)} c={c} />
      </View>
    </View>
  );
}

export default function HealthScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<HealthDailySnapshot[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncHint, setSyncHint] = useState<string | null>(null);

  const reload = useCallback(() => {
    setRows(listRecentHealthDaily(21));
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const onSyncSteps = useCallback(async () => {
    setSyncHint(null);
    setSyncing(true);
    try {
      const result = await fetchTodayStepCountFromDevice();
      if (!result.ok) {
        setSyncHint(result.reason);
        return;
      }
      mergeHealthDaily({
        day: localCalendarDayKey(new Date()),
        steps: result.steps,
        source: 'phone',
      });
      reload();
      setSyncHint(`Saved ${result.steps} steps for today.`);
    } finally {
      setSyncing(false);
    }
  }, [reload]);

  const showStepSync = Platform.OS === 'ios' || Platform.OS === 'android';

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.background }]}
      contentContainerStyle={{
        paddingTop: 12,
        paddingBottom: 24 + insets.bottom,
        paddingHorizontal: 16,
      }}
      {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
    >
      <Text style={[styles.title, { color: c.text }]}>Health</Text>
      <Text style={[styles.subtitle, { color: c.textMuted }]}>
        Daily metrics from your watch or phone. Native watch code can call{' '}
        <Text style={{ fontFamily: 'monospace' }}>reportWatchHealthSnapshot</Text> with the same
        fields; iOS/Android can also pull today’s steps below (includes watch-contributed steps when
        the OS exposes them).
      </Text>

      {showStepSync ? (
        <Pressable
          onPress={onSyncSteps}
          disabled={syncing}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.tint, opacity: pressed || syncing ? 0.85 : 1 },
          ]}
        >
          {syncing ? (
            <ActivityIndicator color={c.onTint} />
          ) : (
            <>
              <Ionicons name="footsteps-outline" size={20} color={c.onTint} />
              <Text style={[styles.ctaLabel, { color: c.onTint }]}>Sync today’s steps</Text>
            </>
          )}
        </Pressable>
      ) : (
        <Text style={[styles.webNote, { color: c.textMuted }]}>
          Open the mobile app on iOS or Android to sync steps and see watch-backed data.
        </Text>
      )}

      {syncHint ? (
        <Text style={[styles.hint, { color: c.textMuted }]}>{syncHint}</Text>
      ) : null}

      {rows.length === 0 ? (
        <Text style={[styles.empty, { color: c.textMuted }]}>
          No health rows yet. Sync steps or connect a watch build that posts daily snapshots.
        </Text>
      ) : (
        rows.map((row) => <DayCard key={row.day} row={row} c={c} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  ctaLabel: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginBottom: 16 },
  webNote: { fontSize: 14, marginBottom: 16 },
  empty: { fontSize: 15, marginTop: 8 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  dayTitle: { fontSize: 17, fontWeight: '600' },
  sourcePill: { fontSize: 12, textTransform: 'capitalize' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    width: '31%',
    minWidth: 100,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  metricLabel: { fontSize: 11, marginBottom: 4 },
  metricValue: { fontSize: 15, fontWeight: '600' },
});
