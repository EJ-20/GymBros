import { bestSetFromHistory, isPrCandidate } from '@gymbros/shared';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { openWorkoutDeepLink } from '@/src/watch/WatchBridge';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Exercise, SetLog, WorkoutSession, WorkoutTemplate } from '@gymbros/shared';

export default function WorkoutScreen() {
  const c = useColors();
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetLog[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [pickRoutineOpen, setPickRoutineOpen] = useState(false);
  const [saveRoutineOpen, setSaveRoutineOpen] = useState(false);
  const [saveRoutineName, setSaveRoutineName] = useState('');
  const [endWorkoutOpen, setEndWorkoutOpen] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [endRpe, setEndRpe] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [reps, setReps] = useState('8');
  const [weight, setWeight] = useState('20');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  /** When set, shows chips to jump through a saved routine (in-memory for this session). */
  const [routineExerciseIds, setRoutineExerciseIds] = useState<string[] | null>(null);
  const exercises = repo.listExercises();
  const templates = repo.listTemplates();

  const currentSessionId = () => session?.id ?? repo.getActiveSession()?.id ?? '';

  const refresh = useCallback(() => {
    const s = repo.getActiveSession();
    setSession(s);
    if (!s) {
      setSetsByExercise({});
      return;
    }
    const allSets = repo.listSetsForSession(s.id);
    const map: Record<string, SetLog[]> = {};
    for (const st of allSets) {
      if (!map[st.exerciseId]) map[st.exerciseId] = [];
      map[st.exerciseId].push(st);
    }
    setSetsByExercise(map);
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  const prefillFromHistory = (exerciseId: string, sessionIdForPrior: string) => {
    const prior = repo.listSetsForExerciseBeforeSession(exerciseId, sessionIdForPrior);
    const best = bestSetFromHistory(prior);
    if (best) {
      setReps(String(best.reps));
      setWeight(String(best.weightKg));
    }
  };

  const pickExercise = (ex: Exercise) => {
    setSelectedExerciseId(ex.id);
    setPickerOpen(false);
    prefillFromHistory(ex.id, currentSessionId());
  };

  const jumpToRoutineExercise = (exerciseId: string) => {
    const ex = repo.getExerciseById(exerciseId);
    if (!ex || !session) return;
    setSelectedExerciseId(exerciseId);
    prefillFromHistory(exerciseId, session.id);
  };

  const elapsedMin = session
    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000)
    : 0;

  const start = () => {
    setRoutineExerciseIds(null);
    const s = repo.startSession('phone');
    setSession(s);
    openWorkoutDeepLink('active');
    refresh();
  };

  const startFromTemplate = (t: WorkoutTemplate) => {
    setPickRoutineOpen(false);
    if (repo.getActiveSession()) {
      Alert.alert('Workout in progress', 'End your current session first.');
      return;
    }
    const s = repo.startSession('phone');
    setSession(s);
    setRoutineExerciseIds([...t.exerciseIds]);
    const firstId = t.exerciseIds[0];
    if (firstId) {
      setSelectedExerciseId(firstId);
      prefillFromHistory(firstId, s.id);
    } else {
      setSelectedExerciseId(null);
    }
    openWorkoutDeepLink('active');
    refresh();
  };

  const end = () => {
    if (!session) return;
    setEndNotes('');
    setEndRpe(null);
    setEndWorkoutOpen(true);
  };

  const confirmEndWorkout = () => {
    if (!session) return;
    repo.endSession(session.id, endNotes.trim() || null, endRpe);
    setEndWorkoutOpen(false);
    setSession(null);
    setSetsByExercise({});
    setRoutineExerciseIds(null);
    setSelectedExerciseId(null);
  };

  const openSaveRoutine = () => {
    if (!session) return;
    const ids = repo.orderedExerciseIdsFromSession(session.id);
    if (ids.length === 0) {
      Alert.alert('Nothing to save', 'Log at least one set first.');
      return;
    }
    setSaveRoutineName('');
    setSaveRoutineOpen(true);
  };

  const confirmSaveRoutine = () => {
    const n = saveRoutineName.trim();
    if (!n || !session) return;
    repo.createTemplate(n, repo.orderedExerciseIdsFromSession(session.id));
    setSaveRoutineName('');
    setSaveRoutineOpen(false);
    Alert.alert('Saved', 'Open Routines in the header or Workout tab to edit it.');
  };

  const addCustom = () => {
    const name = customName.trim();
    if (!name) return;
    const ex = repo.createExercise(name, 'full_body');
    setCustomName('');
    setCustomOpen(false);
    pickExercise(ex);
    refresh();
  };

  const addSet = () => {
    if (!session || !selectedExerciseId) {
      Alert.alert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const r = parseInt(reps, 10);
    const w = parseFloat(weight);
    if (Number.isNaN(r) || Number.isNaN(w)) {
      Alert.alert('Invalid numbers', 'Enter reps and weight.');
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const best = bestSetFromHistory(prior);
    const newSet = repo.addSet(session.id, selectedExerciseId, {
      reps: r,
      weightKg: w,
    });
    const pr = isPrCandidate(newSet, best);
    refresh();
    if (pr) Alert.alert('PR', 'Nice — estimated 1RM up on this exercise.');
  };

  const exerciseRows = Object.keys(setsByExercise).map((id) => ({
    exercise: repo.getExerciseById(id)!,
    sets: setsByExercise[id],
  }));

  if (!session) {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        <Text style={[styles.headline, { color: c.text }]}>No active workout</Text>
        <Text style={[styles.muted, { color: c.textMuted }]}>
          Start empty, follow a saved routine, or manage routines in the list.
        </Text>
        <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]} onPress={start}>
          <Text style={styles.primaryBtnText}>Start workout</Text>
        </Pressable>
        <Pressable
          style={[styles.secondaryOutline, { borderColor: c.tint }]}
          onPress={() => setPickRoutineOpen(true)}
        >
          <Text style={{ color: c.tint, fontWeight: '600' }}>Start from routine</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/routines')}>
          <Text style={{ color: c.textMuted, marginTop: 8 }}>Manage routines →</Text>
        </Pressable>

        <Modal visible={pickRoutineOpen} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: c.card }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Pick a routine</Text>
              <FlatList
                data={templates}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: '65%' }}
                ListEmptyComponent={
                  <Text style={{ color: c.textMuted, marginBottom: 12 }}>
                    No routines yet. Create one under Manage routines.
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => startFromTemplate(item)}
                    style={[styles.pickRow, { borderBottomColor: c.border }]}
                  >
                    <Text style={{ color: c.text, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 13 }}>
                      {item.exerciseIds.length} exercises
                    </Text>
                  </Pressable>
                )}
              />
              <Pressable onPress={() => setPickRoutineOpen(false)} style={{ marginTop: 12 }}>
                <Text style={{ color: c.tint }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.banner, { backgroundColor: c.card, borderColor: c.border }]}>
        <View>
          <Text style={[styles.timer, { color: c.text }]}>{elapsedMin} min</Text>
          <Pressable onPress={openSaveRoutine} hitSlop={8}>
            <Text style={{ color: c.tint, fontSize: 13, marginTop: 4 }}>Save as routine</Text>
          </Pressable>
        </View>
        <Pressable onPress={end} style={[styles.endBtn, { borderColor: c.danger }]}>
          <Text style={{ color: c.danger, fontWeight: '600' }}>End</Text>
        </Pressable>
      </View>

      {routineExerciseIds && routineExerciseIds.length > 0 ? (
        <View style={[styles.routineStrip, { borderBottomColor: c.border }]}>
          <Text style={[styles.routineLabel, { color: c.textMuted }]}>Routine</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {routineExerciseIds.map((eid) => {
              const ex = repo.getExerciseById(eid);
              const active = selectedExerciseId === eid;
              return (
                <Pressable
                  key={eid}
                  onPress={() => jumpToRoutineExercise(eid)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? c.tint : c.card,
                      borderColor: c.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? '#0f1419' : c.text,
                      fontWeight: active ? '700' : '500',
                      fontSize: 13,
                    }}
                    numberOfLines={1}
                  >
                    {ex?.name ?? '…'}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <Pressable
        style={[styles.secondaryBtn, { backgroundColor: c.card, borderColor: c.border }]}
        onPress={() => setPickerOpen(true)}
      >
        <Text style={{ color: c.tint, fontWeight: '600' }}>
          {selectedExerciseId
            ? repo.getExerciseById(selectedExerciseId)?.name ?? 'Exercise'
            : 'Select exercise'}
        </Text>
      </Pressable>

      <View style={[styles.inputRow, { borderColor: c.border }]}>
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border }]}
          keyboardType="number-pad"
          value={reps}
          onChangeText={setReps}
          placeholder="Reps"
          placeholderTextColor={c.textMuted}
        />
        <TextInput
          style={[styles.input, { color: c.text, borderColor: c.border }]}
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
          placeholder="kg"
          placeholderTextColor={c.textMuted}
        />
        <Pressable style={[styles.addSetBtn, { backgroundColor: c.tint }]} onPress={addSet}>
          <Text style={styles.primaryBtnText}>Add set</Text>
        </Pressable>
      </View>

      <FlatList
        data={exerciseRows}
        keyExtractor={(item) => item.exercise.id}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.exName, { color: c.text }]}>{item.exercise.name}</Text>
            {item.sets.map((s) => (
              <Text key={s.id} style={{ color: c.textMuted }}>
                Set {s.orderIndex + 1}: {s.reps} × {s.weightKg} kg
                {s.rpe != null ? ` @ RPE ${s.rpe}` : ''}
              </Text>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 24 }}>
            Add exercises and sets as you train.
          </Text>
        }
      />

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Exercises</Text>
            <Pressable onPress={() => setCustomOpen(true)} style={{ marginBottom: 12 }}>
              <Text style={{ color: c.tint, fontWeight: '600' }}>+ Custom exercise</Text>
            </Pressable>
            <FlatList
              data={exercises}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pickExercise(item)}
                  style={[styles.pickRow, { borderBottomColor: c.border }]}
                >
                  <Text style={{ color: c.text }}>{item.name}</Text>
                  <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.muscleGroup}</Text>
                </Pressable>
              )}
            />
            <Pressable onPress={() => setPickerOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: c.tint }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={customOpen} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.card }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>New exercise</Text>
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="Name"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { color: c.text, borderColor: c.border, marginBottom: 12 }]}
            />
            <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]} onPress={addCustom}>
              <Text style={styles.primaryBtnText}>Save & select</Text>
            </Pressable>
            <Pressable onPress={() => setCustomOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: c.tint }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={endWorkoutOpen} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { justifyContent: 'center' }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Finish workout</Text>
            <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 12 }}>
              Optional session notes and how hard it felt (RPE 1–10).
            </Text>
            <TextInput
              value={endNotes}
              onChangeText={setEndNotes}
              placeholder="Notes (e.g. slept badly, PR on squat)"
              placeholderTextColor={c.textMuted}
              multiline
              style={[
                styles.input,
                {
                  color: c.text,
                  borderColor: c.border,
                  marginBottom: 16,
                  minHeight: 88,
                  textAlignVertical: 'top',
                },
              ]}
            />
            <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 8 }}>Session RPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rpeRow}>
              <Pressable
                onPress={() => setEndRpe(null)}
                style={[
                  styles.rpeChip,
                  {
                    borderColor: c.border,
                    backgroundColor: endRpe === null ? c.tint : c.background,
                  },
                ]}
              >
                <Text style={{ color: endRpe === null ? '#0f1419' : c.textMuted, fontWeight: '600' }}>
                  Skip
                </Text>
              </Pressable>
              {([1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setEndRpe(n)}
                  style={[
                    styles.rpeChip,
                    {
                      borderColor: c.border,
                      backgroundColor: endRpe === n ? c.tint : c.background,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: endRpe === n ? '#0f1419' : c.text,
                      fontWeight: endRpe === n ? '700' : '500',
                    }}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.tint, marginTop: 20 }]}
              onPress={confirmEndWorkout}
            >
              <Text style={styles.primaryBtnText}>Save & end</Text>
            </Pressable>
            <Pressable onPress={() => setEndWorkoutOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: c.tint }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={saveRoutineOpen} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { justifyContent: 'center' }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Save as routine</Text>
            <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 12 }}>
              Uses exercise order from your first logged set per movement.
            </Text>
            <TextInput
              value={saveRoutineName}
              onChangeText={setSaveRoutineName}
              placeholder="Routine name"
              placeholderTextColor={c.textMuted}
              style={[styles.input, { color: c.text, borderColor: c.border, marginBottom: 16 }]}
            />
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.tint }]}
              onPress={confirmSaveRoutine}
            >
              <Text style={styles.primaryBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setSaveRoutineOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: c.tint }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  headline: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  muted: { textAlign: 'center', fontSize: 15 },
  secondaryOutline: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  timer: { fontSize: 20, fontWeight: '700' },
  endBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  routineStrip: {
    paddingVertical: 10,
    paddingLeft: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  routineLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' },
  chipRow: { gap: 8, paddingRight: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 160,
  },
  secondaryBtn: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginTop: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addSetBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  primaryBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { color: '#0f1419', fontWeight: '700' },
  card: { borderRadius: 12, padding: 12, borderWidth: 1 },
  exName: { fontWeight: '600', marginBottom: 6 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '70%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  saveCard: {
    marginHorizontal: 24,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rpeRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  rpeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
