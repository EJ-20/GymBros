import { useColors } from '@/src/hooks/useColors';
import { useAuth } from '@/src/contexts/AuthContext';
import { friendlyBackendError } from '@/src/lib/friendlyError';
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
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendSummary } from '@gymbros/shared';

export default function CompareScreen() {
  const c = useColors();
  const { user, backendReady, localDataVersion } = useAuth();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pending, setPending] = useState<{ id: string; requesterId: string }[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setPending([]);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const [cmp, inc] = await Promise.all([fetchFriendCompare(), listPendingIncoming()]);
    if (cmp.error) {
      setLoadError(friendlyBackendError(cmp.error));
      setFriends([]);
    } else {
      setFriends(cmp.data ?? []);
    }
    setPending(inc);
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
      Alert.alert('Friend id', 'Paste your friend’s user id from their Account screen.');
      return;
    }
    const { error } = await sendFriendRequest(id);
    if (error) Alert.alert('Invite', friendlyBackendError(error));
    else {
      Alert.alert('Sent', 'Friend request sent.');
      setFriendIdInput('');
    }
  };

  const accept = async (fid: string) => {
    const { error } = await acceptFriendship(fid);
    if (error) Alert.alert('Accept', friendlyBackendError(error));
    else load();
  };

  if (!backendReady) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Add your Supabase URL and anon key (see README), restart the app, then sign in to compare
          stats with friends.
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Sign in to compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24, lineHeight: 22 }}>
          Friends only see stats you enable under Account → privacy after you sign in. Share your user
          id so they can send a request.
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
          <Text style={[styles.title, { color: c.text }]}>Friends</Text>
          <Text style={{ color: c.textMuted, fontSize: 14, lineHeight: 20 }}>
            Comparison is friends-only. Each person enables weekly volume, session count, or best
            lift in Account → privacy.
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
            <Text style={{ color: c.textMuted }}>7d volume: {Math.round(item.weeklyVolumeKg)} kg·reps</Text>
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
