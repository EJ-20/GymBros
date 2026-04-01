import { bestSetFromHistory, isPrCandidate } from '@gymbros/shared';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { openWorkoutDeepLink } from '@/src/watch/WatchBridge';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  formatWeightFromKgForInput,
  parseWeightInputToKg,
  weightUnitLabel,
} from '@/src/lib/weightUnits';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  const { localDataVersion } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const prevUnitRef = useRef(unit);
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
  const [weight, setWeight] = useState('');
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

  useFocusEffect(useCallback(() => refresh(), [refresh, localDataVersion]));

  useEffect(() => {
    if (prevUnitRef.current === unit) return;
    const prev = prevUnitRef.current;
    prevUnitRef.current = unit;
    setWeight((w) => {
      if (w.trim() === '') return unit === 'kg' ? '20' : '45';
      const kg = parseWeightInputToKg(w, prev);
      if (kg == null) return w;
      return formatWeightFromKgForInput(kg, unit);
    });
  }, [unit]);

  const prefillFromHistory = (exerciseId: string, sessionIdForPrior: string) => {
    const prior = repo.listSetsForExerciseBeforeSession(exerciseId, sessionIdForPrior);
    const best = bestSetFromHistory(prior);
    if (best) {
      setReps(String(best.reps));
      setWeight(formatWeightFromKgForInput(best.weightKg, unit));
    } else {
      setWeight(unit === 'kg' ? '20' : '45');
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
      showAlert('Workout in progress', 'End your current session first.');
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
      showAlert('Nothing to save', 'Log at least one set first.');
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
    showAlert('Saved', 'Open Routines in the header or Workout tab to edit it.');
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
      showAlert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const r = parseInt(reps, 10);
    const wKg = parseWeightInputToKg(weight, unit);
    if (!Number.isFinite(r) || r < 0 || wKg === null) {
      showAlert(
        'Invalid numbers',
        `Enter reps (0 or more) and weight in ${weightUnitLabel(unit)} (0 for bodyweight).`
      );
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const best = bestSetFromHistory(prior);
    const newSet = repo.addSet(session.id, selectedExerciseId, {
      reps: r,
      weightKg: wKg,
    });
    const pr = isPrCandidate(newSet, best);
    refresh();
    if (pr) showAlert('PR', 'Nice — estimated 1RM up on this exercise.');
  };

  const exerciseRows = Object.keys(setsByExercise).map((id) => ({
    exercise: repo.getExerciseById(id)!,
    sets: setsByExercise[id],
  }));

  if (!session) {
    return (
      <View style={[styles.idleRoot, { backgroundColor: c.background }]}>
        <ScrollView
          contentContainerStyle={styles.idleScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.idleKicker, { color: c.textMuted }]}>Workout</Text>
          <Text style={[styles.idleTitle, { color: c.text }]}>No session yet</Text>
          <Text style={[styles.idleSub, { color: c.textMuted }]}>
            Start fresh, load a saved routine, or build lists under Routines.
          </Text>

          <View style={[styles.idleHero, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={[styles.idleHeroAccent, { backgroundColor: c.tint }]} />
            <View style={styles.idleHeroInner}>
              <Pressable
                style={[styles.idlePrimary, { backgroundColor: c.tint }]}
                onPress={start}
              >
                <Ionicons name="barbell-outline" size={22} color={c.onTintLight} />
                <Text style={[styles.idlePrimaryText, { color: c.onTintLight }]}>Start workout</Text>
              </Pressable>
              <Pressable
                style={[styles.idleSecondary, { borderColor: c.tint, backgroundColor: c.background }]}
                onPress={() => setPickRoutineOpen(true)}
              >
                <Ionicons name="list-outline" size={20} color={c.tint} />
                <Text style={{ color: c.tint, fontWeight: '700', fontSize: 16 }}>Start from routine</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/routines')}
                style={styles.idleLinkRow}
              >
                <Ionicons name="create-outline" size={18} color={c.textMuted} />
                <Text style={{ color: c.tint, fontWeight: '600', marginLeft: 6 }}>Manage routines</Text>
                <Ionicons name="chevron-forward" size={16} color={c.tint} style={{ marginLeft: 2 }} />
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <Modal visible={pickRoutineOpen} animationType="slide" transparent>
          <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
            <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="albums-outline" size={22} color={c.tint} />
                <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                  Pick a routine
                </Text>
              </View>
              <FlatList
                data={templates}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: '65%' }}
                ListEmptyComponent={
                  <Text style={{ color: c.textMuted, marginBottom: 12, lineHeight: 20 }}>
                    No routines yet. Create one under Manage routines.
                  </Text>
                }
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => startFromTemplate(item)}
                    style={[styles.pickRow, { borderBottomColor: c.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
                      <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>
                        {item.exerciseIds.length} exercise{item.exerciseIds.length === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={c.textMuted} />
                  </Pressable>
                )}
              />
              <Pressable
                onPress={() => setPickRoutineOpen(false)}
                style={[styles.modalCancelBtn, { backgroundColor: c.background }]}
              >
                <Text style={{ color: c.text, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={[styles.bannerWrap, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <View style={[styles.bannerAccent, { backgroundColor: c.tint }]} />
        <View style={styles.bannerInner}>
          <View style={styles.bannerLeft}>
            <View style={styles.bannerLiveRow}>
              <View style={[styles.liveDot, { backgroundColor: c.tint }]} />
              <Text style={[styles.bannerLabel, { color: c.tint }]}>Live session</Text>
            </View>
            <View style={styles.timerRow}>
              <Text style={[styles.timerValue, { color: c.text }]}>{elapsedMin}</Text>
              <Text style={[styles.timerUnit, { color: c.textMuted }]}>min</Text>
            </View>
            <Pressable onPress={openSaveRoutine} hitSlop={8} style={styles.saveRoutineRow}>
              <Ionicons name="bookmark-outline" size={16} color={c.tint} />
              <Text style={{ color: c.tint, fontSize: 14, fontWeight: '600', marginLeft: 6 }}>
                Save as routine
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={end}
            style={[styles.endBtn, { borderColor: c.danger, backgroundColor: c.background }]}
          >
            <Ionicons name="stop-circle" size={22} color={c.danger} />
            <Text style={{ color: c.danger, fontWeight: '700', fontSize: 15, marginLeft: 6 }}>End</Text>
          </Pressable>
        </View>
      </View>

      {routineExerciseIds && routineExerciseIds.length > 0 ? (
        <View style={[styles.routineStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
          <View style={styles.routineTitleRow}>
            <Ionicons name="git-branch-outline" size={16} color={c.textMuted} />
            <Text style={[styles.routineLabel, { color: c.textMuted }]}>Routine</Text>
          </View>
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
                      backgroundColor: active ? c.tint : c.background,
                      borderColor: active ? c.tint : c.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? c.onTintLight : c.text,
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
        style={[styles.exercisePickCard, { backgroundColor: c.card, borderColor: c.border }]}
        onPress={() => setPickerOpen(true)}
      >
        <View style={[styles.exercisePickIcon, { backgroundColor: c.background }]}>
          <Ionicons name="barbell-outline" size={22} color={c.tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.exercisePickKicker, { color: c.textMuted }]}>Current exercise</Text>
          <Text style={[styles.exercisePickName, { color: c.text }]} numberOfLines={1}>
            {selectedExerciseId
              ? repo.getExerciseById(selectedExerciseId)?.name ?? 'Exercise'
              : 'Tap to select'}
          </Text>
          {selectedExerciseId ? (
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {repo.getExerciseById(selectedExerciseId)?.muscleGroup ?? ''}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={22} color={c.textMuted} />
      </Pressable>

      <View style={[styles.logPanel, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.logPanelTitle, { color: c.textMuted }]}>Log set</Text>
        <View style={styles.inputRow}>
          <View style={styles.inputCol}>
            <Text style={[styles.inputLabel, { color: c.textMuted }]}>Reps</Text>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              keyboardType="number-pad"
              value={reps}
              onChangeText={setReps}
              placeholder="0"
              placeholderTextColor={c.textMuted}
            />
          </View>
          <View style={styles.inputCol}>
            <Text style={[styles.inputLabel, { color: c.textMuted }]}>
              Weight ({weightUnitLabel(unit)})
            </Text>
            <TextInput
              style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.background }]}
              keyboardType="decimal-pad"
              value={weight}
              onChangeText={setWeight}
              placeholder="0"
              placeholderTextColor={c.textMuted}
            />
          </View>
          <View style={styles.addBtnCol}>
            <Text style={[styles.inputLabel, { color: 'transparent' }]}> </Text>
            <Pressable style={[styles.addSetBtn, { backgroundColor: c.tint }]} onPress={addSet}>
              <Ionicons name="add-circle-outline" size={22} color={c.onTintLight} />
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <Text style={[styles.sessionLogHeader, { color: c.textMuted }]}>This session</Text>
      <FlatList
        data={exerciseRows}
        keyExtractor={(item) => item.exercise.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <View style={[styles.sessionCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.sessionCardHead}>
              <Ionicons name="barbell-outline" size={18} color={c.tint} style={{ marginRight: 8 }} />
              <Text style={[styles.exName, { color: c.text, flex: 1 }]} numberOfLines={1}>
                {item.exercise.name}
              </Text>
              <Text style={{ color: c.textMuted, fontSize: 12, textTransform: 'capitalize' }}>
                {String(item.exercise.muscleGroup).replace(/_/g, ' ')}
              </Text>
            </View>
            <View style={[styles.setDivider, { backgroundColor: c.border }]} />
            {item.sets.map((s) => (
              <View key={s.id} style={styles.setRow}>
                <View style={[styles.setBadge, { backgroundColor: c.background }]}>
                  <Text style={{ color: c.tint, fontWeight: '800', fontSize: 12 }}>{s.orderIndex + 1}</Text>
                </View>
                <Text style={{ color: c.text, fontWeight: '600', flex: 1 }}>
                  {s.reps} ×{' '}
                  {s.weightKg != null
                    ? `${formatWeightFromKgForInput(s.weightKg, unit)} ${weightUnitLabel(unit)}`
                    : '—'}
                </Text>
                {s.rpe != null ? (
                  <Text style={{ color: c.textMuted, fontSize: 13 }}>RPE {s.rpe}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptySession}>
            <Ionicons name="layers-outline" size={40} color={c.textMuted} style={{ opacity: 0.5 }} />
            <Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 12, lineHeight: 20 }}>
              Pick an exercise and tap Add to log your first set.
            </Text>
          </View>
        }
      />

      <Modal visible={pickerOpen} animationType="slide" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="list-outline" size={22} color={c.tint} />
              <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                Exercises
              </Text>
            </View>
            <Pressable
              onPress={() => setCustomOpen(true)}
              style={[styles.customExerciseBtn, { backgroundColor: c.background, borderColor: c.tint }]}
            >
              <Ionicons name="add-circle-outline" size={20} color={c.tint} />
              <Text style={{ color: c.tint, fontWeight: '700', marginLeft: 8 }}>Custom exercise</Text>
            </Pressable>
            <FlatList
              data={exercises}
              keyExtractor={(e) => e.id}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => pickExercise(item)}
                  style={[styles.pickRow, { borderBottomColor: c.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{item.name}</Text>
                    <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' }}>
                      {String(item.muscleGroup).replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                </Pressable>
              )}
            />
            <Pressable
              onPress={() => setPickerOpen(false)}
              style={[styles.modalCancelBtn, { backgroundColor: c.background }]}
            >
              <Text style={{ color: c.text, fontWeight: '600' }}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={customOpen} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="create-outline" size={22} color={c.tint} />
              <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                New exercise
              </Text>
            </View>
            <TextInput
              value={customName}
              onChangeText={setCustomName}
              placeholder="Name"
              placeholderTextColor={c.textMuted}
              style={[
                styles.input,
                { color: c.text, borderColor: c.border, marginBottom: 16, backgroundColor: c.background },
              ]}
            />
            <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]} onPress={addCustom}>
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Save & select</Text>
            </Pressable>
            <Pressable onPress={() => setCustomOpen(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={endWorkoutOpen} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay, justifyContent: 'center' }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="checkmark-circle-outline" size={24} color={c.tint} />
              <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                Finish workout
              </Text>
            </View>
            <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
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
                <Text
                  style={{
                    color: endRpe === null ? c.onTintLight : c.textMuted,
                    fontWeight: '600',
                  }}
                >
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
                      color: endRpe === n ? c.onTintLight : c.text,
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
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Save & end</Text>
            </Pressable>
            <Pressable onPress={() => setEndWorkoutOpen(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={saveRoutineOpen} animationType="fade" transparent>
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay, justifyContent: 'center' }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border }]}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="bookmark-outline" size={22} color={c.tint} />
              <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                Save as routine
              </Text>
            </View>
            <Text style={{ color: c.textMuted, fontSize: 14, marginBottom: 12, lineHeight: 20 }}>
              Uses exercise order from your first logged set per movement.
            </Text>
            <TextInput
              value={saveRoutineName}
              onChangeText={setSaveRoutineName}
              placeholder="Routine name"
              placeholderTextColor={c.textMuted}
              style={[
                styles.input,
                { color: c.text, borderColor: c.border, marginBottom: 16, backgroundColor: c.background },
              ]}
            />
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: c.tint }]}
              onPress={confirmSaveRoutine}
            >
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setSaveRoutineOpen(false)} style={{ marginTop: 12, alignItems: 'center' }}>
              <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  idleRoot: { flex: 1 },
  idleScroll: { padding: 24, paddingBottom: 40 },
  idleKicker: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  idleTitle: { fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  idleSub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  idleHero: {
    marginTop: 24,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  idleHeroAccent: { width: 4 },
  idleHeroInner: { flex: 1, padding: 18, gap: 12 },
  idlePrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 12,
  },
  idlePrimaryText: { fontWeight: '800', fontSize: 17 },
  idleSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
  },
  idleLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingVertical: 8,
  },

  bannerWrap: { flexDirection: 'row', borderBottomWidth: 1 },
  bannerAccent: { width: 4 },
  bannerInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  bannerLeft: { flex: 1, minWidth: 0 },
  bannerLiveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  bannerLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  timerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  timerValue: { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  timerUnit: { fontSize: 16, fontWeight: '600' },
  saveRoutineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },

  routineStrip: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  routineTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  routineLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1,
    maxWidth: 168,
  },

  exercisePickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  exercisePickIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercisePickKicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  exercisePickName: { fontSize: 17, fontWeight: '700', marginTop: 2 },

  logPanel: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  logPanelTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  inputCol: { flex: 1, minWidth: 0 },
  inputLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 17,
    fontWeight: '600',
  },
  addBtnCol: { justifyContent: 'flex-end' },
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: { fontWeight: '800', fontSize: 16 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },

  sessionLogHeader: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 20,
    marginTop: 20,
  },
  sessionCard: { borderRadius: 14, padding: 14, borderWidth: 1 },
  sessionCardHead: { flexDirection: 'row', alignItems: 'center' },
  exName: { fontWeight: '700', fontSize: 17 },
  setDivider: { height: StyleSheet.hairlineWidth, marginVertical: 10 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  setBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySession: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24 },

  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  modalCard: {
    maxHeight: '72%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  customExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  saveCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
  rpeRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  rpeChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
