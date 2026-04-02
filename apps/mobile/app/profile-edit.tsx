import { useColors } from '@/src/hooks/useColors';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import {
  pullProfile,
  updateProfilePrivacy,
  type BenchmarkSex,
} from '@/src/sync/syncEngine';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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

type ParsedProfileFields = {
  bodyweightKg: number | null;
  birthYear: number | null;
  countryCode: string | null;
  heightCm: number | null;
  yearsTraining: number | null;
  sex: BenchmarkSex | null;
};

export default function ProfileEditScreen() {
  const c = useColors();
  const router = useRouter();
  const { user, loading, backendReady } = useAuth();
  const { unit: weightUnit, setWeightUnit } = useWeightUnit();
  const showAlert = useAppAlert();
  const weightUnitRef = useRef(weightUnit);
  weightUnitRef.current = weightUnit;

  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bodyweightInput, setBodyweightInput] = useState('');
  const [birthYearInput, setBirthYearInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [sex, setSex] = useState<BenchmarkSex | null>(null);
  const [heightInput, setHeightInput] = useState('');
  const [yearsTrainingInput, setYearsTrainingInput] = useState('');

  useEffect(() => {
    if (!loading && !user) router.back();
  }, [loading, user, router]);

  const loadForm = useCallback(async () => {
    if (!user) return;
    const p = await pullProfile();
    if (p) {
      setDisplayName(p.displayName ?? '');
      setBodyweightInput(
        p.bodyweightKg != null
          ? formatWeightFromKgForInput(p.bodyweightKg, weightUnitRef.current)
          : ''
      );
      setBirthYearInput(p.birthYear != null ? String(p.birthYear) : '');
      setCountryInput(p.countryCode ?? '');
      setSex(p.sex);
      setHeightInput(p.heightCm != null ? String(p.heightCm) : '');
      setYearsTrainingInput(p.yearsTraining != null ? String(p.yearsTraining) : '');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void loadForm();
    }, [loadForm])
  );

  const parseProfilePayload = (
    requireGlobal: boolean
  ): { ok: false; error: string } | { ok: true; fields: ParsedProfileFields } => {
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
      return { ok: false, error: 'Enter a realistic birth year (age 12+).' };
    }
    const cc = countryInput.trim().toUpperCase();
    if (cc.length > 0 && cc.length !== 2) {
      return { ok: false, error: 'Country must be a 2-letter code (e.g. US) or empty.' };
    }
    const h = parseFloat(heightInput.replace(',', '.'));
    const heightCm =
      heightInput.trim() === '' || Number.isNaN(h)
        ? null
        : h;
    if (heightCm != null && (heightCm < 100 || heightCm > 250)) {
      return { ok: false, error: 'Height should be 100–250 cm or left blank.' };
    }
    const yt = parseInt(yearsTrainingInput.trim(), 10);
    const yearsTraining =
      yearsTrainingInput.trim() === '' || Number.isNaN(yt) ? null : yt;
    if (yearsTraining != null && (yearsTraining < 0 || yearsTraining > 80)) {
      return { ok: false, error: 'Years of training should be 0–80 or left blank.' };
    }
    if (requireGlobal && !sex) {
      return { ok: false, error: 'Choose a gender to keep global sharing on.' };
    }
    if (requireGlobal && (bodyweightKg == null || birthYear == null)) {
      return { ok: false, error: 'Add body weight and birth year to keep global sharing on.' };
    }
    return {
      ok: true,
      fields: {
        bodyweightKg,
        birthYear,
        countryCode: cc.length === 2 ? cc : null,
        heightCm,
        yearsTraining,
        sex,
      },
    };
  };

  const save = async () => {
    const p = await pullProfile();
    if (!p) {
      showAlert('Profile', 'Could not load your profile.');
      return;
    }
    const parsed = parseProfilePayload(p.shareGlobalBenchmarks);
    if (!parsed.ok) {
      showAlert('Profile', parsed.error);
      return;
    }
    setSaving(true);
    const { error } = await updateProfilePrivacy({
      displayName: displayName.trim() || undefined,
      shareWeeklyVolume: p.shareWeeklyVolume,
      shareSessionCount: p.shareSessionCount,
      shareBestLifts: p.shareBestLifts,
      bodyweightKg: parsed.fields.bodyweightKg,
      birthYear: parsed.fields.birthYear,
      countryCode: parsed.fields.countryCode,
      shareGlobalBenchmarks: p.shareGlobalBenchmarks,
      sex: parsed.fields.sex,
      heightCm: parsed.fields.heightCm,
      yearsTraining: parsed.fields.yearsTraining,
      weightUnit,
    });
    setSaving(false);
    if (error) showAlert('Profile', friendlyBackendError(error));
    else showAlert('Saved', 'Profile updated.');
  };

  const onSelectWeightUnit = async (next: WeightUnit) => {
    if (next === weightUnit) return;
    if (bodyweightInput.trim()) {
      const kg = parseWeightInputToKg(bodyweightInput, weightUnit);
      if (kg != null) setBodyweightInput(formatWeightFromKgForInput(kg, next));
    }
    await setWeightUnit(next);
  };

  if (loading || !user) {
    return (
      <View style={[styles.loadingRoot, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.tint} size="large" />
        <Text style={[styles.loadingText, { color: c.textMuted }]}>Loading…</Text>
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
        {!backendReady ? (
          <View style={[styles.callout, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="cloud-offline-outline" size={24} color={c.tint} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.calloutTitle, { color: c.text }]}>Backend not configured</Text>
              <Text style={[styles.calloutBody, { color: c.textMuted }]}>
                Configure Supabase in .env to save profile changes to the cloud.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={[styles.accentCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
          <View style={styles.cardInner}>
            <Text style={[styles.intro, { color: c.textMuted }]}>
              Saved to your account. Used for friend display name and—if you enable it on Account—for anonymous
              global cohort matching. No public leaderboard with your name.
            </Text>

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

            <Text style={[styles.fieldLabel, { color: c.textMuted, marginTop: 4 }]}>Gender</Text>
            <Text style={[styles.hintBelowLabel, { color: c.textMuted }]}>
              Used for anonymous cohort matching (male / female / non-binary / prefer not to say).
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
            <View style={styles.unitRow}>
              {(['kg', 'lbs'] as const).map((u) => (
                <Pressable
                  key={u}
                  onPress={() => void onSelectWeightUnit(u)}
                  style={[
                    styles.unitChip,
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
                      fontSize: 13,
                    }}
                  >
                    {u === 'kg' ? 'kg' : 'lb'}
                  </Text>
                </Pressable>
              ))}
            </View>
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

            <Pressable
              style={[
                styles.primaryBtn,
                { backgroundColor: c.tint, opacity: saving || !backendReady ? 0.65 : 1 },
              ]}
              onPress={() => void save()}
              disabled={saving || !backendReady}
            >
              {saving ? (
                <ActivityIndicator color={c.onTintLight} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={22} color={c.onTintLight} />
                  <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Save</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingRoot: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { fontSize: 15, fontWeight: '600' },
  content: { padding: 16, paddingBottom: 40 },
  callout: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  calloutTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  calloutBody: { fontSize: 14, lineHeight: 20 },
  accentCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardAccent: { width: 4 },
  cardInner: { flex: 1, padding: 18, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
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
  unitRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  unitChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
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
});
