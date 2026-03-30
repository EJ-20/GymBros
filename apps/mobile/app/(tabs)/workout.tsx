import { bestSetFromHistory, isPrCandidate } from '@gymbros/shared';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { openWorkoutDeepLink } from '@/src/watch/WatchBridge';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Exercise, SetLog, WorkoutSession } from '@gymbros/shared';

export default function WorkoutScreen() {
  const c = useColors();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetLog[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [reps, setReps] = useState('8');
  const [weight, setWeight] = useState('20');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const exercises = repo.listExercises();

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

  const elapsedMin = session
    ? Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000)
    : 0;

  const start = () => {
    const s = repo.startSession('phone');
    setSession(s);
    openWorkoutDeepLink('active');
    refresh();
  };

  const end = () => {
    if (!session) return;
    Alert.alert('End workout?', 'You can add notes after.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End',
        onPress: () => {
          repo.endSession(session.id);
          setSession(null);
          setSetsByExercise({});
        },
      },
    ]);
  };

  const pickExercise = (ex: Exercise) => {
    setSelectedExerciseId(ex.id);
    setPickerOpen(false);
    const prior = repo.listSetsForExerciseBeforeSession(ex.id, session?.id ?? '');
    const best = bestSetFromHistory(prior);
    if (best) {
      setReps(String(best.reps));
      setWeight(String(best.weightKg));
    }
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
          Start a session to log sets, weight, and duration on the device.
        </Text>
        <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]} onPress={start}>
          <Text style={styles.primaryBtnText}>Start workout</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.banner, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.timer, { color: c.text }]}>{elapsedMin} min</Text>
        <Pressable onPress={end} style={[styles.endBtn, { borderColor: c.danger }]}>
          <Text style={{ color: c.danger, fontWeight: '600' }}>End</Text>
        </Pressable>
      </View>

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
                <Pressable onPress={() => pickExercise(item)} style={styles.pickRow}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  headline: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  muted: { textAlign: 'center', fontSize: 15 },
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
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
});
