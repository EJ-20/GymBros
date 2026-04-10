import {
  bestBodyweightRepsFromHistory,
  bestDistanceMFromHistory,
  bestDurationSecFromHistory,
  bestSetFromHistory,
  isBodyweightRepsPrCandidate,
  isDistancePrCandidate,
  isDurationPrCandidate,
  isPrCandidate,
} from '@gymbros/shared';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useToast } from '@/src/contexts/ToastContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { useColors } from '@/src/hooks/useColors';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import * as repo from '@/src/db/workoutRepo';
import { deleteSetLogFromCloud } from '@/src/sync/syncEngine';
import { openWorkoutDeepLink } from '@/src/watch/WatchBridge';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  formatWeightFromKgForInput,
  parseWeightInputToKg,
  weightUnitLabel,
  type WeightUnit,
} from '@/src/lib/weightUnits';
import {
  distanceFieldLabel,
  formatDuration,
  formatSetSummary,
  parseDistanceInputToMeters,
  formatDistanceInputFromMeters,
} from '@/src/lib/setDisplay';
import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from 'react';
import {
  AppState,
  type AppStateStatus,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type {
  Exercise,
  ExerciseTrackingMode,
  SetLog,
  WorkoutSession,
  WorkoutTemplate,
} from '@gymbros/shared';

/** Built-in preset names — shown first on the idle Workout screen when present. */
const PRESET_ROUTINE_NAMES = ['Push day', 'Pull day', 'Leg day', 'Full body'] as const;

const MUSCLE_GROUPS: Exercise['muscleGroup'][] = [
  'chest',
  'back',
  'shoulders',
  'arms',
  'legs',
  'core',
  'cardio',
  'full_body',
];

const TRACKING_OPTIONS: { mode: ExerciseTrackingMode; label: string; hint: string }[] = [
  { mode: 'weight_reps', label: 'Weight + reps', hint: 'Barbell, dumbbell, machines' },
  { mode: 'bodyweight_reps', label: 'Bodyweight reps', hint: 'Pull-ups, push-ups' },
  { mode: 'time', label: 'Time', hint: 'Plank, wall sit' },
  { mode: 'time_distance', label: 'Time + distance', hint: 'Run, bike, rower' },
];

function setDeleteSummary(s: SetLog, unit: WeightUnit): string {
  const ex = repo.getExerciseById(s.exerciseId);
  return formatSetSummary(ex, s, unit);
}

function formatWorkoutElapsed(startedAtIso: string, nowMs: number): string {
  const t0 = new Date(startedAtIso).getTime();
  let sec = Math.floor((nowMs - t0) / 1000);
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function WorkoutScreen() {
  const c = useColors();
  const { localDataVersion, user, backendReady } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const showToast = useToast();
  const prevUnitRef = useRef(unit);
  const repsInputRef = useRef<ElementRef<typeof TextInput>>(null);
  const weightInputRef = useRef<ElementRef<typeof TextInput>>(null);
  const router = useRouter();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [setsByExercise, setSetsByExercise] = useState<Record<string, SetLog[]>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [saveRoutineOpen, setSaveRoutineOpen] = useState(false);
  const [saveRoutineName, setSaveRoutineName] = useState('');
  const [endWorkoutOpen, setEndWorkoutOpen] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [endRpe, setEndRpe] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [distanceInput, setDistanceInput] = useState('');
  const [swRunning, setSwRunning] = useState(false);
  const [swStartMs, setSwStartMs] = useState<number | null>(null);
  const [swStoppedSec, setSwStoppedSec] = useState<number | null>(null);
  const [swTick, setSwTick] = useState(0);
  const [customMuscle, setCustomMuscle] = useState<Exercise['muscleGroup']>('full_body');
  const [customTracking, setCustomTracking] = useState<ExerciseTrackingMode>('weight_reps');
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  /** When set, shows chips to jump through a saved routine (in-memory for this session). */
  const [routineExerciseIds, setRoutineExerciseIds] = useState<string[] | null>(null);
  const [elapsedNowMs, setElapsedNowMs] = useState(() => Date.now());
  const exercises = repo.listExercises();
  const sortedIdleTemplates = useMemo(() => {
    const list = repo.listTemplates();
    const presetSet = new Set<string>([...PRESET_ROUTINE_NAMES]);
    const byName = new Map(list.map((t) => [t.name, t]));
    const ordered: WorkoutTemplate[] = [];
    for (const n of PRESET_ROUTINE_NAMES) {
      const t = byName.get(n);
      if (t) ordered.push(t);
    }
    for (const t of list) {
      if (!presetSet.has(t.name)) ordered.push(t);
    }
    return ordered;
  }, [localDataVersion]);

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
      if (w.trim() === '') return '';
      const kg = parseWeightInputToKg(w, prev);
      if (kg == null) return w;
      return formatWeightFromKgForInput(kg, unit);
    });
  }, [unit]);

  const resetStopwatch = useCallback(() => {
    setSwRunning(false);
    setSwStartMs(null);
    setSwStoppedSec(null);
  }, []);

  const prefillFromHistory = (_exerciseId: string, _sessionIdForPrior: string) => {
    setReps('');
    setWeight('');
    setDurationInput('');
    setDistanceInput('');
    resetStopwatch();
  };

  useEffect(() => {
    setReps('');
    setWeight('');
    setDurationInput('');
    setDistanceInput('');
    resetStopwatch();
  }, [selectedExerciseId, resetStopwatch]);

  useEffect(() => {
    if (!swRunning || swStartMs == null) return;
    const id = setInterval(() => setSwTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [swRunning, swStartMs]);

  useEffect(() => {
    if (!session) return;
    setElapsedNowMs(Date.now());
    const id = setInterval(() => setElapsedNowMs(Date.now()), 1000);
    const onAppState = (s: AppStateStatus) => {
      if (s === 'active') setElapsedNowMs(Date.now());
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [session?.id]);

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

  type Pref =
    | { mode: 'weight_reps'; reps: number | null; weightKg: number | null }
    | { mode: 'bodyweight_reps'; reps: number | null }
    | { mode: 'time'; durationSec: number | null }
    | { mode: 'time_distance'; durationSec: number | null; distanceM: number | null };

  /** Last set in session, else best prior completed sets for this exercise. */
  const previousReference = useMemo((): Pref | null => {
    if (!session || !selectedExerciseId) return null;
    const ex = repo.getExerciseById(selectedExerciseId);
    const mode = ex?.trackingMode ?? 'weight_reps';
    const cur = setsByExercise[selectedExerciseId];
    if (cur?.length) {
      const last = cur[cur.length - 1]!;
      switch (mode) {
        case 'time':
          return { mode: 'time', durationSec: last.durationSec };
        case 'time_distance':
          return {
            mode: 'time_distance',
            durationSec: last.durationSec,
            distanceM: last.distanceM,
          };
        case 'bodyweight_reps':
          return { mode: 'bodyweight_reps', reps: last.reps };
        default:
          return { mode: 'weight_reps', reps: last.reps, weightKg: last.weightKg };
      }
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    switch (mode) {
      case 'time': {
        const b = bestDurationSecFromHistory(prior);
        return { mode: 'time', durationSec: b };
      }
      case 'time_distance': {
        return {
          mode: 'time_distance',
          durationSec: bestDurationSecFromHistory(prior),
          distanceM: bestDistanceMFromHistory(prior),
        };
      }
      case 'bodyweight_reps': {
        const b = bestBodyweightRepsFromHistory(prior);
        return { mode: 'bodyweight_reps', reps: b };
      }
      default: {
        const best = bestSetFromHistory(
          prior.map((p) => ({ weightKg: p.weightKg, reps: p.reps }))
        );
        return best
          ? { mode: 'weight_reps', reps: best.reps, weightKg: best.weightKg }
          : { mode: 'weight_reps', reps: null, weightKg: null };
      }
    }
  }, [session, selectedExerciseId, setsByExercise]);

  const repsPlaceholder =
    previousReference?.mode === 'bodyweight_reps' || previousReference?.mode === 'weight_reps'
      ? String(previousReference.reps ?? 0)
      : '0';
  const weightPlaceholder =
    previousReference?.mode === 'weight_reps' && previousReference.weightKg != null
      ? formatWeightFromKgForInput(previousReference.weightKg, unit)
      : unit === 'kg'
        ? '20'
        : '45';
  const durationPlaceholder =
    previousReference?.mode === 'time' || previousReference?.mode === 'time_distance'
      ? String(previousReference.durationSec ?? 60)
      : '60';
  const distancePlaceholder =
    previousReference?.mode === 'time_distance' && previousReference.distanceM != null
      ? formatDistanceInputFromMeters(previousReference.distanceM, unit)
      : unit === 'lbs'
        ? '1'
        : '1';

  void swTick;
  const stopwatchDisplaySec =
    swRunning && swStartMs != null
      ? Math.floor((Date.now() - swStartMs) / 1000)
      : (swStoppedSec ?? 0);

  const selectedExercise = selectedExerciseId ? repo.getExerciseById(selectedExerciseId) : null;
  const trackingMode = selectedExercise?.trackingMode ?? 'weight_reps';

  const start = () => {
    setRoutineExerciseIds(null);
    const s = repo.startSession('phone');
    setSession(s);
    openWorkoutDeepLink('active');
    refresh();
  };

  const startFromTemplate = (t: WorkoutTemplate) => {
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
    const ex = repo.createExercise(name, customMuscle, { trackingMode: customTracking });
    setCustomName('');
    setCustomOpen(false);
    pickExercise(ex);
    refresh();
  };

  const commitSetFromStrings = (rStr: string, wStr: string) => {
    if (!session || !selectedExerciseId) {
      showAlert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const r = parseInt(rStr, 10);
    const wKg = parseWeightInputToKg(wStr, unit);
    if (!Number.isFinite(r) || r < 0 || wKg === null) {
      showAlert(
        'Invalid numbers',
        `Enter reps (0 or more) and weight in ${weightUnitLabel(unit)} (0 for bodyweight).`
      );
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const best = bestSetFromHistory(
      prior.map((p) => ({ weightKg: p.weightKg, reps: p.reps }))
    );
    const newSet = repo.addSet(session.id, selectedExerciseId, {
      reps: r,
      weightKg: wKg,
    });
    const pr = isPrCandidate(newSet, best);
    refresh();
    if (pr) showToast('PR — estimated 1RM up on this exercise');
    setReps('');
    setWeight('');
    Keyboard.dismiss();
    requestAnimationFrame(() => repsInputRef.current?.focus());
  };

  const addSet = () => {
    const rResolved = reps.trim() === '' ? repsPlaceholder : reps.trim();
    const wResolved = weight.trim() === '' ? weightPlaceholder : weight.trim();
    setReps(rResolved);
    setWeight(wResolved);
    commitSetFromStrings(rResolved, wResolved);
  };

  const commitTimeSet = () => {
    if (!session || !selectedExerciseId) {
      showAlert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const resolved = durationInput.trim() === '' ? durationPlaceholder : durationInput.trim();
    const sec = parseInt(resolved, 10);
    if (!Number.isFinite(sec) || sec < 0) {
      showAlert('Invalid duration', 'Enter seconds (whole numbers, 0 or more).');
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const bestDur = bestDurationSecFromHistory(prior);
    repo.addSet(session.id, selectedExerciseId, {
      durationSec: sec,
      reps: null,
      weightKg: null,
      distanceM: null,
    });
    refresh();
    if (isDurationPrCandidate(sec, bestDur)) showToast('Best time on this exercise so far');
    setDurationInput('');
    resetStopwatch();
    Keyboard.dismiss();
  };

  const commitTimeDistanceSet = () => {
    if (!session || !selectedExerciseId) {
      showAlert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const resolved = durationInput.trim() === '' ? durationPlaceholder : durationInput.trim();
    const sec = parseInt(resolved, 10);
    if (!Number.isFinite(sec) || sec < 0) {
      showAlert('Invalid duration', 'Enter duration in seconds (0 or more).');
      return;
    }
    const dStr = distanceInput.trim() === '' ? distancePlaceholder : distanceInput.trim();
    const distM = parseDistanceInputToMeters(dStr, unit);
    if (distM === null) {
      showAlert(
        'Invalid distance',
        `Enter distance in ${unit === 'lbs' ? 'miles' : 'kilometers'} using a number.`
      );
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const bestDist = bestDistanceMFromHistory(prior);
    const bestDur = bestDurationSecFromHistory(prior);
    repo.addSet(session.id, selectedExerciseId, {
      durationSec: sec,
      distanceM: distM,
      reps: null,
      weightKg: null,
    });
    refresh();
    if (isDistancePrCandidate(distM, bestDist)) showToast('New best distance');
    else if (isDurationPrCandidate(sec, bestDur)) showToast('Longest duration logged');
    setDurationInput('');
    setDistanceInput('');
    resetStopwatch();
    Keyboard.dismiss();
  };

  const commitBodyweightSet = (repsOverride?: string) => {
    if (!session || !selectedExerciseId) {
      showAlert('Pick an exercise', 'Choose an exercise before adding a set.');
      return;
    }
    const raw = repsOverride ?? reps;
    const rResolved = raw.trim() === '' ? repsPlaceholder : raw.trim();
    const r = parseInt(rResolved, 10);
    if (!Number.isFinite(r) || r < 0) {
      showAlert('Invalid reps', 'Enter reps (0 or more).');
      return;
    }
    const prior = repo.listSetsForExerciseBeforeSession(selectedExerciseId, session.id);
    const best = bestBodyweightRepsFromHistory(prior);
    const newSet = repo.addSet(session.id, selectedExerciseId, {
      reps: r,
      weightKg: null,
    });
    const pr = isBodyweightRepsPrCandidate(r, best);
    refresh();
    if (pr) showToast('PR — more reps on this exercise');
    setReps('');
    Keyboard.dismiss();
    requestAnimationFrame(() => repsInputRef.current?.focus());
  };

  const onAddPress = () => {
    switch (trackingMode) {
      case 'time':
        commitTimeSet();
        break;
      case 'time_distance':
        commitTimeDistanceSet();
        break;
      case 'bodyweight_reps':
        commitBodyweightSet();
        break;
      default:
        addSet();
    }
  };

  const onRepsSubmitEditing = () => {
    if (trackingMode === 'bodyweight_reps') {
      const rResolved = reps.trim() === '' ? repsPlaceholder : reps.trim();
      setReps(rResolved);
      Keyboard.dismiss();
      commitBodyweightSet(rResolved);
      return;
    }
    setReps((r) => (r.trim() === '' ? repsPlaceholder : r.trim()));
    weightInputRef.current?.focus();
  };

  const onWeightSubmitEditing = () => {
    const rResolved = reps.trim() === '' ? repsPlaceholder : reps.trim();
    const wResolved = weight.trim() === '' ? weightPlaceholder : weight.trim();
    setReps(rResolved);
    setWeight(wResolved);
    Keyboard.dismiss();
    commitSetFromStrings(rResolved, wResolved);
  };

  const confirmDeleteSet = (s: SetLog) => {
    showAlert('Remove set?', `Delete ${setDeleteSummary(s, unit)} from this session?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const localId = s.id;
          if (!repo.deleteSetFromActiveSession(localId)) return;
          if (user && backendReady) {
            const { error, attempted } = await deleteSetLogFromCloud(localId);
            if (error && attempted) {
              showAlert(
                'Cloud delete',
                `${friendlyBackendError(error)}\n\nThe set was removed on this device.`
              );
            }
          }
          refresh();
        },
      },
    ]);
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
          <View style={styles.idleHeaderRow}>
            <View style={styles.idleHeaderText}>
              <Text style={[styles.idleTitle, { color: c.text }]}>No session yet</Text>
              <Text style={[styles.idleSub, { color: c.textMuted }]}>
                Tap + for an empty session, or tap a routine to load exercises.
              </Text>
            </View>
            <Pressable
              onPress={start}
              accessibilityLabel="Start empty workout"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.idleStartFab,
                {
                  backgroundColor: c.tint,
                  shadowColor: c.text,
                },
                pressed ? styles.idleStartFabPressed : null,
              ]}
            >
              <Ionicons name="add" size={28} color={c.onTintLight} />
            </Pressable>
          </View>

          <Text style={[styles.idleSectionLabel, { color: c.textMuted }]}>Routines</Text>
          {sortedIdleTemplates.length > 0 ? (
            <View style={styles.idleRoutineGrid}>
              {sortedIdleTemplates.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => startFromTemplate(item)}
                  style={({ pressed }) => [
                    styles.idleRoutineTile,
                    {
                      backgroundColor: c.card,
                      borderColor: c.border,
                      opacity: pressed ? 0.92 : 1,
                    },
                  ]}
                >
                  <View style={[styles.idleRoutineIcon, { backgroundColor: c.background }]}>
                    <Ionicons name="list-outline" size={20} color={c.tint} />
                  </View>
                  <Text style={[styles.idleRoutineName, { color: c.text }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={[styles.idleRoutineMeta, { color: c.textMuted }]}>
                    {item.exerciseIds.length} exercise{item.exerciseIds.length === 1 ? '' : 's'}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={[styles.idleEmptyRoutines, { color: c.textMuted }]}>
              No routines yet. Create one under Manage routines.
            </Text>
          )}

          <Pressable onPress={() => router.push('/routines')} style={styles.idleLinkRow}>
            <Ionicons name="create-outline" size={18} color={c.textMuted} />
            <Text style={{ color: c.tint, fontWeight: '600', marginLeft: 6 }}>Manage routines</Text>
            <Ionicons name="chevron-forward" size={16} color={c.tint} style={{ marginLeft: 2 }} />
          </Pressable>
        </ScrollView>
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
              <Text
                style={[styles.timerValue, { color: c.text }]}
                selectable={false}
                maxFontSizeMultiplier={1.4}
              >
                {formatWorkoutElapsed(session.startedAt, elapsedNowMs)}
              </Text>
              <Text style={[styles.timerUnit, { color: c.textMuted }]}>elapsed</Text>
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
          {selectedExercise ? (
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
              {String(selectedExercise.muscleGroup).replace(/_/g, ' ')} ·{' '}
              {TRACKING_OPTIONS.find((o) => o.mode === selectedExercise.trackingMode)?.label ??
                'Weight + reps'}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-down" size={22} color={c.textMuted} />
      </Pressable>

      <View style={[styles.logPanel, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.logPanelTitle, { color: c.textMuted }]}>Log set</Text>

        {trackingMode === 'time' || trackingMode === 'time_distance' ? (
          <View style={styles.stopwatchBlock}>
            <Text style={[styles.stopwatchDigits, { color: c.text }]}>
              {formatDuration(stopwatchDisplaySec)}
            </Text>
            <Text style={[styles.stopwatchHint, { color: c.textMuted }]}>
              Stopwatch — Stop copies time into the field below
            </Text>
            <View style={styles.stopwatchBtns}>
              <Pressable
                onPress={() => {
                  setSwRunning(true);
                  setSwStartMs(Date.now());
                  setSwStoppedSec(null);
                  setSwTick((t) => t + 1);
                }}
                style={[styles.swBtn, { backgroundColor: c.tint }]}
              >
                <Text style={[styles.swBtnText, { color: c.onTintLight }]}>Start</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!swRunning || swStartMs == null) return;
                  const sec = Math.floor((Date.now() - swStartMs) / 1000);
                  setSwRunning(false);
                  setSwStartMs(null);
                  setSwStoppedSec(sec);
                  setDurationInput(String(sec));
                }}
                style={[styles.swBtn, { backgroundColor: c.background, borderWidth: 1, borderColor: c.border }]}
              >
                <Text style={[styles.swBtnText, { color: c.text }]}>Stop</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  resetStopwatch();
                  setDurationInput('');
                }}
                style={[styles.swBtn, { backgroundColor: c.background, borderWidth: 1, borderColor: c.border }]}
              >
                <Text style={[styles.swBtnText, { color: c.textMuted }]}>Reset</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {trackingMode === 'weight_reps' ? (
          <View style={styles.inputRow}>
            <View style={styles.inputCol}>
              <Text style={[styles.inputLabel, { color: c.textMuted }]}>Reps</Text>
              <TextInput
                ref={repsInputRef}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
                keyboardType={
                  Platform.OS === 'web' ? 'default' : Platform.OS === 'ios' ? 'number-pad' : 'numeric'
                }
                returnKeyType="next"
                blurOnSubmit={false}
                onSubmitEditing={onRepsSubmitEditing}
                value={reps}
                onChangeText={setReps}
                placeholder={repsPlaceholder}
                placeholderTextColor={c.textMuted}
              />
            </View>
            <View style={styles.inputCol}>
              <Text style={[styles.inputLabel, { color: c.textMuted }]}>
                Weight ({weightUnitLabel(unit)})
              </Text>
              <TextInput
                ref={weightInputRef}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
                keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={onWeightSubmitEditing}
                value={weight}
                onChangeText={setWeight}
                placeholder={weightPlaceholder}
                placeholderTextColor={c.textMuted}
              />
            </View>
            <View style={styles.addBtnCol}>
              <Text style={[styles.inputLabel, { color: 'transparent' }]}> </Text>
              <Pressable style={[styles.addSetBtn, { backgroundColor: c.tint }]} onPress={onAddPress}>
                <Ionicons name="add-circle-outline" size={22} color={c.onTintLight} />
                <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {trackingMode === 'bodyweight_reps' ? (
          <View style={styles.inputRow}>
            <View style={[styles.inputCol, { flex: 2 }]}>
              <Text style={[styles.inputLabel, { color: c.textMuted }]}>Reps</Text>
              <TextInput
                ref={repsInputRef}
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
                keyboardType={
                  Platform.OS === 'web' ? 'default' : Platform.OS === 'ios' ? 'number-pad' : 'numeric'
                }
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={onRepsSubmitEditing}
                value={reps}
                onChangeText={setReps}
                placeholder={repsPlaceholder}
                placeholderTextColor={c.textMuted}
              />
            </View>
            <View style={styles.addBtnCol}>
              <Text style={[styles.inputLabel, { color: 'transparent' }]}> </Text>
              <Pressable style={[styles.addSetBtn, { backgroundColor: c.tint }]} onPress={onAddPress}>
                <Ionicons name="add-circle-outline" size={22} color={c.onTintLight} />
                <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {trackingMode === 'time' ? (
          <View style={styles.inputRow}>
            <View style={[styles.inputCol, { flex: 2 }]}>
              <Text style={[styles.inputLabel, { color: c.textMuted }]}>Duration (sec)</Text>
              <TextInput
                style={[
                  styles.input,
                  { color: c.text, borderColor: c.border, backgroundColor: c.background },
                ]}
                keyboardType={
                  Platform.OS === 'web' ? 'default' : Platform.OS === 'ios' ? 'number-pad' : 'numeric'
                }
                returnKeyType="done"
                value={durationInput}
                onChangeText={setDurationInput}
                placeholder={durationPlaceholder}
                placeholderTextColor={c.textMuted}
              />
            </View>
            <View style={styles.addBtnCol}>
              <Text style={[styles.inputLabel, { color: 'transparent' }]}> </Text>
              <Pressable style={[styles.addSetBtn, { backgroundColor: c.tint }]} onPress={onAddPress}>
                <Ionicons name="add-circle-outline" size={22} color={c.onTintLight} />
                <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {trackingMode === 'time_distance' ? (
          <View style={styles.timeDistanceCol}>
            <View style={styles.inputRow}>
              <View style={styles.inputCol}>
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>Duration (sec)</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: c.text, borderColor: c.border, backgroundColor: c.background },
                  ]}
                  keyboardType={
                    Platform.OS === 'web' ? 'default' : Platform.OS === 'ios' ? 'number-pad' : 'numeric'
                  }
                  returnKeyType="next"
                  value={durationInput}
                  onChangeText={setDurationInput}
                  placeholder={durationPlaceholder}
                  placeholderTextColor={c.textMuted}
                />
              </View>
              <View style={styles.inputCol}>
                <Text style={[styles.inputLabel, { color: c.textMuted }]}>
                  {distanceFieldLabel(unit)}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: c.text, borderColor: c.border, backgroundColor: c.background },
                  ]}
                  keyboardType={Platform.OS === 'web' ? 'default' : 'decimal-pad'}
                  returnKeyType="done"
                  value={distanceInput}
                  onChangeText={setDistanceInput}
                  placeholder={distancePlaceholder}
                  placeholderTextColor={c.textMuted}
                />
              </View>
            </View>
            <Pressable
              style={[styles.addSetBtn, { backgroundColor: c.tint, alignSelf: 'flex-start', marginTop: 10 }]}
              onPress={onAddPress}
            >
              <Ionicons name="add-circle-outline" size={22} color={c.onTintLight} />
              <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>Add set</Text>
            </Pressable>
          </View>
        ) : null}
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
                  {formatSetSummary(item.exercise, s, unit)}
                </Text>
                {s.rpe != null ? (
                  <Text style={{ color: c.textMuted, fontSize: 13, marginRight: 4 }}>RPE {s.rpe}</Text>
                ) : null}
                <Pressable
                  onPress={() => confirmDeleteSet(s)}
                  hitSlop={10}
                  accessibilityLabel="Remove set"
                  style={[styles.setDeleteBtn, { borderColor: c.danger, backgroundColor: c.background }]}
                >
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
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
              onPress={() => {
                setCustomMuscle('full_body');
                setCustomTracking('weight_reps');
                setCustomOpen(true);
              }}
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
                      {String(item.muscleGroup).replace(/_/g, ' ')} ·{' '}
                      {TRACKING_OPTIONS.find((o) => o.mode === item.trackingMode)?.label ?? 'Weight + reps'}
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
        <View style={[styles.modalBackdrop, { backgroundColor: c.overlay, justifyContent: 'center' }]}>
          <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border, maxHeight: '88%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="create-outline" size={22} color={c.tint} />
                <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                  New exercise
                </Text>
              </View>
              <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 10 }}>Log type</Text>
              <View style={styles.optionChipWrap}>
                {TRACKING_OPTIONS.map((opt) => {
                  const on = customTracking === opt.mode;
                  return (
                    <Pressable
                      key={opt.mode}
                      onPress={() => setCustomTracking(opt.mode)}
                      style={[
                        styles.optionChip,
                        {
                          borderColor: on ? c.tint : c.border,
                          backgroundColor: on ? c.tint : c.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: on ? c.onTintLight : c.text,
                          fontWeight: on ? '800' : '600',
                          fontSize: 13,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text
                        style={{
                          color: on ? c.onTintLight : c.textMuted,
                          fontSize: 11,
                          marginTop: 2,
                          opacity: 0.9,
                        }}
                      >
                        {opt.hint}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 14, marginBottom: 8 }}>
                Muscle group
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.muscleChipRow}
              >
                {MUSCLE_GROUPS.map((mg) => {
                  const on = customMuscle === mg;
                  return (
                    <Pressable
                      key={mg}
                      onPress={() => setCustomMuscle(mg)}
                      style={[
                        styles.muscleChip,
                        {
                          borderColor: on ? c.tint : c.border,
                          backgroundColor: on ? c.tint : c.background,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: on ? c.onTintLight : c.text,
                          fontWeight: on ? '700' : '500',
                          fontSize: 13,
                          textTransform: 'capitalize',
                        }}
                      >
                        {String(mg).replace(/_/g, ' ')}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 14, marginBottom: 8 }}>Name</Text>
              <TextInput
                value={customName}
                onChangeText={setCustomName}
                placeholder="Exercise name"
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
            </ScrollView>
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
  /** Match History tab header: horizontal 20, top 8 */
  idleScroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  idleKicker: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  idleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 4,
  },
  idleHeaderText: { flex: 1, minWidth: 0 },
  idleTitle: { fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  idleSub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  idleStartFab: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
  },
  idleStartFabPressed: { opacity: 0.92, transform: [{ scale: 0.97 }] },
  idleSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  idleRoutineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  idleRoutineTile: {
    width: '48%',
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  idleRoutineIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idleRoutineName: { fontWeight: '700', fontSize: 15, lineHeight: 20 },
  idleRoutineMeta: { fontSize: 12, fontWeight: '600' },
  idleEmptyRoutines: { lineHeight: 20, marginBottom: 8 },
  idleLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
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
  stopwatchBlock: { marginBottom: 14 },
  stopwatchDigits: { fontSize: 36, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  stopwatchHint: { fontSize: 12, marginTop: 6, lineHeight: 17 },
  stopwatchBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  swBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    minWidth: 72,
    alignItems: 'center',
  },
  swBtnText: { fontWeight: '700', fontSize: 14 },
  timeDistanceCol: { width: '100%' },
  optionChipWrap: { gap: 10 },
  optionChip: {
    borderWidth: 1.5,
    borderRadius: 12,
    padding: 12,
  },
  muscleChipRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  muscleChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
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
  setDeleteBtn: {
    padding: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
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
