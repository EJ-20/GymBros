import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import { buildCoachContextSummary } from '@/src/lib/coachContext';
import { getSupabase } from '@/src/lib/supabase';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Msg = { role: 'user' | 'assistant'; text: string };

export default function CoachScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, backendReady } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text: "I'm your GymBros coach. Ask about programming, RPE, or your recent sessions. Not medical advice.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<ComponentRef<typeof FlatList>>(null);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
      };
    }, [])
  );

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
    const apiMessages = threaded.map((m) => ({
      role: m.role,
      content: m.text,
    }));

    const { data, error } = await sb.functions.invoke('ai-coach', {
      body: { messages: apiMessages, contextSummary },
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
    const reply = (data as { reply?: string; error?: string })?.reply;
    const err = (data as { error?: string })?.error;
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
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
        data={messages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScrollBeginDrag={() => Keyboard.dismiss()}
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
      {/*
        Avoid wrapping the full screen in KeyboardAvoidingView: on iOS it can steal edge/back
        gestures from the parent navigator while the keyboard is up. Only the input strip adjusts.
        Android uses app.config softwareKeyboardLayoutMode: 'resize'.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={[
          styles.footer,
          { borderTopColor: c.border, backgroundColor: c.card, paddingBottom: Math.max(insets.bottom, 6) },
        ]}
      >
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
      </KeyboardAvoidingView>
    </View>
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
