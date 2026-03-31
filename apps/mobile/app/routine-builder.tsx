import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import type { Exercise } from '@gymbros/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

export default function RoutineBuilderScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(id);

  const [name, setName] = useState('');
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const exercises = repo.listExercises();

  useEffect(() => {
    if (!id) return;
    const t = repo.getTemplate(id);
    if (t) {
      setName(t.name);
      setExerciseIds([...t.exerciseIds]);
    }
  }, [id]);

  const addExercise = useCallback((ex: Exercise) => {
    setExerciseIds((prev) => [...prev, ex.id]);
    setPickerOpen(false);
  }, []);

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
      Alert.alert('Name required', 'Give this routine a name.');
      return;
    }
    if (exerciseIds.length === 0) {
      Alert.alert('Add exercises', 'Pick at least one exercise.');
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
      <View style={{ flex: 1, backgroundColor: c.background, padding: 16 }}>
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
              <Pressable onPress={() => removeAt(item.index)} style={{ marginLeft: 12 }}>
                <Text style={{ color: c.danger }}>Remove</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <Text style={{ color: c.textMuted, marginTop: 8 }}>No exercises yet.</Text>
          }
        />

        <Modal visible={pickerOpen} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: c.card }]}>
              <Text style={[styles.modalTitle, { color: c.text }]}>Pick exercise</Text>
              <FlatList
                data={exercises}
                keyExtractor={(e) => e.id}
                style={{ maxHeight: '70%' }}
                renderItem={({ item }) => (
                  <Pressable
                    onPress={() => addExercise(item)}
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
      </View>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  pickRow: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
