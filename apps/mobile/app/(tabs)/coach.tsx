import { useColors } from '@/src/hooks/useColors';
import { contrastScrollProps } from '@/src/lib/contrastScrollProps';
import { useAppAlert } from '@/src/contexts/AppAlertContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { useWeightUnit } from '@/src/contexts/WeightUnitContext';
import {
  applyCoachActions,
  describeCoachAction,
  type AppliedCoachAction,
  type CoachAction,
} from '@/src/lib/coachActions';
import { buildCoachContextSummary } from '@/src/lib/coachContext';
import { getSupabase } from '@/src/lib/supabase';
import { syncAll } from '@/src/sync/syncEngine';
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

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: CoachAction[];
  actionStatus?: 'pending' | 'applied' | 'dismissed';
  resultText?: string;
};

function makeMsg(role: Msg['role'], text: string, actions?: CoachAction[]): Msg {
  return {
    id: `${Date.now()}-${Math.random()}`,
    role,
    text,
    actions,
    actionStatus: actions?.length ? 'pending' : undefined,
  };
}

function formatAppliedActions(results: AppliedCoachAction[]): string {
  if (!results.length) return 'No changes were needed.';
  return results
    .map((result) => {
      if (result.type === 'createExercise') {
        return result.created
          ? `Created exercise "${result.name}".`
          : `Exercise "${result.name}" already exists.`;
      }
      return `Created routine "${result.name}" with ${result.exerciseCount} exercises.`;
    })
    .join('\n');
}

export default function CoachScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, backendReady } = useAuth();
  const { unit } = useWeightUnit();
  const showAlert = useAppAlert();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hey, how can I help you today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [applyingActionId, setApplyingActionId] = useState<string | null>(null);
  const listRef = useRef<ComponentRef<typeof FlatList<Msg>>>(null);

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

    const nextUser = makeMsg('user', text);
    const threaded: Msg[] = [...messages, nextUser];
    setInput('');
    setMessages(threaded);
    setSending(true);

    const contextSummary = await buildCoachContextSummary(12, unit);
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
    const payload = data as { reply?: string; actions?: CoachAction[]; error?: string };
    const reply = payload?.reply;
    const actions = Array.isArray(payload?.actions) ? payload.actions : [];
    const err = payload?.error;
    if (err) {
      showAlert('Coach', err);
      return;
    }
    if (reply || actions.length) {
      setMessages((m) => [
        ...m,
        makeMsg('assistant', reply || 'I prepared a change for you to review.', actions),
      ]);
    } else {
      showAlert('Coach', 'No reply from the server. Check that the ai-coach function is deployed.');
    }
  };

  const dismissActions = (messageId: string) => {
    setMessages((items) =>
      items.map((item) =>
        item.id === messageId ? { ...item, actionStatus: 'dismissed', resultText: 'Dismissed.' } : item
      )
    );
  };

  const confirmActions = async (message: Msg) => {
    if (!message.actions?.length || applyingActionId) return;
    setApplyingActionId(message.id);
    try {
      const results = applyCoachActions(message.actions);
      const resultText = formatAppliedActions(results);
      setMessages((items) =>
        items.map((item) =>
          item.id === message.id ? { ...item, actionStatus: 'applied', resultText } : item
        )
      );

      if (user && backendReady) {
        const sync = await syncAll(user.id);
        if (sync.error) {
          showAlert('Coach', `Saved locally, but cloud sync failed: ${sync.error}`);
        }
      }
    } catch (e) {
      const messageText = e instanceof Error ? e.message : 'Could not apply that change.';
      showAlert('Coach', messageText);
    } finally {
      setApplyingActionId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlatList<Msg>
        ref={listRef}
        style={{ flex: 1 }}
        {...contrastScrollProps(c.scrollIndicatorStyle, 'vertical')}
        data={messages}
        keyExtractor={(item) => item.id}
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
            {item.actions?.length && item.role === 'assistant' ? (
              <View style={[styles.actionCard, { borderColor: c.border, backgroundColor: c.background }]}>
                <Text style={[styles.actionTitle, { color: c.text }]}>Proposed app changes</Text>
                {item.actions.map((action, index) => (
                  <Text key={`${action.type}-${index}`} style={[styles.actionText, { color: c.textMuted }]}>
                    {describeCoachAction(action)}
                  </Text>
                ))}
                {item.resultText ? (
                  <Text style={[styles.resultText, { color: c.text }]}>{item.resultText}</Text>
                ) : null}
                {item.actionStatus === 'pending' ? (
                  <View style={styles.actionButtons}>
                    <Pressable
                      onPress={() => dismissActions(item.id)}
                      disabled={applyingActionId === item.id}
                      style={[styles.actionButton, { borderColor: c.border }]}
                    >
                      <Text style={{ color: c.text }}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmActions(item)}
                      disabled={applyingActionId === item.id}
                      style={[
                        styles.actionButton,
                        styles.actionPrimary,
                        { backgroundColor: c.tint, opacity: applyingActionId === item.id ? 0.5 : 1 },
                      ]}
                    >
                      <Text style={{ color: c.onTint, fontWeight: '800' }}>
                        {applyingActionId === item.id ? 'Applying...' : 'Confirm'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}
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
  actionCard: { marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1, gap: 6 },
  actionTitle: { fontWeight: '800' },
  actionText: { fontSize: 13, lineHeight: 18 },
  resultText: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  actionButtons: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  actionPrimary: { borderWidth: 0 },
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
