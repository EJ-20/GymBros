import { useColors } from '@/src/hooks/useColors';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignInScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, signIn, signUp, backendReady } = useAuth();
  const showAlert = useAppAlert();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [loading, user, router]);

  const finishSignIn = async () => {
    const e = email.trim();
    if (!e) {
      showAlert('Sign in', 'Enter your email.');
      return;
    }
    setBusy(true);
    const { error } = await signIn(e, password);
    setBusy(false);
    if (error) showAlert('Sign in', friendlyBackendError(error.message));
  };

  const finishSignUp = async () => {
    const e = email.trim();
    if (!e) {
      showAlert('Sign up', 'Enter your email.');
      return;
    }
    if (password.length < 6) {
      showAlert('Sign up', 'Password must be at least 6 characters.');
      return;
    }
    setBusy(true);
    const { error, session: newSession } = await signUp(e, password);
    setBusy(false);
    if (error) {
      showAlert('Sign up', friendlyBackendError(error.message));
      return;
    }
    if (newSession) {
      showAlert('Welcome', 'You are signed in.');
    } else {
      showAlert(
        'Check your email',
        'Open the confirmation link from Supabase, then return here and sign in.\n\n' +
          'For local testing you can turn off “Confirm email” in the Supabase dashboard (see README).'
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} size="large" />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 28) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={[styles.heroRing, { borderColor: c.border, backgroundColor: c.card }]}>
            <Ionicons name="barbell" size={36} color={c.tint} />
          </View>
          <View style={[styles.heroCloud, { backgroundColor: c.background }]}>
            <Ionicons name="cloud-done-outline" size={22} color={c.tint} />
          </View>
        </View>

        <Text style={[styles.headline, { color: c.text }]}>Sign in to GymBros</Text>
        <Text style={[styles.lede, { color: c.textMuted }]}>
          Back up workouts to the cloud, sync across devices, and use Compare with friends. You can
          still train without an account—data stays on this device until you sign in. After you sign in,
          open Account and tap the settings icon to complete{' '}
          <Text style={{ fontWeight: '800', color: c.text }}>Edit profile</Text> (gender, body weight,
          birth year, and optional fields). Global rankings use a separate on/off switch on Account.
        </Text>

        {!backendReady ? (
          <View style={[styles.callout, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={c.tint} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calloutTitle, { color: c.text }]}>Backend not configured</Text>
              <Text style={[styles.calloutBody, { color: c.textMuted }]}>
                Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env
                (see README), then restart the app.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.formCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.formAccent, { backgroundColor: c.tint }]} />
          <View style={styles.formInner}>
            <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Email</Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={c.textMuted}
              editable={backendReady && !busy}
              style={[
                styles.input,
                { color: c.text, borderColor: c.border, backgroundColor: c.background },
              ]}
            />
            <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 16 }]}>Password</Text>
            <TextInput
              secureTextEntry
              autoComplete="password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={c.textMuted}
              editable={backendReady && !busy}
              onSubmitEditing={finishSignIn}
              returnKeyType="go"
              style={[
                styles.input,
                { color: c.text, borderColor: c.border, backgroundColor: c.background },
              ]}
            />

            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: busy || !backendReady ? 0.55 : 1 },
              ]}
              onPress={finishSignIn}
              disabled={busy || !backendReady}
            >
              {busy ? (
                <ActivityIndicator color={c.onTintLight} />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={22} color={c.onTintLight} />
                  <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Sign in</Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.secondaryBtn,
                {
                  borderColor: c.tint,
                  backgroundColor: c.background,
                  opacity: busy || !backendReady ? 0.55 : 1,
                },
              ]}
              onPress={finishSignUp}
              disabled={busy || !backendReady}
            >
              <Ionicons name="person-add-outline" size={22} color={c.tint} />
              <Text style={[styles.secondaryBtnText, { color: c.tint }]}>Create account</Text>
            </Pressable>

            <Text style={[styles.hint, { color: c.textMuted }]}>
              Supabase requires at least 6 characters. Turn off email confirmation in the dashboard for
              quick local testing.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.skipWrap}
          hitSlop={12}
        >
          <Text style={[styles.skip, { color: c.tint }]}>Continue without an account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 28 },
  heroRing: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCloud: {
    position: 'absolute',
    right: '28%',
    top: -4,
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  lede: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 24,
  },
  callout: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: 'flex-start',
  },
  calloutTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  calloutBody: { fontSize: 14, lineHeight: 20 },
  formCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  formAccent: { width: 4 },
  formInner: { flex: 1, padding: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 22,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 17 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 2,
    marginTop: 12,
  },
  secondaryBtnText: { fontWeight: '800', fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 19, marginTop: 16 },
  skipWrap: { alignItems: 'center', marginTop: 24, paddingVertical: 8 },
  skip: { fontSize: 16, fontWeight: '700' },
});
