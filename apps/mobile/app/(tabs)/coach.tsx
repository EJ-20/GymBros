import { KeyboardAvoidingScreen } from '@/src/components/KeyboardAvoidingScreen';
import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { buildCoachContextSummary } from '@/src/lib/coachContext';
import { getSupabase } from '@/src/lib/supabase';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Msg = { role: 'user' | 'assistant'; text: string };
const initialCoachMessage =
  "I'm your GymBros coach. Ask about programming, RPE, or your recent sessions. Not medical advice.";

type CoachApiResponse = { reply?: string; error?: string; threadId?: string };

export default function CoachScreen() {
  const c = useColors();
  const { user, backendReady } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const [messages, setMessages] = useState<Msg[]>([{ role: 'assistant', text: initialCoachMessage }]);
  const [input, setInput] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      if (!user || !backendReady) {
        setThreadId(null);
        setMessages([{ role: 'assistant', text: initialCoachMessage }]);
        return;
      }

      const sb = getSupabase();
      if (!sb) return;

      setLoadingHistory(true);
      const { data: threads, error: threadError } = await sb
        .from('coach_threads')
        .select('id')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (threadError) {
        if (!cancelled) {
          setMessages([{ role: 'assistant', text: initialCoachMessage }]);
          setThreadId(null);
          showAlert('Coach', `Could not load coach history: ${threadError.message}`);
        }
        return;
      }

      const latestThreadId = threads?.[0]?.id ?? null;
      if (!latestThreadId) {
        if (!cancelled) {
          setMessages([{ role: 'assistant', text: initialCoachMessage }]);
          setThreadId(null);
        }
        return;
      }

      const { data: rows, error: msgError } = await sb
        .from('coach_messages')
        .select('role, content')
        .eq('thread_id', latestThreadId)
        .order('created_at', { ascending: true })
        .limit(120);
      if (msgError) {
        if (!cancelled) {
          setMessages([{ role: 'assistant', text: initialCoachMessage }]);
          setThreadId(latestThreadId);
          showAlert('Coach', `Could not load messages: ${msgError.message}`);
        }
        return;
      }

      if (cancelled) return;
      const chatMessages: Msg[] = [];
      for (const row of rows ?? []) {
        if (row.role === 'user' || row.role === 'assistant') {
          chatMessages.push({ role: row.role, text: row.content });
        }
      }
      setThreadId(latestThreadId);
      setMessages(chatMessages.length ? chatMessages : [{ role: 'assistant', text: initialCoachMessage }]);
    };

    loadHistory().finally(() => {
      if (!cancelled) setLoadingHistory(false);
    });

    return () => {
      cancelled = true;
    };
  }, [backendReady, showAlert, user]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || loadingHistory) return;
    if (!user || !backendReady) {
      showAlert('Sign in', 'Coach uses your cloud session. Open Sign in from the person menu.');
      return;
    }
    const sb = getSupabase();
    if (!sb) return;

    const nextUser: Msg = { role: 'user', text };
    const threaded: Msg[] = [...messages, nextUser];
    setInput('');
    setMessages(threaded);
    setSending(true);

    const contextSummary = buildCoachContextSummary(8, unit);
    const { data, error } = await sb.functions.invoke('ai-coach', {
      body: {
        threadId: threadId ?? undefined,
        userMessage: text,
        messages: threaded.map((m) => ({ role: m.role, content: m.text })),
        contextSummary,
      },
    });

    setSending(false);

    if (error) {
      showAlert(
        'Coach',
        error.message ??
          'Could not reach the coach. Deploy the ai-coach Edge Function and set OPENAI_API_KEY in Supabase (see README).'
      );
      return;
    }
    const payload = (data as CoachApiResponse | null) ?? null;
    const reply = payload?.reply;
    const err = payload?.error;
    if (payload?.threadId && payload.threadId !== threadId) {
      setThreadId(payload.threadId);
    }
    if (err) {
      showAlert('Coach', err);
      return;
    }
    if (reply) {
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } else {
      showAlert('Coach', 'No reply from the server. Check that the ai-coach function is deployed.');
    }
  };

  return (
    <KeyboardAvoidingScreen variant="tab" style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList<Msg>
        ref={listRef}
        {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user'
                ? { alignSelf: 'flex-end', backgroundColor: c.tint }
                : { alignSelf: 'flex-start', backgroundColor: c.card, borderColor: c.border, borderWidth: 1 },
            ]}
          >
            <Text
              style={
                item.role === 'user' ? [styles.bubbleUserText, { color: c.onTint }] : { color: c.text }
              }
            >
              {item.text}
            </Text>
          </View>
        )}
      />
      <View style={[styles.footer, { borderTopColor: c.border, backgroundColor: c.card }]}>
        {!user || !backendReady ? (
          <View style={{ marginBottom: 8, gap: 6 }}>
            <Text style={{ color: c.textMuted, fontSize: 13, lineHeight: 18 }}>
              Sign in (person menu) and configure Supabase to message the coach.
            </Text>
            {backendReady && !user ? (
              <Link href="/sign-in" asChild>
                <Pressable hitSlop={8}>
                  <Text style={{ color: c.tint, fontSize: 14, fontWeight: '800' }}>Open sign in</Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        ) : null}
        {loadingHistory ? (
          <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 8 }}>Loading coach history…</Text>
        ) : null}
        {sending ? <ActivityIndicator color={c.tint} style={{ marginBottom: 8 }} /> : null}
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { color: c.text, borderColor: c.border }]}
            placeholder="Ask the coach…"
            placeholderTextColor={c.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={sending || loadingHistory}
            style={[
              styles.send,
              { backgroundColor: c.tint, opacity: sending || loadingHistory ? 0.5 : 1 },
            ]}
          >
            <Text style={[styles.sendText, { color: c.onTint }]}>Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingScreen>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '88%', padding: 12, borderRadius: 14 },
  bubbleUserText: {},
  footer: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  send: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
  sendText: { fontWeight: '700' },
});
