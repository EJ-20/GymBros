import { useColors } from '@/src/hooks/useColors';
import { useAuth } from '@/src/contexts/AuthContext';
import {
  acceptFriendship,
  fetchFriendCompare,
  listPendingIncoming,
  sendFriendRequest,
} from '@/src/sync/social';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { FriendSummary } from '@gymbros/shared';

export default function CompareScreen() {
  const c = useColors();
  const { user, backendReady } = useAuth();
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [pending, setPending] = useState<{ id: string; requesterId: string }[]>([]);
  const [friendIdInput, setFriendIdInput] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setPending([]);
      return;
    }
    setLoading(true);
    const [cmp, inc] = await Promise.all([fetchFriendCompare(), listPendingIncoming()]);
    if (cmp.data) setFriends(cmp.data);
    setPending(inc);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const invite = async () => {
    const id = friendIdInput.trim();
    if (!id) return;
    const { error } = await sendFriendRequest(id);
    if (error) Alert.alert('Invite', error);
    else {
      Alert.alert('Sent', 'Friend request sent.');
      setFriendIdInput('');
    }
  };

  const accept = async (fid: string) => {
    const { error } = await acceptFriendship(fid);
    if (error) Alert.alert('Error', error);
    else load();
  };

  if (!backendReady) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', padding: 20 }}>
          Configure Supabase in app.config.js / EXPO_PUBLIC_* env vars and sign in via Account to
          compare stats with friends.
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>Sign in to compare</Text>
        <Text style={{ color: c.textMuted, textAlign: 'center', padding: 20 }}>
          Open Account and create a session. Friends only see metrics you opt into on your profile.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 16 }}
      data={friends}
      keyExtractor={(f) => f.userId}
      ListHeaderComponent={
        <View style={{ gap: 16 }}>
          <Text style={[styles.title, { color: c.text }]}>Friends</Text>
          <Text style={{ color: c.textMuted, fontSize: 14 }}>
            Comparison is friends-only. Each person enables weekly volume, session count, or best
            lift in Account privacy settings.
          </Text>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.label, { color: c.text }]}>Friend user id</Text>
            <TextInput
              value={friendIdInput}
              onChangeText={setFriendIdInput}
              placeholder="Paste UUID from their Account screen"
              placeholderTextColor={c.textMuted}
              autoCapitalize="none"
              style={[styles.input, { color: c.text, borderColor: c.border }]}
            />
            <Pressable style={[styles.btn, { backgroundColor: c.tint }]} onPress={invite}>
              <Text style={styles.btnText}>Send request</Text>
            </Pressable>
          </View>

          {pending.length > 0 ? (
            <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
              <Text style={[styles.label, { color: c.text }]}>Incoming requests</Text>
              {pending.map((p) => (
                <View key={p.id} style={styles.rowBetween}>
                  <Text style={{ color: c.textMuted }} numberOfLines={1}>
                    {p.requesterId}
                  </Text>
                  <Pressable onPress={() => accept(p.id)} style={styles.linkBtn}>
                    <Text style={{ color: c.tint, fontWeight: '600' }}>Accept</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {loading ? <ActivityIndicator color={c.tint} /> : null}
          <Text style={[styles.label, { color: c.text, marginTop: 8 }]}>Shared stats</Text>
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Text style={{ color: c.textMuted }}>
            No friends to show yet. Add accepted friends and ensure they enable sharing.
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
  center: { flex: 1, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '700' },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 8 },
  label: { fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 15 },
  btn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#0f1419', fontWeight: '700' },
  fname: { fontSize: 17, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linkBtn: { padding: 8 },
});
