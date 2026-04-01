import { useColors } from '@/src/hooks/useColors';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import {
  pullProfile,
  syncAll,
  updateProfilePrivacy,
  type BenchmarkSex,
} from '@/src/sync/syncEngine';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {
  formatWeightFromKgForInput,
  parseWeightInputToKg,
  weightUnitLabel,
  type WeightUnit,
} from '@/src/lib/weightUnits';

const BENCHMARK_SEX_OPTIONS: { value: BenchmarkSex; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'non_binary', label: 'Non-binary' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

function formatPulledSummary(p: {
  exercises: number;
  sessions: number;
  sets: number;
  routines: number;
}): string {
  const lines = [
    `${p.exercises} exercise${p.exercises === 1 ? '' : 's'}`,
    `${p.sessions} session${p.sessions === 1 ? '' : 's'}`,
    `${p.sets} set${p.sets === 1 ? '' : 's'}`,
    `${p.routines} routine${p.routines === 1 ? '' : 's'}`,
  ];
  return `Pulled from cloud:\n${lines.join('\n')}`;
}

export default function ProfileScreen() {
  const c = useColors();
  const { user, loading, signOut, backendReady } = useAuth();
  const { unit: weightUnit, setWeightUnit } = useWeightUnit();
  const showAlert = useAppAlert();
  const weightUnitRef = useRef(weightUnit);
  weightUnitRef.current = weightUnit;
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [shareVol, setShareVol] = useState(false);
  const [shareSessions, setShareSessions] = useState(false);
  const [shareBest, setShareBest] = useState(false);
  const [bodyweightInput, setBodyweightInput] = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [shareGlobalBench, setShareGlobalBench] = useState(false);
  const [sex, setSex] = useState<BenchmarkSex | null>(null);
  const [heightInput, setHeightInput] = useState('');
  const [yearsTrainingInput, setYearsTrainingInput] = useState('');

  const loadPrivacy = useCallback(async () => {
    if (!user) return;
    const p = await pullProfile();
    if (p) {
      setDisplayName(p.displayName ?? '');
      setShareVol(p.shareWeeklyVolume);
      setShareSessions(p.shareSessionCount);
      setShareBest(p.shareBestLifts);
      setBodyweightInput(
        p.bodyweightKg != null
          ? formatWeightFromKgForInput(p.bodyweightKg, weightUnitRef.current)
          : ''
      );
      setBirthYearInput(p.birthYear != null ? String(p.birthYear) : '');
      setCountryInput(p.countryCode ?? '');
      setShareGlobalBench(p.shareGlobalBenchmarks);
      setSex(p.sex);
      setHeightInput(p.heightCm != null ? String(p.heightCm) : '');
      setYearsTrainingInput(p.yearsTraining != null ? String(p.yearsTraining) : '');
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
    showAlert('Copied', 'User id copied. Share with friends to connect.');
  };

  const parseProfilePayload = () => {
    const bodyweightKg =
      bodyweightInput.trim() === ''
        ? null
        : (() => {
            const k = parseWeightInputToKg(bodyweightInput, weightUnit);
            return k != null && k > 0 ? k : null;
          })();
    const by = parseInt(birthYearInput.trim(), 10);
    const birthYear =
      birthYearInput.trim() === '' || Number.isNaN(by) ? null : by;
    if (birthYear != null && (by < 1930 || by > new Date().getFullYear() - 12)) {
      return { error: 'Enter a realistic birth year (age 12+).' as const };
    }
    const cc = countryInput.trim().toUpperCase();
    if (cc.length > 0 && cc.length !== 2) {
      return { error: 'Country must be a 2-letter code (e.g. US) or empty.' as const };
    }
    const h = parseFloat(heightInput.replace(',', '.'));
    const heightCm =
      heightInput.trim() === '' || Number.isNaN(h)
        ? null
        : h;
    if (heightCm != null && (heightCm < 100 || heightCm > 250)) {
      return { error: 'Height should be 100–250 cm or left blank.' as const };
    }
    const yt = parseInt(yearsTrainingInput.trim(), 10);
    const yearsTraining =
      yearsTrainingInput.trim() === '' || Number.isNaN(yt) ? null : yt;
    if (yearsTraining != null && (yearsTraining < 0 || yearsTraining > 80)) {
      return { error: 'Years of training should be 0–80 or left blank.' as const };
    }
    if (shareGlobalBench && !sex) {
      return { error: 'Choose a benchmark group (sex / gender category) to use global rankings.' as const };
    }
    return {
      error: null as null,
      bodyweightKg,
      birthYear,
      countryCode: cc.length === 2 ? cc : null,
      heightCm,
      yearsTraining,
      sex,
    };
  };

  const savePrivacy = async () => {
    const parsed = parseProfilePayload();
    if (parsed.error) {
      showAlert('Profile', parsed.error);
      return;
    }
    setSavingPrivacy(true);
    const { error } = await updateProfilePrivacy({
      displayName: displayName.trim() || undefined,
      shareWeeklyVolume: shareVol,
      shareSessionCount: shareSessions,
      shareBestLifts: shareBest,
      bodyweightKg: parsed.bodyweightKg,
      birthYear: parsed.birthYear,
      countryCode: parsed.countryCode,
      shareGlobalBenchmarks: shareGlobalBench,
      sex: parsed.sex,
      heightCm: parsed.heightCm,
      yearsTraining: parsed.yearsTraining,
      weightUnit,
    });
    setSavingPrivacy(false);
    if (error) showAlert('Profile', friendlyBackendError(error));
    else showAlert('Saved', 'Profile updated.');
  };

  const runSync = async () => {
    if (!user) return;
    setSyncing(true);
    const { error, pulled } = await syncAll(user.id);
    setSyncing(false);
    if (error) showAlert('Sync', friendlyBackendError(error));
    else if (pulled) {
      showAlert('Sync complete', `Local changes uploaded.\n\n${formatPulledSummary(pulled)}`);
    } else showAlert('Sync complete', 'Local changes uploaded. Nothing new from the cloud.');
  };

  const onSelectWeightUnit = async (next: WeightUnit) => {
    if (next === weightUnit) return;
    if (bodyweightInput.trim()) {
      const kg = parseWeightInputToKg(bodyweightInput, weightUnit);
      if (kg != null) setBodyweightInput(formatWeightFromKgForInput(kg, next));
    }
    await setWeightUnit(next);
  };

  if (loading) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} size="large" />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading account…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={[styles.kicker, { color: c.textMuted }]}>Account</Text>
        <Text style={[styles.title, { color: c.text }]}>{user ? 'Profile & sync' : 'Account'}</Text>
        <Text style={[styles.sub, { color: c.textMuted }]}>
          {user
            ? 'Cloud backup, friend compare, optional global rankings, and sync.'
            : 'Train locally, or sign in to sync and use Compare & Coach.'}
        </Text>
      </View>

      {!backendReady ? (
        <View style={[styles.callout, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.calloutIcon, { backgroundColor: c.background }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={c.tint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.calloutTitle, { color: c.text }]}>Backend not configured</Text>
            <Text style={[styles.calloutBody, { color: c.textMuted }]}>
              Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env (see
              README), then restart the app.
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Units</Text>
      <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
        <View style={styles.cardInner}>
          <Text style={{ color: c.text, fontWeight: '700', marginBottom: 6 }}>Weight &amp; volume</Text>
          <Text style={[styles.privacyIntroText, { color: c.textMuted, marginBottom: 12 }]}>
            Use kg or lb in Workout, Today, History, and Compare. Everything is saved as kg in the cloud; changing
            units converts what you see and your body-weight field here.
          </Text>
          <View style={styles.sexChips}>
            {(['kg', 'lbs'] as const).map((u) => (
              <Pressable
                key={u}
                onPress={() => void onSelectWeightUnit(u)}
                style={[
                  styles.sexChip,
                  {
                    backgroundColor: weightUnit === u ? c.tint : c.background,
                    borderColor: weightUnit === u ? c.tint : c.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: weightUnit === u ? c.onTintLight : c.text,
                    fontWeight: '800',
                    fontSize: 14,
                  }}
                >
                  {u === 'kg' ? 'Kilograms (kg)' : 'Pounds (lb)'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {user ? (
        <>
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Signed in</Text>
          <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
            <View style={styles.cardInner}>
              <View style={styles.signedInHead}>
                <View style={[styles.avatarPlaceholder, { backgroundColor: c.background }]}>
                  <Ionicons name="person" size={28} color={c.tint} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.labelMuted, { color: c.textMuted }]}>Email</Text>
                  <Text style={[styles.email, { color: c.text }]} numberOfLines={2}>
                    {user.email}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={copyId}
                style={[styles.copyBtn, { backgroundColor: c.background, borderColor: c.border }]}
              >
                <Ionicons name="copy-outline" size={20} color={c.tint} />
                <Text style={{ color: c.tint, fontWeight: '700', marginLeft: 10 }}>Copy user id</Text>
                <Text style={{ color: c.textMuted, fontSize: 12, marginLeft: 'auto' }}>for friends</Text>
              </Pressable>
              <Text selectable style={[styles.userId, { color: c.textMuted }]}>
                {user.id}
              </Text>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Privacy · Compare</Text>
          <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
            <View style={styles.cardInner}>
              <View style={styles.privacyIntro}>
                <Ionicons name="people-outline" size={22} color={c.tint} />
                <Text style={[styles.privacyIntroText, { color: c.textMuted }]}>
                  Only accepted friends see the stats you enable below.
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="How friends see you"
                placeholderTextColor={c.textMuted}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />

              <PrivacyRow
                c={c}
                icon="bar-chart-outline"
                label="Share 7-day volume"
                value={shareVol}
                onValueChange={setShareVol}
              />
              <PrivacyRow
                c={c}
                icon="calendar-outline"
                label="Share session count (7d)"
                value={shareSessions}
                onValueChange={setShareSessions}
              />
              <PrivacyRow
                c={c}
                icon="trophy-outline"
                label="Share best lift label"
                value={shareBest}
                onValueChange={setShareBest}
              />
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Benchmarks · global compare</Text>
          <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
            <View style={styles.cardInner}>
              <View style={styles.privacyIntro}>
                <Ionicons name="earth-outline" size={22} color={c.tint} />
                <Text style={[styles.privacyIntroText, { color: c.textMuted }]}>
                  Compare to anonymous cohorts with the same benchmark group (sex category), similar age and weight,
                  and—if you add them—similar height and training history. No public leaderboards with your name.
                  Regional stats use your country code when you add one.
                </Text>
              </View>

              <Text style={[styles.fieldLabel, { color: c.textMuted }]}>Benchmark group</Text>
              <Text style={[styles.hintBelowLabel, { color: c.textMuted }]}>
                Used only to match you to similar athletes (male / female / non-binary / prefer not to say).
              </Text>
              <View style={styles.sexChips}>
                {BENCHMARK_SEX_OPTIONS.map((opt) => {
                  const on = sex === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setSex(opt.value)}
                      style={[
                        styles.sexChip,
                        {
                          backgroundColor: on ? c.tint : c.background,
                          borderColor: on ? c.tint : c.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: on ? c.onTintLight : c.text,
                          fontWeight: '700',
                          fontSize: 13,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {sex ? (
                <Pressable onPress={() => setSex(null)} hitSlop={8}>
                  <Text style={{ color: c.tint, fontSize: 13, fontWeight: '600', marginTop: 6 }}>
                    Clear selection
                  </Text>
                </Pressable>
              ) : null}

              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 16 }]}>
                Body weight ({weightUnitLabel(weightUnit)})
              </Text>
              <TextInput
                value={bodyweightInput}
                onChangeText={setBodyweightInput}
                placeholder="e.g. 78.5"
                placeholderTextColor={c.textMuted}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>Birth year</Text>
              <TextInput
                value={birthYearInput}
                onChangeText={setBirthYearInput}
                placeholder="e.g. 1995"
                placeholderTextColor={c.textMuted}
                keyboardType="number-pad"
                maxLength={4}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>Height (cm, optional)</Text>
              <TextInput
                value={heightInput}
                onChangeText={setHeightInput}
                placeholder="Tighter cohort when set (±8%)"
                placeholderTextColor={c.textMuted}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>
                Years training (optional)
              </Text>
              <TextInput
                value={yearsTrainingInput}
                onChangeText={setYearsTrainingInput}
                placeholder="Structured lifting / running, whole years"
                placeholderTextColor={c.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />
              <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 14 }]}>Country (optional)</Text>
              <TextInput
                value={countryInput}
                onChangeText={(t) => setCountryInput(t.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2))}
                placeholder="ISO code, e.g. US"
                placeholderTextColor={c.textMuted}
                autoCapitalize="characters"
                maxLength={2}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
              />

              <PrivacyRow
                c={c}
                icon="stats-chart-outline"
                label="Join global & regional benchmarks"
                value={shareGlobalBench}
                onValueChange={setShareGlobalBench}
              />
              <Text style={[styles.signOutHint, { color: c.textMuted, marginTop: 0, marginBottom: 0 }]}>
                Weekly load is volume vs body weight; running uses timed sets on cardio exercises like Run / treadmill
                (last 7 days). Height and years training narrow the cohort when both you and others fill them in. You
                need enough opted-in people in your group to see percentiles—check Compare after sync.
              </Text>

              <Pressable
                style={[
                  styles.primaryBtn,
                  { backgroundColor: c.tint, opacity: savingPrivacy ? 0.65 : 1 },
                ]}
                onPress={savePrivacy}
                disabled={savingPrivacy || syncing}
              >
                {savingPrivacy ? (
                  <ActivityIndicator color={c.onTintLight} />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={22} color={c.onTintLight} />
                    <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Save profile</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Data</Text>
          <Pressable
            style={[
              styles.syncCard,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                opacity: syncing || savingPrivacy ? 0.65 : 1,
              },
            ]}
            onPress={runSync}
            disabled={syncing || savingPrivacy}
          >
            <View style={[styles.syncIconWrap, { backgroundColor: c.background }]}>
              {syncing ? (
                <ActivityIndicator color={c.tint} />
              ) : (
                <Ionicons name="cloud-upload-outline" size={24} color={c.tint} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.syncTitle, { color: c.text }]}>
                {syncing ? 'Syncing…' : 'Sync to cloud'}
              </Text>
              <Text style={[styles.syncSub, { color: c.textMuted }]}>
                Push local changes, then pull from Supabase.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={c.textMuted} />
          </Pressable>

          <Pressable
            onPress={() => signOut()}
            style={[styles.signOutBtn, { borderColor: c.danger, backgroundColor: c.background }]}
          >
            <Ionicons name="log-out-outline" size={22} color={c.danger} />
            <Text style={{ color: c.danger, fontWeight: '800', fontSize: 16, marginLeft: 10 }}>
              Sign out
            </Text>
          </Pressable>
          <Text style={[styles.signOutHint, { color: c.textMuted }]}>
            Signing out removes all workouts, routines, and exercises from this device. You can keep
            training locally without an account; sign in again to sync.
          </Text>
        </>
      ) : (
        <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
          <View style={styles.cardInner}>
            <View style={styles.authIntro}>
              <Ionicons name="phone-portrait-outline" size={26} color={c.tint} />
              <Text style={[styles.authIntroText, { color: c.textMuted }]}>
                Workouts and routines stay on this device until you sign in. Use the sign-in screen to
                create an account or log in and sync.
              </Text>
            </View>
            <Link href="/sign-in" asChild>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: c.tint, opacity: backendReady ? 1 : 0.55 }]}
                disabled={!backendReady}
              >
                <Ionicons name="log-in-outline" size={22} color={c.onTintLight} />
                <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Open sign in</Text>
              </Pressable>
            </Link>
            {!backendReady ? (
              <Text style={[styles.signOutHint, { color: c.textMuted, marginTop: 8, marginBottom: 0 }]}>
                Configure Supabase in .env first (see README), then you can sign in here.
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function PrivacyRow({
  icon,
  label,
  value,
  onValueChange,
  c,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[styles.privacyRow, { backgroundColor: c.background, borderColor: c.border }]}>
      <Ionicons name={icon} size={20} color={c.tint} style={{ marginRight: 12 }} />
      <Text style={{ color: c.text, flex: 1, fontWeight: '600', fontSize: 15 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: c.tint }} />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  content: { paddingBottom: 48 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  callout: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
    alignItems: 'flex-start',
  },
  calloutIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calloutTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  calloutBody: { fontSize: 14, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  accentCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 4,
  },
  cardAccent: { width: 4 },
  cardInner: { flex: 1, padding: 18, gap: 12 },
  signedInHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelMuted: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  email: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  userId: { fontSize: 11, fontFamily: 'monospace', lineHeight: 16, marginTop: 4 },
  privacyIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  privacyIntroText: { flex: 1, fontSize: 14, lineHeight: 20 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  hintBelowLabel: { fontSize: 12, lineHeight: 17, marginTop: -2, marginBottom: 10 },
  sexChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sexChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 17 },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 14,
  },
  syncIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncTitle: { fontSize: 17, fontWeight: '800' },
  syncSub: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  signOutHint: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 32,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  authIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  authIntroText: { flex: 1, fontSize: 14, lineHeight: 20 },
});
