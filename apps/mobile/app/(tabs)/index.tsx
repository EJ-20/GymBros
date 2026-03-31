import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export default function TodayScreen() {
  const c = useColors();
  const [active, setActive] = useState(repo.getActiveSession());
  const [last, setLast] = useState<ReturnType<typeof repo.listSessions>[0] | null>(null);
  const [weekCount, setWeekCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setActive(repo.getActiveSession());
      const sessions = repo.listSessions(30);
      const completed = sessions.filter((s) => s.endedAt);
      setLast(completed[0] ?? null);
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      setWeekCount(completed.filter((s) => new Date(s.endedAt!).getTime() >= weekAgo).length);
    }, [])
  );

  const durationMin = last?.endedAt
    ? Math.round(
        (new Date(last.endedAt).getTime() - new Date(last.startedAt).getTime()) / 60000
      )
    : null;

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: c.background }]}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: c.text }]}>GymBros</Text>
      <Text style={[styles.sub, { color: c.textMuted }]}>
        Log sessions, sync to the cloud, compare with friends, and ask the coach.
      </Text>
      <Link href="/routines" asChild>
        <Pressable style={{ marginBottom: 8 }}>
          <Text style={{ color: c.tint, fontWeight: '600' }}>Routines →</Text>
        </Pressable>
      </Link>

      {active ? (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Workout in progress</Text>
          <Text style={{ color: c.textMuted }}>Started {new Date(active.startedAt).toLocaleString()}</Text>
          <Link href="/(tabs)/workout" asChild>
            <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
              <Text style={styles.primaryBtnText}>Continue</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Ready to train?</Text>
          <Link href="/(tabs)/workout" asChild>
            <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]}>
              <Text style={styles.primaryBtnText}>Start workout</Text>
            </Pressable>
          </Link>
        </View>
      )}

      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>This week</Text>
        <Text style={[styles.stat, { color: c.text }]}>{weekCount} completed sessions</Text>
      </View>

      {last && (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Last session</Text>
          <Text style={{ color: c.textMuted }}>
            {new Date(last.startedAt).toLocaleDateString()}
            {durationMin != null ? ` · ${durationMin} min` : ''}
          </Text>
          <Text style={[styles.stat, { color: c.text }]}>
            Volume: {Math.round(repo.sessionVolumeKg(last.id))} kg·reps
            {last.perceivedExertion != null ? ` · RPE ${last.perceivedExertion}` : ''}
          </Text>
          {last.notes ? (
            <Text style={{ color: c.textMuted, marginTop: 6 }} numberOfLines={2}>
              {last.notes}
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  sub: { fontSize: 15, lineHeight: 22 },
  card: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  cardTitle: { fontSize: 18, fontWeight: '600' },
  stat: { fontSize: 16, fontWeight: '500' },
  primaryBtn: {
    marginTop: 8,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#0f1419', fontWeight: '700', fontSize: 16 },
});
