import { useColors } from '@/src/hooks/useColors';
import { useAuth } from '@/src/contexts/AuthContext';
import { SIGN_IN_PROMPT_DISMISS_KEY } from '@/src/lib/storageKeys';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function SignInPromptBanner() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, loading, backendReady } = useAuth();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SIGN_IN_PROMPT_DISMISS_KEY).then((v) => {
      if (!cancelled) setDismissed(v === '1');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(SIGN_IN_PROMPT_DISMISS_KEY, '1');
  }, []);

  if (loading || user || !backendReady || dismissed) return null;

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: c.card,
          borderBottomColor: c.border,
          paddingTop: insets.top,
        },
      ]}
    >
      <View style={[styles.accent, { backgroundColor: c.tint }]} />
      <View style={styles.inner}>
        <Ionicons name="cloud-outline" size={22} color={c.tint} style={{ marginRight: 12 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: c.text }]}>Sign in to sync</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            Workouts stay on this device until you back them up from Account.
          </Text>
        </View>
        <Link href="/sign-in" asChild>
          <Pressable style={[styles.cta, { backgroundColor: c.tint }]}>
            <Text style={[styles.ctaText, { color: c.onTintLight }]}>Sign in</Text>
          </Pressable>
        </Link>
        <Pressable onPress={dismiss} hitSlop={12} accessibilityLabel="Dismiss sign-in prompt">
          <Ionicons name="close" size={22} color={c.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  accent: { width: 3 },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 12,
    paddingLeft: 10,
    gap: 4,
  },
  title: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  cta: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  ctaText: { fontWeight: '800', fontSize: 13 },
});
