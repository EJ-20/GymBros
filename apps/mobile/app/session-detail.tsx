import { KeyboardAvoidingScreen } from '@/src/components/KeyboardAvoidingScreen';
import { useAuth } from '@/src/contexts/AuthContext';
import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import { formatSetSummary } from '@/src/lib/setDisplay';
import { volumeKgToDisplayNumber, volumeUnitSuffix } from '@/src/lib/weightUnits';
import * as repo from '@/src/db/workoutRepo';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Exercise, SetLog, WorkoutSession } from '@gymbros/shared';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';

function formatSessionDateParts(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      time: d.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    };
  } catch {
    return { date: iso, time: '' };
  }
}

type ExerciseBlock = {
  exercise: Exercise;
  sets: SetLog[];
};

export default function SessionDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { unit } = useWeightUnit();
  const { localDataVersion } = useAuth();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);

  const load = useCallback(() => {
    if (!id || typeof id !== 'string') {
      setSession(null);
      return;
    }
    setSession(repo.getSessionById(id));
  }, [id, localDataVersion]);

  useFocusEffect(useCallback(() => load(), [load]));

  const blocks: ExerciseBlock[] = useMemo(() => {
    if (!session?.id) return [];
    const sets = repo.listSetsForSession(session.id);
    const byEx = new Map<string, SetLog[]>();
    for (const s of sets) {
      const arr = byEx.get(s.exerciseId) ?? [];
      arr.push(s);
      byEx.set(s.exerciseId, arr);
    }
    for (const arr of byEx.values()) {
      arr.sort((a, b) => a.orderIndex - b.orderIndex);
    }
    const order = repo.orderedExerciseIdsFromSession(session.id);
    const seen = new Set<string>();
    const out: ExerciseBlock[] = [];
    for (const eid of order) {
      const list = byEx.get(eid);
      const ex = repo.getExerciseById(eid);
      if (!list?.length || !ex) continue;
      seen.add(eid);
      out.push({ exercise: ex, sets: list });
    }
    for (const eid of byEx.keys()) {
      if (seen.has(eid)) continue;
      const list = byEx.get(eid);
      const ex = repo.getExerciseById(eid);
      if (!list?.length || !ex) continue;
      out.push({ exercise: ex, sets: list });
    }
    return out;
  }, [session, localDataVersion]);

  const volumeKg = session ? repo.sessionVolumeKg(session.id) : 0;
  const durationMin =
    session?.endedAt != null
      ? Math.round(
          (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000
        )
      : null;

  if (!id) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
          <Text style={{ color: c.textMuted }}>Missing session.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: c.tint, fontWeight: '600' }}>Go back</Text>
          </Pressable>
        </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
          <Text style={{ color: c.textMuted, textAlign: 'center', paddingHorizontal: 24 }}>
            This workout was removed or is not on this device.
          </Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: c.tint, fontWeight: '600' }}>Go back</Text>
          </Pressable>
        </View>
    );
  }

  const { date, time } = formatSessionDateParts(session.startedAt);

  return (
      <KeyboardAvoidingScreen variant="stack" style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
        >
          <View style={[styles.hero, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.heroAccent, { backgroundColor: c.tint }]} />
            <View style={styles.heroInner}>
              <Text style={[styles.heroDate, { color: c.text }]}>{date}</Text>
              <Text style={[styles.heroTime, { color: c.textMuted }]}>Started {time}</Text>
              {session.endedAt ? (
                <Text style={[styles.heroEnded, { color: c.textMuted }]}>
                  Ended{' '}
                  {new Date(session.endedAt).toLocaleTimeString(undefined, {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              ) : (
                <Text style={{ color: c.tint, fontWeight: '600', marginTop: 4 }}>In progress</Text>
              )}
              <View style={styles.heroMeta}>
                {durationMin != null ? (
                  <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                    <Ionicons name="time-outline" size={18} color={c.tint} />
                    <Text style={[styles.metaChipText, { color: c.text }]}>{durationMin} min</Text>
                  </View>
                ) : null}
                <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                  <Ionicons name="barbell-outline" size={18} color={c.tint} />
                  <Text style={[styles.metaChipText, { color: c.text }]}>
                    {volumeKgToDisplayNumber(volumeKg, unit).toLocaleString()} {volumeUnitSuffix(unit)}{' '}
                    volume
                  </Text>
                </View>
                {session.perceivedExertion != null ? (
                  <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                    <Ionicons name="pulse-outline" size={18} color={c.tint} />
                    <Text style={[styles.metaChipText, { color: c.text }]}>
                      RPE {session.perceivedExertion}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {session.notes ? (
            <View style={[styles.notesCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.notesHead}>
                <Ionicons name="document-text-outline" size={18} color={c.textMuted} />
                <Text style={[styles.notesTitle, { color: c.textMuted }]}>Notes</Text>
              </View>
              <Text style={[styles.notesBody, { color: c.text }]}>{session.notes}</Text>
            </View>
          ) : null}

          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Exercises & sets</Text>

          {blocks.length === 0 ? (
            <Text style={{ color: c.textMuted, lineHeight: 20 }}>
              No sets were logged for this session.
            </Text>
          ) : (
            <View style={{ gap: 14 }}>
              {blocks.map(({ exercise, sets }) => (
                <View
                  key={exercise.id}
                  style={[styles.exCard, { backgroundColor: c.card, borderColor: c.border }]}
                >
                  <View style={styles.exHead}>
                    <Text style={[styles.exName, { color: c.text }]} numberOfLines={2}>
                      {exercise.name}
                    </Text>
                    <Text style={[styles.exMuscle, { color: c.textMuted }]}>
                      {String(exercise.muscleGroup).replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={[styles.setDivider, { backgroundColor: c.border }]} />
                  {sets.map((s) => (
                    <View key={s.id} style={styles.setRow}>
                      <View style={[styles.setBadge, { backgroundColor: c.background }]}>
                        <Text style={{ color: c.tint, fontWeight: '800', fontSize: 12 }}>
                          {s.orderIndex + 1}
                        </Text>
                      </View>
                      <Text style={[styles.setSummary, { color: c.text }]}>
                        {formatSetSummary(exercise, s, unit)}
                      </Text>
                      {s.rpe != null ? (
                        <Text style={{ color: c.textMuted, fontSize: 13 }}>RPE {s.rpe}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingScreen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  hero: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  heroAccent: { width: 4 },
  heroInner: { flex: 1, padding: 18, gap: 8 },
  heroDate: { fontSize: 20, fontWeight: '800' },
  heroTime: { fontSize: 15, fontWeight: '500' },
  heroEnded: { fontSize: 14, marginTop: 2 },
  heroMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  metaChipText: { fontSize: 13, fontWeight: '700' },
  notesCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  notesHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  notesBody: { fontSize: 15, lineHeight: 22 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  exCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  exHead: { gap: 4 },
  exName: { fontSize: 17, fontWeight: '800' },
  exMuscle: { fontSize: 12, textTransform: 'capitalize' },
  setDivider: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  setBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setSummary: { flex: 1, fontWeight: '600', fontSize: 15 },
});
