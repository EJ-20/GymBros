import {
  KeyboardAvoidingModalBody,
  KeyboardAvoidingScreen,
} from '@/src/components/KeyboardAvoidingScreen';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import * as repo from '@/src/db/workoutRepo';
import { deleteExerciseFromCloud } from '@/src/sync/syncEngine';
import type { Exercise, ExerciseTrackingMode } from '@gymbros/shared';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

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

export default function RoutineBuilderScreen() {
  const c = useColors();
  const { localDataVersion, user, backendReady } = useAuth();
  const showAlert = useAppAlert();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState<Exercise['muscleGroup']>('full_body');
  const [customTracking, setCustomTracking] = useState<ExerciseTrackingMode>('weight_reps');
  const [editingCustomExercise, setEditingCustomExercise] = useState<Exercise | null>(null);
  const exercises = repo.listExercises();

  useEffect(() => {
    if (!id) return;
    const t = repo.getTemplate(id);
    if (t) {
      setName(t.name);
      setExerciseIds([...t.exerciseIds]);
    } else {
      showAlert(
        'Routine not found',
        'It may have been removed, or local data was cleared (for example after signing out).',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [id, router, localDataVersion, showAlert]);

  const addExercise = useCallback((ex: Exercise) => {
    setExerciseIds((prev) => [...prev, ex.id]);
    setPickerOpen(false);
  }, []);

  const openCreateCustomExercise = () => {
    setEditingCustomExercise(null);
    setCustomName('');
    setCustomMuscle('full_body');
    setCustomTracking('weight_reps');
    setPickerOpen(false);
    InteractionManager.runAfterInteractions(() => {
      setCustomOpen(true);
    });
  };

  const openEditCustomExercise = (ex: Exercise) => {
    setEditingCustomExercise(ex);
    setCustomName(ex.name);
    setCustomMuscle(ex.muscleGroup);
    setCustomTracking(ex.trackingMode);
    setPickerOpen(false);
    InteractionManager.runAfterInteractions(() => {
      setCustomOpen(true);
    });
  };

  const confirmDeleteCustomExercise = (ex: Exercise) => {
    const setCount = repo.countSetsForExercise(ex.id);
    const body =
      setCount > 0
        ? `Remove “${ex.name}” from your library? This deletes ${setCount} logged set${setCount === 1 ? '' : 's'} from your history on this device.`
        : `Remove “${ex.name}” from your library?`;
    showAlert('Delete exercise', body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (user && backendReady) {
            const { error, attempted } = await deleteExerciseFromCloud(ex.id);
            if (error && attempted) {
              showAlert(
                'Cloud delete',
                `${friendlyBackendError(error)}\n\nThe exercise will still be removed on this device.`
              );
            }
          }
          repo.deleteCustomExercise(ex.id);
          setExerciseIds((prev) => prev.filter((id) => id !== ex.id));
          setPickerOpen(false);
          setCustomOpen(false);
          setEditingCustomExercise(null);
        },
      },
    ]);
  };

  const saveCustomExercise = () => {
    const n = customName.trim();
    if (!n) {
      showAlert('Name required', 'Enter a name for this exercise.');
      return;
    }
    if (editingCustomExercise) {
      const ok = repo.updateCustomExercise(editingCustomExercise.id, {
        name: n,
        muscleGroup: customMuscle,
        trackingMode: customTracking,
      });
      if (!ok) {
        showAlert('Could not update', 'Only custom exercises can be edited.');
        return;
      }
      setEditingCustomExercise(null);
      setCustomName('');
      setCustomOpen(false);
      return;
    }
    const ex = repo.createExercise(n, customMuscle, { trackingMode: customTracking });
    setExerciseIds((prev) => [...prev, ex.id]);
    setCustomName('');
    setCustomOpen(false);
    setPickerOpen(false);
  };

  const removeAt = (index: number) => {
    setExerciseIds((prev) => prev.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index < 1) return;
    setExerciseIds((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      showAlert('Name required', 'Give this routine a name.');
      return;
    }
    if (exerciseIds.length === 0) {
      showAlert('Add exercises', 'Pick at least one exercise.');
      return;
    }
    if (isEdit && id) {
      repo.updateTemplate(id, n, exerciseIds);
    } else {
      repo.createTemplate(n, exerciseIds);
    }
    router.back();
  };

  const rows = exerciseIds.map((eid, index) => ({
    eid,
    index,
    exercise: repo.getExerciseById(eid),
  }));

  return (
    <>
      <Stack.Screen
        options={{
          title: isEdit ? 'Edit routine' : 'New routine',
          headerRight: () => (
            <Pressable onPress={save} hitSlop={12} style={{ marginRight: 8 }}>
              <Text style={{ color: c.tint, fontWeight: '700', fontSize: 16 }}>Save</Text>
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingScreen variant="stack" style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={[styles.label, { color: c.textMuted }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Push day A"
          placeholderTextColor={c.textMuted}
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.card }]}
        />

        <Text style={[styles.label, { color: c.textMuted, marginTop: 16 }]}>Exercises (order)</Text>
        <Pressable
          style={[styles.addBtn, { borderColor: c.tint }]}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={{ color: c.tint, fontWeight: '600' }}>+ Add exercise</Text>
        </Pressable>

        <FlatList
          style={{ flex: 1 }}
          {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
          data={rows}
          keyExtractor={(item) => `${item.eid}-${item.index}`}
          contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={[styles.rowCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>
                  {item.exercise?.name ?? 'Unknown exercise'}
                </Text>
                <Text style={{ color: c.textMuted, fontSize: 12 }}>
                  {item.exercise?.muscleGroup ?? ''}
                </Text>
              </View>
              <Pressable onPress={() => moveUp(item.index)} disabled={item.index === 0}>
                <Text style={{ color: item.index === 0 ? c.border : c.tint }}>Up</Text>
              </Pressable>
              <Pressable
                onPress={() => removeAt(item.index)}
                hitSlop={10}
                accessibilityLabel="Remove exercise from routine"
                accessibilityRole="button"
                style={[styles.deleteIconBtn, { marginLeft: 12 }]}
              >
                <Ionicons name="trash-outline" size={20} color={c.danger} />
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: c.textMuted, marginTop: 8 }}>No exercises yet.</Text>
          }
        />
      </View>
      </KeyboardAvoidingScreen>

        <Modal
          visible={pickerOpen}
          animationType="slide"
          transparent
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
        >
          <View style={[styles.modalBackdrop, { backgroundColor: c.overlay }]}>
            <View style={[styles.modalCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <FlatList
                data={exercises}
                keyExtractor={(e) => e.id}
                keyboardShouldPersistTaps="handled"
                removeClippedSubviews={false}
                style={{ maxHeight: Dimensions.get('window').height * 0.62 }}
                {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
                ListHeaderComponent={
                  <View>
                    <View style={styles.modalHeaderRow}>
                      <Ionicons name="list-outline" size={22} color={c.tint} />
                      <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                        Pick exercise
                      </Text>
                    </View>
                    <Pressable
                      onPress={openCreateCustomExercise}
                      accessibilityRole="button"
                      accessibilityLabel="Create custom exercise"
                      style={[styles.customExerciseBtn, { backgroundColor: c.background, borderColor: c.tint }]}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={c.tint} />
                      <Text style={{ color: c.tint, fontWeight: '700', marginLeft: 8 }}>Custom exercise</Text>
                    </Pressable>
                    <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 10, lineHeight: 17 }}>
                      Custom exercises are marked below — tap Edit on the right to change or delete.
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  <Pressable
                    onPress={() => setPickerOpen(false)}
                    style={[styles.modalCancelBtn, { backgroundColor: c.background }]}
                  >
                    <Text style={{ color: c.text, fontWeight: '600' }}>Close</Text>
                  </Pressable>
                }
                renderItem={({ item }) => (
                  <View style={[styles.pickRow, { borderBottomColor: c.border }]}>
                    <Pressable onPress={() => addExercise(item)} style={styles.pickRowMain}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: c.text, fontWeight: '600', fontSize: 16 }}>{item.name}</Text>
                        <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2, textTransform: 'capitalize' }}>
                          {String(item.muscleGroup).replace(/_/g, ' ')} ·{' '}
                          {TRACKING_OPTIONS.find((o) => o.mode === item.trackingMode)?.label ?? 'Weight + reps'}
                          {item.isCustom ? (
                            <Text style={{ color: c.tint, fontWeight: '700' }}>{' · Custom'}</Text>
                          ) : null}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
                    </Pressable>
                    {item.isCustom ? (
                      <View style={styles.pickRowActions}>
                        <Pressable
                          onPress={() => openEditCustomExercise(item)}
                          hitSlop={12}
                          accessibilityLabel="Edit custom exercise"
                          accessibilityRole="button"
                          style={styles.pickIconBtn}
                        >
                          <Ionicons name="create-outline" size={20} color={c.tint} />
                          <Text style={[styles.pickActionLabel, { color: c.tint }]}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDeleteCustomExercise(item)}
                          hitSlop={12}
                          accessibilityLabel="Delete custom exercise"
                          accessibilityRole="button"
                          style={styles.pickIconBtn}
                        >
                          <Ionicons name="trash-outline" size={22} color={c.danger} />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                )}
              />
            </View>
          </View>
        </Modal>

        <Modal
          visible={customOpen}
          animationType="fade"
          transparent
          presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
          onRequestClose={() => {
            setEditingCustomExercise(null);
            setCustomOpen(false);
          }}
        >
          <KeyboardAvoidingModalBody offsetIOS={40}>
          <View style={[styles.modalBackdrop, { backgroundColor: c.overlay, justifyContent: 'center' }]}>
            <View style={[styles.saveCard, { backgroundColor: c.card, borderColor: c.border, maxHeight: '88%' }]}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
              >
                <View style={styles.modalHeaderRow}>
                  <Ionicons name="create-outline" size={22} color={c.tint} />
                  <Text style={[styles.modalTitle, { color: c.text, marginBottom: 0, flex: 1 }]}>
                    {editingCustomExercise ? 'Edit exercise' : 'New exercise'}
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
                  contentContainerStyle={styles.muscleChipRow}
                  {...contrastScrollProps(c.scrollIndicatorStyle, 'horizontal')}
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
                <Pressable style={[styles.primaryBtn, { backgroundColor: c.tint }]} onPress={saveCustomExercise}>
                  <Text style={[styles.primaryBtnText, { color: c.onTintLight }]}>
                    {editingCustomExercise ? 'Save changes' : 'Save & add to routine'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setEditingCustomExercise(null);
                    setCustomOpen(false);
                  }}
                  style={{ marginTop: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: c.textMuted, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
          </KeyboardAvoidingModalBody>
        </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  addBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderStyle: 'dashed',
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  deleteIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingRight: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pickRowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    paddingRight: 8,
  },
  pickRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
  },
  pickIconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  pickActionLabel: { fontSize: 13, fontWeight: '700' },
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
  modalCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
  },
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
  primaryBtnText: { fontWeight: '800', fontSize: 16 },
  primaryBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
});
