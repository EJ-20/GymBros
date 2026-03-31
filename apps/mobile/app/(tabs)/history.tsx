import { useColors } from '@/src/hooks/useColors';
import * as repo from '@/src/db/workoutRepo';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { WorkoutSession } from '@gymbros/shared';

export default function HistoryScreen() {
  const c = useColors();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      setSessions(repo.listSessions(80).filter((s) => s.endedAt));
    }, [])
  );

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      data={sessions}
      keyExtractor={(s) => s.id}
      ListEmptyComponent={
        <Text style={{ color: c.textMuted, textAlign: 'center', marginTop: 32 }}>
          Completed workouts show up here with volume and duration.
        </Text>
      }
      renderItem={({ item }) => {
        const vol = Math.round(repo.sessionVolumeKg(item.id));
        const mins = item.endedAt
          ? Math.round(
              (new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000
            )
          : 0;
        return (
          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.date, { color: c.text }]}>
              {new Date(item.startedAt).toLocaleString()}
            </Text>
            <Text style={{ color: c.textMuted }}>
              {mins} min · {vol} kg·reps volume
              {item.perceivedExertion != null ? ` · RPE ${item.perceivedExertion}` : ''}
            </Text>
            {item.notes ? (
              <Text style={{ color: c.textMuted, marginTop: 6 }} numberOfLines={3}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 4,
  },
  date: { fontWeight: '600', fontSize: 16 },
});
