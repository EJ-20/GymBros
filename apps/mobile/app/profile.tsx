import { useColors } from '@/src/hooks/useColors';
import { useAuth } from '@/src/contexts/AuthContext';
import { pullProfile, syncAll, updateProfilePrivacy } from '@/src/sync/syncEngine';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';

export default function ProfileScreen() {
  const c = useColors();
  const { user, loading, signIn, signUp, signOut, backendReady } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [shareVol, setShareVol] = useState(false);
  const [shareSessions, setShareSessions] = useState(false);
  const [shareBest, setShareBest] = useState(false);

  const loadPrivacy = useCallback(async () => {
    if (!user) return;
    const p = await pullProfile();
    if (p) {
      setDisplayName(p.displayName ?? '');
      setShareVol(p.shareWeeklyVolume);
      setShareSessions(p.shareSessionCount);
      setShareBest(p.shareBestLifts);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadPrivacy();
    }, [loadPrivacy])
  );

  const copyId = async () => {
    if (!user?.id) return;
    await Clipboard.setStringAsync(user.id);
    Alert.alert('Copied', 'User id copied. Share with friends to connect.');
  };

  const savePrivacy = async () => {
    setBusy(true);
    const { error } = await updateProfilePrivacy({
      displayName: displayName.trim() || undefined,
      shareWeeklyVolume: shareVol,
      shareSessionCount: shareSessions,
      shareBestLifts: shareBest,
    });
    setBusy(false);
    if (error) Alert.alert('Profile', error);
    else Alert.alert('Saved', 'Privacy settings updated.');
  };

  const runSync = async () => {
    if (!user) return;
    setBusy(true);
    const { error, pulled } = await syncAll(user.id);
    setBusy(false);
    if (error) Alert.alert('Sync', error);
    else if (pulled) {
      Alert.alert(
        'Sync complete',
        `Uploaded local changes.\nPulled from cloud: ${pulled.exercises} exercises, ${pulled.sessions} sessions, ${pulled.sets} sets.`
      );
    } else Alert.alert('Sync', 'Done.');
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]}>Account</Text>

      {!backendReady ? (
        <Text style={{ color: c.textMuted, marginBottom: 16 }}>
          Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (see repo README).
        </Text>
      ) : null}

      {user ? (
        <>
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>Signed in as</Text>
            <Text style={[styles.email, { color: c.text }]}>{user.email}</Text>
            <Pressable onPress={copyId} style={{ marginTop: 8 }}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>Copy user id (for friends)</Text>
            </Pressable>
            <Text selectable style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
              {user.id}
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.section, { color: c.text }]}>Privacy (compare)</Text>
            <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 12 }}>
              Only accepted friends see enabled stats.
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Display name"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { color: c.text, borderColor: c.border }]}
            />
            <Row
              label="Share 7-day volume"
              value={shareVol}
              onValueChange={setShareVol}
              c={c}
            />
            <Row
              label="Share session count (7d)"
              value={shareSessions}
              onValueChange={setShareSessions}
              c={c}
            />
            <Row label="Share best lift label" value={shareBest} onValueChange={setShareBest} c={c} />
            <Pressable
              style={[styles.btn, { backgroundColor: c.tint, opacity: busy ? 0.6 : 1 }]}
              onPress={savePrivacy}
              disabled={busy}
            >
              <Text style={styles.btnText}>Save privacy</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.border }]}
            onPress={runSync}
            disabled={busy}
          >
            <Text style={{ color: c.text, fontWeight: '600' }}>Sync (push + pull)</Text>
          </Pressable>

          <Pressable onPress={() => signOut()} style={{ marginTop: 24, marginBottom: 40 }}>
            <Text style={{ color: c.danger, fontWeight: '600' }}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={{ color: c.textMuted, marginBottom: 12 }}>
            Sign up or sign in with email. Use at least 6 characters for the password (Supabase
            default).
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={c.textMuted}
            style={[styles.input, { color: c.text, borderColor: c.border }]}
          />
          <TextInput
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 6 characters)"
            placeholderTextColor={c.textMuted}
            style={[styles.input, { color: c.text, borderColor: c.border }]}
          />
          <Pressable
            style={[styles.btn, { backgroundColor: c.tint }]}
            onPress={async () => {
              const e = email.trim();
              if (!e) {
                Alert.alert('Sign in', 'Enter your email.');
                return;
              }
              const { error } = await signIn(e, password);
              if (error) Alert.alert('Sign in', error.message);
            }}
          >
            <Text style={styles.btnText}>Sign in</Text>
          </Pressable>
          <Pressable
            style={[styles.btn, { backgroundColor: c.border, marginTop: 10 }]}
            onPress={async () => {
              const e = email.trim();
              if (!e) {
                Alert.alert('Sign up', 'Enter your email.');
                return;
              }
              if (password.length < 6) {
                Alert.alert('Sign up', 'Password must be at least 6 characters.');
                return;
              }
              const { error, session: newSession } = await signUp(e, password);
              if (error) {
                Alert.alert('Sign up', error.message);
                return;
              }
              if (newSession) {
                Alert.alert('Welcome', 'You are signed in.');
              } else {
                Alert.alert(
                  'Check your email',
                  'Open the confirmation link from Supabase, then return here and sign in.\n\n' +
                    'For local testing you can turn off “Confirm email” in the Supabase dashboard (see README).'
                );
              }
            }}
          >
            <Text style={[styles.btnText, { color: c.text }]}>Create account</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function Row({
  label,
  value,
  onValueChange,
  c,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: c.text, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: c.tint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  card: { borderRadius: 14, padding: 16, borderWidth: 1, marginBottom: 16, gap: 10 },
  email: { fontSize: 16, fontWeight: '600' },
  section: { fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#0f1419', fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', marginVertical: 6 },
});
