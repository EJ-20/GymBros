import { useColors } from '@/src/hooks/useColors';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { friendlyBackendError } from '@/src/lib/friendlyError';
import * as repo from '@/src/db/workoutRepo';
import { deleteSessionFromCloud } from '@/src/sync/syncEngine';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkoutSession } from '@gymbros/shared';

function formatSessionDateParts(iso: string): { date: string; time: string } {
  try {
    const d = new Date(iso);
    return {
      date: d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
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

export default function HistoryScreen() {
  const c = useColors();
  const { user, backendReady, localDataVersion } = useAuth();
  const showAlert = useAppAlert();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  const reload = useCallback(() => {
    setSessions(repo.listSessions(80).filter((s) => s.endedAt));
  }, []);

  useFocusEffect(useCallback(() => reload(), [reload, localDataVersion]));

  const totalSetsInList = useMemo(
    () => sessions.reduce((sum, s) => sum + repo.sessionSetCount(s.id), 0),
    [sessions]
  );

  const confirmDelete = (item: WorkoutSession) => {
    showAlert(
      'Delete workout',
      'Remove this session and all its sets from this device' +
        (user && backendReady ? ' and from your cloud backup.' : '?'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (user && backendReady) {
              const { error, attempted } = await deleteSessionFromCloud(item.id);
              if (error && attempted) {
                showAlert(
                  'Cloud delete',
                  `${friendlyBackendError(error)}\n\nThe workout will still be removed on this device.`
                );
              }
            }
            repo.deleteCompletedSession(item.id);
            reload();
          },
        },
      ]
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.listContent}
      data={sessions}
      keyExtractor={(s) => s.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={[styles.title, { color: c.text }]}>Past sessions</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>
            Duration, sets, RPE, and notes from every completed workout.
          </Text>
          {sessions.length > 0 ? (
            <View style={[styles.summaryStrip, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={styles.summaryItem}>
                <Ionicons name="layers-outline" size={18} color={c.tint} />
                <Text style={[styles.summaryValue, { color: c.text }]}>{sessions.length}</Text>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>in list</Text>
              </View>
              <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
              <View style={styles.summaryItem}>
                <Ionicons name="repeat-outline" size={18} color={c.tint} />
                <Text style={[styles.summaryValue, { color: c.text }]}>{totalSetsInList}</Text>
                <Text style={[styles.summaryLabel, { color: c.textMuted }]}>sets logged</Text>
              </View>
            </View>
          ) : null}
          {sessions.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: c.textMuted }]}>Log</Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <View style={[styles.emptyIconWrap, { backgroundColor: c.card, borderColor: c.border }]}>
            <Ionicons name="calendar-outline" size={44} color={c.tint} style={{ opacity: 0.85 }} />
          </View>
          <Text style={[styles.emptyTitle, { color: c.text }]}>No history yet</Text>
          <Text style={[styles.emptySub, { color: c.textMuted }]}>
            Finish a workout on the Workout tab — sessions show up here with duration, sets, RPE, and
            notes.
          </Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const setCount = repo.sessionSetCount(item.id);
        const exerciseCount = repo.sessionDistinctExerciseCount(item.id);
        const mins = item.endedAt
          ? Math.round(
              (new Date(item.endedAt).getTime() - new Date(item.startedAt).getTime()) / 60000
            )
          : 0;
        const { date, time } = formatSessionDateParts(item.startedAt);
        return (
          <View
            style={[
              styles.card,
              { backgroundColor: c.card, borderColor: c.border },
              index === 0 ? styles.cardFirst : null,
            ]}
          >
            <View style={[styles.cardAccent, { backgroundColor: c.tint }]} />
            <View style={styles.cardInner}>
              <View style={styles.cardHead}>
                <View style={styles.dateBlock}>
                  <Text style={[styles.dateLine, { color: c.text }]}>{date}</Text>
                  <Text style={[styles.timeLine, { color: c.textMuted }]}>{time}</Text>
                </View>
                <Pressable
                  onPress={() => confirmDelete(item)}
                  hitSlop={12}
                  accessibilityLabel="Delete workout"
                  style={[styles.deletePill, { borderColor: c.danger, backgroundColor: c.background }]}
                >
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              </View>

              <View style={styles.metaGrid}>
                <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                  <Ionicons name="time-outline" size={16} color={c.tint} />
                  <Text style={[styles.metaText, { color: c.text }]}>{mins} min</Text>
                </View>
                <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                  <Ionicons name="layers-outline" size={16} color={c.tint} />
                  <Text style={[styles.metaText, { color: c.text }]}>
                    {setCount} set{setCount === 1 ? '' : 's'}
                    {exerciseCount > 0
                      ? ` · ${exerciseCount} exercise${exerciseCount === 1 ? '' : 's'}`
                      : ''}
                  </Text>
                </View>
                {item.perceivedExertion != null ? (
                  <View style={[styles.metaChip, { backgroundColor: c.background }]}>
                    <Ionicons name="pulse-outline" size={16} color={c.tint} />
                    <Text style={[styles.metaText, { color: c.text }]}>RPE {item.perceivedExertion}</Text>
                  </View>
                ) : null}
              </View>

              {item.notes ? (
                <View style={[styles.notesBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <View style={styles.notesHeader}>
                    <Ionicons name="document-text-outline" size={14} color={c.textMuted} />
                    <Text style={[styles.notesLabel, { color: c.textMuted }]}>Notes</Text>
                  </View>
                  <Text style={[styles.notesBody, { color: c.textMuted }]} numberOfLines={4}>
                    {item.notes}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 40, gap: 12 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: { fontSize: 28, fontWeight: '800', marginTop: 6, letterSpacing: -0.3 },
  sub: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },
  summaryDivider: { width: 1, height: 40 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 22,
    marginBottom: 4,
  },
  empty: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 48, alignItems: 'center' },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  emptySub: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardFirst: { marginTop: 8 },
  cardAccent: { width: 4 },
  cardInner: { flex: 1, padding: 16, gap: 12 },
  cardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  dateBlock: { flex: 1, minWidth: 0 },
  dateLine: { fontSize: 17, fontWeight: '800' },
  timeLine: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  deletePill: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  metaText: { fontSize: 13, fontWeight: '700' },
  notesBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  notesHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  notesLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  notesBody: { fontSize: 14, lineHeight: 20 },
});
