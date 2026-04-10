import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import type { WorkoutTemplate } from '@gymbros/shared';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function RoutinesScreen() {
  const c = useColors();
  const { localDataVersion } = useAuth();
  const showAlert = useAppAlert();
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);

  const load = useCallback(() => {
    setTemplates(repo.listTemplates());
  }, []);

  useFocusEffect(useCallback(() => load(), [load, localDataVersion]));

  const remove = (t: WorkoutTemplate) => {
    showAlert('Delete routine', `Remove “${t.name}”?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          repo.deleteTemplate(t.id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        contentContainerStyle={styles.list}
        data={templates}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <Text style={[styles.sub, { color: c.textMuted }]}>
            Ordered exercise lists. Start from the Workout tab or build here. Use Account → Sync to
            back up routines to the cloud.
          </Text>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.textMuted }]}>
            No routines yet. Create one with the button below.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Pressable
              onPress={() =>
                router.push({ pathname: '/routine-builder', params: { id: item.id } })
              }
            >
              <Text style={[styles.name, { color: c.text }]}>{item.name}</Text>
              <Text style={{ color: c.textMuted, fontSize: 14 }}>
                {item.exerciseIds.length} exercise{item.exerciseIds.length === 1 ? '' : 's'}
              </Text>
            </Pressable>
            <View style={styles.row}>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/routine-builder', params: { id: item.id } })
                }
              >
                <Text style={{ color: c.tint, fontWeight: '600' }}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => remove(item)}
                hitSlop={12}
                accessibilityLabel="Delete routine"
                accessibilityRole="button"
                style={styles.deleteIconBtn}
              >
                <Ionicons name="trash-outline" size={20} color={c.danger} />
              </Pressable>
            </View>
          </View>
        )}
      />
      <Pressable
        style={[styles.fab, { backgroundColor: c.tint }]}
        onPress={() => router.push('/routine-builder')}
      >
        <Text style={[styles.fabText, { color: c.onTint }]}>New routine</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 100, gap: 12 },
  sub: { marginBottom: 12, fontSize: 14, lineHeight: 20 },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 15 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 10 },
  name: { fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  deleteIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    left: 20,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  fabText: { fontWeight: '700', fontSize: 16 },
});
