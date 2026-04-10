import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useColors } from '@/src/hooks/useColors';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import { Ionicons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
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

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function SignUpScreen() {
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loading, signUp, backendReady } = useAuth();
  const showAlert = useAppAlert();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
  const confirmRef = useRef<ElementRef<typeof TextInput>>(null);

  useEffect(() => {
    if (loading || !user) return;
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [loading, user, router]);

  const submit = async () => {
    const name = fullName.trim();
    if (!name) {
      showAlert('Create account', 'Please enter your full name.');
      return;
    }
    if (name.length > 80) {
      showAlert('Create account', 'Name must be 80 characters or fewer.');
      return;
    }
    const e = email.trim().toLowerCase();
    if (!e) {
      showAlert('Create account', 'Please enter your email address.');
      return;
    }
    if (!looksLikeEmail(e)) {
      showAlert('Create account', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      showAlert('Create account', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('Create account', 'Password and confirm password must match.');
      return;
    }
    if (!agreedToTerms) {
      showAlert('Create account', 'Please agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
    setBusy(true);
    const { error, session: newSession } = await signUp(e, password, { fullName: name });
    setBusy(false);
    if (error) {
      showAlert('Create account', friendlyBackendError(error.message));
      return;
    }
    if (newSession) {
      showAlert('Welcome', 'Your account is ready. You are signed in.');
    } else {
      showAlert(
        'Verify your email',
        'We sent a confirmation link to your inbox. Open it to activate your account, then sign in here.\n\n' +
          'Tip: For local development you can disable email confirmation in the Supabase dashboard (see README).'
      );
    }
  };

  const passwordMismatch =
    confirmPassword.length > 0 && password.length > 0 && password !== confirmPassword;

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
          { paddingBottom: Math.max(insets.bottom, 32) + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenKicker, { color: c.tint }]}>New to GymBros?</Text>
        <Text style={[styles.screenTitle, { color: c.text }]}>Create account</Text>
        <Text style={[styles.screenSub, { color: c.textMuted }]}>
          Enter the details below to register. You will use your email and password to sign in on this
          and other devices.
        </Text>

        {!backendReady ? (
          <View style={[styles.callout, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="cloud-offline-outline" size={22} color={c.tint} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calloutTitle, { color: c.text }]}>Backend not configured</Text>
              <Text style={[styles.calloutBody, { color: c.textMuted }]}>
                Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env, then
                restart the app.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: c.background }]}>
              <Ionicons name="person-outline" size={20} color={c.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Your profile</Text>
              <Text style={[styles.sectionHint, { color: c.textMuted }]}>
                {"How you'll show up in the app (you can change this later)."}
              </Text>
            </View>
          </View>
          <View style={[styles.sectionRule, { backgroundColor: c.border }]} />
          <Text style={[styles.fieldLabel, { color: c.text }]}>
            Full name <Text style={{ color: c.danger }}>*</Text>
          </Text>
          <TextInput
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Alex Johnson"
            placeholderTextColor={c.textMuted}
            editable={backendReady && !busy}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => emailRef.current?.focus()}
            style={[
              styles.input,
              { color: c.text, borderColor: c.border, backgroundColor: c.background },
            ]}
          />
        </View>

        <View style={[styles.sectionCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={styles.sectionHeaderRow}>
            <View style={[styles.sectionIconWrap, { backgroundColor: c.background }]}>
              <Ionicons name="lock-closed-outline" size={20} color={c.tint} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sectionTitle, { color: c.text }]}>Account & password</Text>
              <Text style={[styles.sectionHint, { color: c.textMuted }]}>
                {"Use a strong password you don't use on other sites."}
              </Text>
            </View>
          </View>
          <View style={[styles.sectionRule, { backgroundColor: c.border }]} />
          <Text style={[styles.fieldLabel, { color: c.text }]}>
            Email address <Text style={{ color: c.danger }}>*</Text>
          </Text>
          <TextInput
            ref={emailRef}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={c.textMuted}
            editable={backendReady && !busy}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => passwordRef.current?.focus()}
            style={[
              styles.input,
              { color: c.text, borderColor: c.border, backgroundColor: c.background },
            ]}
          />

          <Text style={[styles.fieldLabel, { color: c.text, marginTop: 18 }]}>
            Password <Text style={{ color: c.danger }}>*</Text>
          </Text>
          <View
            style={[
              styles.inputRow,
              { borderColor: c.border, backgroundColor: c.background },
            ]}
          >
            <TextInput
              ref={passwordRef}
              style={[styles.inputInRow, { color: c.text }]}
              secureTextEntry={!showPassword}
              autoComplete="password-new"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={c.textMuted}
              editable={backendReady && !busy}
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => confirmRef.current?.focus()}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={12}
              style={styles.eyeBtn}
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={c.textMuted}
              />
            </Pressable>
          </View>
          <Text style={[styles.reqLine, { color: c.textMuted }]}>
            Minimum 6 characters (required by Supabase).
          </Text>

          <Text style={[styles.fieldLabel, { color: c.text, marginTop: 18 }]}>
            Confirm password <Text style={{ color: c.danger }}>*</Text>
          </Text>
          <View
            style={[
              styles.inputRow,
              {
                borderColor: passwordMismatch ? c.danger : c.border,
                backgroundColor: c.background,
              },
            ]}
          >
            <TextInput
              ref={confirmRef}
              style={[styles.inputInRow, { color: c.text }]}
              secureTextEntry={!showConfirmPassword}
              autoComplete="password-new"
              textContentType="newPassword"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Re-enter your password"
              placeholderTextColor={c.textMuted}
              editable={backendReady && !busy}
              onSubmitEditing={submit}
              returnKeyType="go"
            />
            <Pressable
              onPress={() => setShowConfirmPassword((v) => !v)}
              hitSlop={12}
              style={styles.eyeBtn}
              accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
            >
              <Ionicons
                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                size={22}
                color={c.textMuted}
              />
            </Pressable>
          </View>
          {passwordMismatch ? (
            <Text style={[styles.inlineError, { color: c.danger }]}>Passwords do not match.</Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => setAgreedToTerms((v) => !v)}
          style={styles.termsRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreedToTerms }}
        >
          <View
            style={[
              styles.checkbox,
              {
                borderColor: agreedToTerms ? c.tint : c.border,
                backgroundColor: agreedToTerms ? c.tint : 'transparent',
              },
            ]}
          >
            {agreedToTerms ? (
              <Ionicons name="checkmark" size={16} color={c.onTintLight} />
            ) : null}
          </View>
          <Text style={[styles.termsText, { color: c.text }]}>
            I have read and agree to the{' '}
            <Text style={{ fontWeight: '800', color: c.text }}>Terms of Service</Text>
            {' and '}
            <Text style={{ fontWeight: '800', color: c.text }}>Privacy Policy</Text>
            . <Text style={{ color: c.danger }}>*</Text>
          </Text>
        </Pressable>

        <Pressable
          style={[
            styles.primaryBtn,
            { backgroundColor: c.tint, opacity: busy || !backendReady ? 0.55 : 1 },
          ]}
          onPress={submit}
          disabled={busy || !backendReady}
        >
          {busy ? (
            <ActivityIndicator color={c.onTintLight} />
          ) : (
            <>
              <Ionicons name="person-add-outline" size={22} color={c.onTintLight} />
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Create my account</Text>
            </>
          )}
        </Pressable>

        <Text style={[styles.footerNote, { color: c.textMuted }]}>
          After signing up, you can add gender, body weight, and more under Account → Edit profile.
        </Text>

        <View style={[styles.dividerRow, { marginTop: 8 }]}>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
          <Text style={[styles.dividerText, { color: c.textMuted }]}>Already registered?</Text>
          <View style={[styles.dividerLine, { backgroundColor: c.border }]} />
        </View>

        <Link href="/sign-in" asChild>
          <Pressable style={styles.signInLink} hitSlop={12}>
            <Text style={[styles.signInLinkText, { color: c.tint }]}>Sign in to your account</Text>
            <Ionicons name="chevron-forward" size={18} color={c.tint} />
          </Pressable>
        </Link>

        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={styles.skipWrap}
          hitSlop={12}
        >
          <Text style={[styles.skip, { color: c.textMuted }]}>Continue without an account</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  scrollContent: { paddingHorizontal: 22, paddingTop: 12 },
  screenKicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  screenSub: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 22,
  },
  callout: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 18,
    alignItems: 'flex-start',
  },
  calloutTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  calloutBody: { fontSize: 13, lineHeight: 19 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  sectionRule: { height: StyleSheet.hairlineWidth, marginBottom: 16 },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 4,
    minHeight: 50,
  },
  inputInRow: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeBtn: { padding: 10 },
  reqLine: { fontSize: 12, marginTop: 8, lineHeight: 17 },
  inlineError: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20, marginTop: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsText: { flex: 1, fontSize: 14, lineHeight: 21 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 17 },
  footerNote: { fontSize: 13, lineHeight: 19, marginTop: 16, textAlign: 'center' },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    marginBottom: 8,
  },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth },
  dividerText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  signInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
  },
  signInLinkText: { fontSize: 16, fontWeight: '700' },
  skipWrap: { alignItems: 'center', marginTop: 12, paddingVertical: 8 },
  skip: { fontSize: 14, fontWeight: '600' },
});
