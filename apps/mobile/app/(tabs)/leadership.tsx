import { KeyboardAvoidingScreen } from '@/src/components/KeyboardAvoidingScreen';
import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
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
  cancelOutgoingFriendRequest,
  fetchFriendLeadership,
  fetchMyTrainingStats,
  listOutgoingPending,
  listPendingIncoming,
  searchProfilesForContacts,
  sendFriendRequest,
} from '@/src/sync/social';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { FriendSummary, MyTrainingStats, ProfileSearchHit } from '@gymbros/shared';

function formatPct(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
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

function SectionTitle({
  c,
  title,
  subtitle,
  icon,
}: {
  c: ReturnType<typeof useColors>;
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIconWrap, { backgroundColor: c.background }]}>
        <Ionicons name={icon} size={20} color={c.tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sectionSub, { color: c.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
    </View>
  );
}

type LeaderRow = {
  rank: number;
  label: string;
  volume: number | null;
  sessions: number | null;
  isSelf: boolean;
};

export default function LeadershipScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, backendReady, localDataVersion } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pending, setPending] = useState<{ id: string; requesterId: string }[]>([]);
  const [outgoing, setOutgoing] = useState<{ id: string; addresseeId: string }[]>([]);
  const [myStats, setMyStats] = useState<MyTrainingStats | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchHits, setSearchHits] = useState<ProfileSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [bench, setBench] = useState<GlobalBenchmarkPayload | null>(null);
  const [benchLoadError, setBenchLoadError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 380);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (debouncedSearch.length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    void searchProfilesForContacts(debouncedSearch).then(({ data, error }) => {
      if (cancelled) return;
      setSearchLoading(false);
      if (error) {
        setSearchHits([]);
        return;
      }
      setSearchHits(data);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const load = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setPending([]);
      setOutgoing([]);
      setMyStats(null);
      setLoadError(null);
      setBench(null);
      setBenchLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    setBenchLoadError(null);
    const [cmp, inc, out, mine, gb] = await Promise.all([
      fetchFriendLeadership(),
      listPendingIncoming(),
      listOutgoingPending(),
      fetchMyTrainingStats(),
      fetchGlobalBenchmarks(),
    ]);
    if (cmp.error) {
      setLoadError(friendlyBackendError(cmp.error));
      setFriends([]);
    } else {
      setFriends(cmp.data ?? []);
    }
    setPending(inc);
    setOutgoing(out);
    if (mine.error) {
      setMyStats(null);
    } else {
      setMyStats(mine.data);
    }
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
      void load();
    }, [load])
  );

  const inviteById = async (targetId: string) => {
    const { error } = await sendFriendRequest(targetId);
    if (error) showAlert('Invite', friendlyBackendError(error));
    else {
      showAlert('Sent', 'Friend request sent.');
      void load();
      setSearchInput('');
      setSearchHits([]);
    }
  };

  const accept = async (fid: string) => {
    const { error } = await acceptFriendship(fid);
    if (error) showAlert('Accept', friendlyBackendError(error));
    else void load();
  };

  const cancelOutgoing = async (friendshipId: string) => {
    const { error } = await cancelOutgoingFriendRequest(friendshipId);
    if (error) showAlert('Cancel request', friendlyBackendError(error));
    else void load();
  };

  const leaderboardRows: LeaderRow[] = useMemo(() => {
    const rows: LeaderRow[] = [];
    if (myStats) {
      rows.push({
        rank: 0,
        label: 'You',
        volume: myStats.weeklyVolumeKg,
        sessions: myStats.sessions7d,
        isSelf: true,
      });
    }
    for (const f of friends) {
      rows.push({
        rank: 0,
        label: f.displayName ?? shortId(f.userId),
        volume: f.weeklyVolumeKg,
        sessions: f.sessionCount7d,
        isSelf: false,
      });
    }
    rows.sort((a, b) => {
      const va = a.volume ?? -1;
      const vb = b.volume ?? -1;
      if (vb !== va) return vb - va;
      const sa = a.sessions ?? -1;
      const sb = b.sessions ?? -1;
      return sb - sa;
    });
    rows.forEach((r, i) => {
      r.rank = i + 1;
    });
    return rows;
  }, [friends, myStats]);

  const relationshipLabel = (r: ProfileSearchHit['relationship']): string => {
    switch (r) {
      case 'friend':
        return 'Friends';
      case 'pending_out':
        return 'Request sent';
      case 'pending_in':
        return 'Wants to connect';
      default:
        return '';
    }
  };

  if (!backendReady) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.heroTitle, { color: c.text }]}>Leadership</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Configure Supabase in the app, restart, then sign in to search lifters, see how you stack up with
          friends, and view cohort rankings.
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Ionicons name="people-outline" size={48} color={c.tint} style={{ marginBottom: 12 }} />
        <Text style={[styles.heroTitle, { color: c.text }]}>Train together</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Sign in to find people by name, build your crew, and stack weekly volume and sessions against
          friends. Global benchmarks stay anonymous—opt in under Account.
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
    <KeyboardAvoidingScreen variant="tab" style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32 + Math.max(insets.bottom, 12),
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
        {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={c.tint} colors={[c.tint]} />
        }
      >
        <View style={styles.heroBlock}>
          <Text style={[styles.heroTitle, { color: c.text }]}>Leadership</Text>
          <Text style={[styles.heroSub, { color: c.textMuted }]}>
            Search by display name or user id prefix, see week-over-week stats with friends, and how you rank in
            your cohort.
          </Text>
          <Link href="/profile" asChild>
            <Pressable style={styles.inlineLinkRow} hitSlop={8}>
              <Ionicons name="id-card-outline" size={16} color={c.tint} />
              <Text style={{ color: c.tint, fontWeight: '600', marginLeft: 6, fontSize: 14 }}>
                Share your user id from Account
              </Text>
              <Ionicons name="chevron-forward" size={14} color={c.tint} />
            </Pressable>
          </Link>
        </View>

        {/* Discover */}
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <SectionTitle
            c={c}
            icon="search-outline"
            title="Find people"
            subtitle="At least 2 characters. Matches display name or the start of a user id."
          />
          <View style={[styles.searchField, { borderColor: c.border, backgroundColor: c.background }]}>
            <Ionicons name="search" size={18} color={c.textMuted} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder="Name or user id…"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: c.text }]}
            />
            {searchLoading ? <ActivityIndicator size="small" color={c.tint} /> : null}
          </View>
          {searchHits.length > 0 ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              {searchHits.map((hit) => (
                <View
                  key={hit.userId}
                  style={[styles.searchHitRow, { borderColor: c.border, backgroundColor: c.background }]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.text, fontWeight: '700' }} numberOfLines={1}>
                      {hit.displayName?.trim() || 'GymBros user'}
                    </Text>
                    <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {shortId(hit.userId)}
                      {hit.relationship !== 'none' ? ` · ${relationshipLabel(hit.relationship)}` : ''}
                    </Text>
                  </View>
                  {hit.relationship === 'none' ? (
                    <Pressable
                      onPress={() => void inviteById(hit.userId)}
                      style={[styles.smallCta, { backgroundColor: c.tint }]}
                    >
                      <Text style={{ color: c.onTint, fontWeight: '700', fontSize: 13 }}>Add</Text>
                    </Pressable>
                  ) : hit.relationship === 'friend' ? (
                    <View style={[styles.pill, { borderColor: c.border }]}>
                      <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>Friends</Text>
                    </View>
                  ) : (
                    <View style={[styles.pill, { borderColor: c.border }]}>
                      <Text style={{ color: c.textMuted, fontSize: 12, fontWeight: '600' }}>
                        {hit.relationship === 'pending_out' ? 'Pending' : 'Incoming'}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : debouncedSearch.length >= 2 && !searchLoading ? (
            <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 8 }}>No matches. Try another name.</Text>
          ) : null}
        </View>

        {/* Requests */}
        {(pending.length > 0 || outgoing.length > 0) && (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <SectionTitle
              c={c}
              icon="mail-unread-outline"
              title="Requests"
              subtitle="Accept to share stats you’ve enabled in Account → privacy."
            />
            {pending.map((p) => (
              <View key={p.id} style={[styles.requestRow, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                    {shortId(p.requesterId)}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Incoming</Text>
                </View>
                <Pressable onPress={() => void accept(p.id)} style={[styles.smallCta, { backgroundColor: c.tint }]}>
                  <Text style={{ color: c.onTint, fontWeight: '700', fontSize: 13 }}>Accept</Text>
                </Pressable>
              </View>
            ))}
            {outgoing.map((o) => (
              <View key={o.id} style={[styles.requestRow, { borderTopColor: c.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
                    {shortId(o.addresseeId)}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>Awaiting reply</Text>
                </View>
                <Pressable onPress={() => void cancelOutgoing(o.id)} hitSlop={8}>
                  <Text style={{ color: c.danger, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {loadError ? (
          <View style={[styles.card, { borderColor: c.danger, backgroundColor: c.card }]}>
            <Text style={{ color: c.danger, fontWeight: '700' }}>Could not load friends</Text>
            <Text style={{ color: c.textMuted, marginTop: 6, lineHeight: 20 }}>{loadError}</Text>
            <Pressable onPress={load} style={{ marginTop: 10 }}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Your week */}
        {myStats ? (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <SectionTitle
              c={c}
              icon="analytics-outline"
              title="Your last 7 days"
              subtitle="Same window as friend & cohort stats (cloud-synced workouts)."
            />
            <View style={styles.youStrip}>
              <View style={[styles.youPill, { backgroundColor: c.background }]}>
                <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>VOLUME</Text>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 18, marginTop: 4 }}>
                  {volumeKgToDisplayNumber(myStats.weeklyVolumeKg, unit).toLocaleString()}{' '}
                  {volumeUnitSuffix(unit)}
                </Text>
              </View>
              <View style={[styles.youPill, { backgroundColor: c.background }]}>
                <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>SESSIONS</Text>
                <Text style={{ color: c.text, fontWeight: '800', fontSize: 18, marginTop: 4 }}>
                  {myStats.sessions7d}
                </Text>
              </View>
              <View style={[styles.youPill, { backgroundColor: c.background, flex: 1.2 }]}>
                <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>BEST E1RM</Text>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 14, marginTop: 4 }} numberOfLines={2}>
                  {myStats.bestLiftLabel ?? '—'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Friends — side by side */}
        <View>
          <SectionTitle
            c={c}
            icon="people-outline"
            title="Friends"
            subtitle="Private metrics—each person enables volume, sessions, or best lift under Account."
          />
          {friends.length === 0 && !loading ? (
            <Text style={{ color: c.textMuted, lineHeight: 20, marginTop: 8 }}>
              No friends yet. Use search above or paste a user id, then accept the request on both sides.
            </Text>
          ) : (
            <View style={{ gap: 12, marginTop: 8 }}>
              {friends.map((item) => (
                <View
                  key={item.userId}
                  style={[styles.card, { backgroundColor: c.card, borderColor: c.border, marginHorizontal: 0 }]}
                >
                  <Text style={[styles.friendName, { color: c.text }]}>
                    {item.displayName ?? shortId(item.userId)}
                  </Text>
                  <View style={styles.dualGrid}>
                    <View style={[styles.dualCol, { backgroundColor: c.background }]}>
                      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>YOU</Text>
                      <Text style={{ color: c.text, fontSize: 13, marginTop: 6 }}>
                        {myStats
                          ? `${volumeKgToDisplayNumber(myStats.weeklyVolumeKg, unit).toLocaleString()} ${volumeUnitSuffix(unit)}`
                          : '—'}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                        {myStats ? `${myStats.sessions7d} sessions` : '—'}
                      </Text>
                    </View>
                    <View style={[styles.dualCol, { backgroundColor: c.background }]}>
                      <Text style={{ color: c.textMuted, fontSize: 11, fontWeight: '700' }}>FRIEND</Text>
                      <Text style={{ color: c.text, fontSize: 13, marginTop: 6 }}>
                        {item.weeklyVolumeKg != null
                          ? `${volumeKgToDisplayNumber(item.weeklyVolumeKg, unit).toLocaleString()} ${volumeUnitSuffix(unit)}`
                          : 'Hidden'}
                      </Text>
                      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                        {item.sessionCount7d != null ? `${item.sessionCount7d} sessions` : 'Hidden'}
                      </Text>
                    </View>
                  </View>
                  {item.bestLiftLabel ? (
                    <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 10 }}>
                      Their best (shared): {item.bestLiftLabel}
                    </Text>
                  ) : (
                    <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 10 }}>No shared best lift</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Friends leaderboard */}
        {leaderboardRows.length > 0 ? (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <SectionTitle
              c={c}
              icon="podium-outline"
              title="Friends leaderboard"
              subtitle="Ranked by 7-day training volume, then sessions. Includes you and accepted friends who share data."
            />
            {leaderboardRows.map((row) => (
              <View
                key={`${row.label}-${row.rank}`}
                style={[styles.lbRow, { borderTopColor: c.border, backgroundColor: c.background }]}
              >
                <Text style={[styles.lbRank, { color: c.tint }]}>#{row.rank}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700' }}>
                    {row.label}
                    {row.isSelf ? (
                      <Text style={{ color: c.tint, fontWeight: '700' }}> (you)</Text>
                    ) : null}
                  </Text>
                  <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>
                    {row.volume != null
                      ? `${volumeKgToDisplayNumber(row.volume, unit).toLocaleString()} ${volumeUnitSuffix(unit)}`
                      : '—'}{' '}
                    · {row.sessions != null ? `${row.sessions} sessions` : '—'}
                  </Text>
                </View>
                {row.rank <= 3 ? (
                  <Text style={{ fontSize: 20 }}>{row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : '🥉'}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {/* Global cohort */}
        <View>
          <SectionTitle
            c={c}
            icon="earth-outline"
            title="Global & regional cohort"
            subtitle="Anonymous rankings vs similar lifters. Requires benchmark opt-in and profile fields under Account."
          />
          {loading && !bench && !benchLoadError ? (
            <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 8 }}>Loading benchmarks…</Text>
          ) : null}

          {benchLoadError ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, marginTop: 8 }]}>
              <Text style={{ color: c.danger, fontWeight: '600' }}>Benchmarks</Text>
              <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 4 }}>{benchLoadError}</Text>
            </View>
          ) : bench && !bench.ok ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border, marginTop: 8 }]}>
              <Text style={{ color: c.text, fontWeight: '700' }}>Cohort leaderboard</Text>
              <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 6, lineHeight: 20 }}>
                {bench.message ??
                  (bench.code === 'not_opted_in'
                    ? 'Turn on global benchmarks and save body weight + birth year under Account.'
                    : 'Complete your benchmark profile under Account, sync workouts, then pull to refresh.')}
              </Text>
              {bench.cohort_sample_size != null ? (
                <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 8 }}>
                  Cohort size: {bench.cohort_sample_size}
                </Text>
              ) : null}
            </View>
          ) : bench?.ok && bench.global ? (
            <View style={{ gap: 12, marginTop: 8 }}>
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
        </View>
      </ScrollView>
    </KeyboardAvoidingScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 40 },
  heroBlock: { marginBottom: 4 },
  heroTitle: { fontSize: 26, fontWeight: '800' },
  heroSub: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  inlineLinkRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSub: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 10 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  searchHitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  smallCta: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1 },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  youStrip: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  youPill: { flex: 1, minWidth: '28%', borderRadius: 12, padding: 12 },
  friendName: { fontSize: 18, fontWeight: '700', marginBottom: 10 },
  dualGrid: { flexDirection: 'row', gap: 10 },
  dualCol: { flex: 1, borderRadius: 12, padding: 12 },
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    borderTopWidth: 0,
  },
  lbRank: { fontSize: 16, fontWeight: '900', width: 36 },
  linkCta: { marginTop: 20, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 10 },
  linkCtaText: { fontWeight: '700', fontSize: 16 },
});
