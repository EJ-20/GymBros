import { useColors } from '@/src/hooks/useColors';
import { useAuth } from '@/src/contexts/AuthContext';
import { buildCoachContextSummary } from '@/src/lib/coachContext';
import { getSupabase } from '@/src/lib/supabase';
import { Link } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type Msg = { role: 'user' | 'assistant'; text: string };

export default function CoachScreen() {
  const c = useColors();
  const { user, backendReady } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: "I'm your GymBros coach. Ask about programming, RPE, or your recent sessions. Not medical advice.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<ComponentRef<typeof FlatList>>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    if (!user || !backendReady) {
      Alert.alert('Sign in', 'Coach uses your cloud session. Open Sign in from the person menu.');
      return;
    }
    const sb = getSupabase();
    if (!sb) return;

    const nextUser: Msg = { role: 'user', text };
    const threaded: Msg[] = [...messages, nextUser];
    setInput('');
    setMessages(threaded);
    setSending(true);

    const contextSummary = buildCoachContextSummary(8);
    const apiMessages = threaded.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const { data, error } = await sb.functions.invoke('ai-coach', {
      body: { messages: apiMessages, contextSummary },
    });

    setSending(false);

    if (error) {
      Alert.alert(
        'Coach',
        error.message ??
          'Could not reach the coach. Deploy the ai-coach Edge Function and set OPENAI_API_KEY in Supabase (see README).'
      );
      return;
    }
    const reply = (data as { reply?: string; error?: string })?.reply;
    const err = (data as { error?: string })?.error;
    if (err) {
      Alert.alert('Coach', err);
      return;
    }
    if (reply) {
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } else {
      Alert.alert('Coach', 'No reply from the server. Check that the ai-coach function is deployed.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={88}
    >
      <FlatList
        ref={listRef}
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
            disabled={sending}
            style={[styles.send, { backgroundColor: c.tint, opacity: sending ? 0.5 : 1 }]}
          >
            <Text style={[styles.sendText, { color: c.onTint }]}>Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
