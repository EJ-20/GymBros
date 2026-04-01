import { useColors } from '@/src/hooks/useColors';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { volumeKgToDisplayNumber, volumeUnitSuffix } from '@/src/lib/weightUnits';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import {
  fetchGlobalBenchmarks,
  topPercentFromPercentile,
  type GlobalBenchmarkPayload,
} from '@/src/sync/benchmarks';
import {
  acceptFriendship,
  fetchFriendCompare,
  listPendingIncoming,
  sendFriendRequest,
} from '@/src/sync/social';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendSummary } from '@gymbros/shared';

function formatPct(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function BenchLine({
  c,
  label,
  percentile,
}: {
  c: ReturnType<typeof useColors>;
  label: string;
  percentile: number;
}) {
  const top = topPercentFromPercentile(percentile);
  return (
    <View
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: c.border,
      }}
    >
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 17, marginTop: 2 }}>
        Ahead of {formatPct(percentile)}% of your cohort
      </Text>
      {top != null ? (
        <Text style={{ color: c.tint, fontWeight: '700', marginTop: 4 }}>≈ Top {top}%</Text>
      ) : null}
    </View>
  );
}

export default function CompareScreen() {
  const c = useColors();
  const { user, backendReady, localDataVersion } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pending, setPending] = useState<{ id: string; requesterId: string }[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bench, setBench] = useState<GlobalBenchmarkPayload | null>(null);
  const [benchLoadError, setBenchLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setPending([]);
      setLoadError(null);
      setBench(null);
      setBenchLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setBenchLoadError(null);
    const [cmp, inc, gb] = await Promise.all([
      fetchFriendCompare(),
      listPendingIncoming(),
      fetchGlobalBenchmarks(),
    ]);
    if (cmp.error) {
      setLoadError(friendlyBackendError(cmp.error));
      setFriends([]);
    } else {
      setFriends(cmp.data ?? []);
    }
    setPending(inc);
    if (gb.error) {
      setBenchLoadError(friendlyBackendError(gb.error));
      setBench(null);
    } else {
      setBench(gb.data);
    }
    setLoading(false);
  }, [user, localDataVersion]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const invite = async () => {
    const id = friendIdInput.trim();
    if (!id) {
      showAlert('Friend id', 'Paste your friend’s user id from their Account screen.');
      return;
    }
    const { error } = await sendFriendRequest(id);
    if (error) showAlert('Invite', friendlyBackendError(error));
    else {
      showAlert('Sent', 'Friend request sent.');
      setFriendIdInput('');
    }
  };

  const accept = async (fid: string) => {
    const { error } = await acceptFriendship(fid);
    if (error) showAlert('Accept', friendlyBackendError(error));
    else load();
  };

  if (!backendReady) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Add your Supabase URL and anon key (see README), restart the app, then sign in for friend
          compare and optional global benchmarks.
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Sign in to compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Friends only see stats you enable under Account. Global rankings use age, weight, and optional
          country—opt in under Account → benchmarks. Share your user id for friend requests.
        </Text>
        <Link href="/sign-in" asChild>
          <Pressable style={[styles.linkCta, { backgroundColor: c.tint }]}>
            <Text style={[styles.linkCtaText, { color: c.onTint }]}>Sign in</Text>
          </Pressable>
        </Link>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
      data={friends}
      keyExtractor={(f) => f.userId}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.tint} colors={[c.tint]} />
      }
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={[styles.title, { color: c.text }]}>Global &amp; regional</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
            Cohorts match your benchmark group (sex category), age, and weight; height and training years tighten
            the match when you and others fill them in. Load is weekly volume divided by body weight; cardio uses
            timed sets on Cardio exercises (e.g. Run / treadmill). Add country in Account for regional percentiles.
          </Text>

          {loading && !bench && !benchLoadError ? (
            <Text style={{ color: c.textMuted, fontSize: 14 }}>Loading benchmarks…</Text>
          ) : null}

          {benchLoadError ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={{ color: c.danger, fontWeight: '600' }}>Benchmarks</Text>
              <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 4 }}>{benchLoadError}</Text>
            </View>
          ) : bench && !bench.ok ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={{ color: c.text, fontWeight: '700' }}>Benchmarks</Text>
              <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                {bench.message ??
                  (bench.code === 'not_opted_in'
                    ? 'Turn on global benchmarks and save body weight + birth year under Account.'
                    : 'Complete your benchmark profile under Account, sync workouts, then pull to refresh.')}
              </Text>
              {bench.cohort_sample_size != null ? (
                <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 8 }}>
                  Cohort size right now: {bench.cohort_sample_size}
                </Text>
              ) : null}
            </View>
          ) : bench?.ok && bench.global ? (
            <View style={{ gap: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                {bench.cohort_description ?? 'Your cohort'}
              </Text>
              <View style={[styles.card, { backgroundColor: c.card, borderColor: c.tint, borderWidth: 1.5 }]}>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Globally</Text>
                <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>
                  Sample: {bench.global.sample_size} people
                </Text>
                <BenchLine
                  c={c}
                  label="Weekly load vs body weight"
                  percentile={bench.global.relative_weekly_load_percentile}
                />
                <BenchLine
                  c={c}
                  label="Workouts (7 days)"
                  percentile={bench.global.sessions_7d_percentile}
                />
                <BenchLine
                  c={c}
                  label="Cardio time (7 days)"
                  percentile={bench.global.cardio_minutes_7d_percentile}
                />
              </View>
              {bench.region ? (
                <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
                  <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
                    In {bench.region.country_code ?? 'your region'}
                  </Text>
                  {bench.region.note ? (
                    <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 6 }}>{bench.region.note}</Text>
                  ) : (
                    <>
                      <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>
                        Sample: {bench.region.sample_size} people
                      </Text>
                      {bench.region.relative_weekly_load_percentile != null ? (
                        <BenchLine
                          c={c}
                          label="Weekly load vs body weight"
                          percentile={bench.region.relative_weekly_load_percentile}
                        />
                      ) : null}
                      {bench.region.sessions_7d_percentile != null ? (
                        <BenchLine
                          c={c}
                          label="Workouts (7 days)"
                          percentile={bench.region.sessions_7d_percentile}
                        />
                      ) : null}
                      {bench.region.cardio_minutes_7d_percentile != null ? (
                        <BenchLine
                          c={c}
                          label="Cardio time (7 days)"
                          percentile={bench.region.cardio_minutes_7d_percentile}
                        />
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          <Text style={[styles.title, { color: c.text, marginTop: 8 }]}>Friends</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
            Friend comparison is private. Each person enables weekly volume, session count, or best lift
            in Account → privacy.
          </Text>

          {loadError ? (
            <View style={[styles.errorBanner, { backgroundColor: c.card, borderColor: c.danger }]}>
              <Text style={{ color: c.danger, fontWeight: '600', marginBottom: 4 }}>Could not load</Text>
              <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>{loadError}</Text>
              <Pressable onPress={load} style={{ marginTop: 10 }}>
                <Text style={{ color: c.tint, fontWeight: '600' }}>Try again</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.text }]}>Friend user id</Text>
            <TextInput
              value={friendIdInput}
              onChangeText={setFriendIdInput}
              placeholder="Paste UUID from their Account screen"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
            />
            <Pressable style={[styles.btn, { backgroundColor: c.tint }]} onPress={invite}>
              <Text style={[styles.btnText, { color: c.onTint }]}>Send request</Text>
            </Pressable>
          </View>

          {pending.length > 0 ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.label, { color: c.text }]}>Incoming requests</Text>
              {pending.map((p) => (
                <View key={p.id} style={styles.rowBetween}>
                  <Text style={{ color: c.textMuted, flex: 1, marginRight: 8 }} numberOfLines={1}>
                    {p.requesterId}
                  </Text>
                  <Pressable onPress={() => accept(p.id)} style={styles.linkBtn} hitSlop={8}>
                    <Text style={{ color: c.tint, fontWeight: '600' }}>Accept</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          <Text style={[styles.label, { color: c.text, marginTop: 4 }]}>Shared stats</Text>
        </View>
      }
      ListEmptyComponent={
        !loading && !loadError ? (
          <Text style={{ color: c.textMuted, lineHeight: 20 }}>
            No friends yet. Send a request with their user id, or wait for them to accept. Both of
            you need accepted friendship and shared metrics enabled to see numbers here.
          </Text>
        ) : null
      }
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.fname, { color: c.text }]}>
            {item.displayName ?? item.userId.slice(0, 8) + '…'}
          </Text>
          {item.weeklyVolumeKg != null ? (
            <Text style={{ color: c.textMuted }}>
              7d volume: {volumeKgToDisplayNumber(item.weeklyVolumeKg, unit).toLocaleString()}{' '}
              {volumeUnitSuffix(unit)}
            </Text>
          ) : null}
          {item.sessionCount7d != null ? (
            <Text style={{ color: c.textMuted }}>Sessions (7d): {item.sessionCount7d}</Text>
          ) : null}
          {item.bestLiftLabel ? (
            <Text style={{ color: c.textMuted }}>Best lift: {item.bestLiftLabel}</Text>
          ) : null}
          {item.weeklyVolumeKg == null &&
          item.sessionCount7d == null &&
          !item.bestLiftLabel ? (
            <Text style={{ color: c.textMuted }}>No shared metrics</Text>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 8 },
  errorBanner: { borderRadius: 12, padding: 14, borderWidth: 1 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  btn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { fontWeight: '700' },
  fname: { fontSize: 17, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkBtn: { paddingVertical: 8, paddingHorizontal: 4 },
  linkCta: { marginTop: 20, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10 },
  linkCtaText: { fontWeight: '700', fontSize: 16 },
});
