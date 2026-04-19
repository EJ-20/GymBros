import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * iOS: navigation header (~44–56pt) + tab bar (~49pt) — padding must account for both so fields stay above the keyboard.
 * Tuned with React Navigation tab + stack header; adjust if tab/header styles change.
 */
const IOS_TAB_KEYBOARD_OFFSET = 92;

/**
 * Stack/modal screens with a visible navigation header (Edit profile, Sign in, etc.).
 */
const IOS_MODAL_KEYBOARD_OFFSET = 56;

/** Pushed stack screens without tab bar (e.g. Routine builder) — header only. */
const IOS_STACK_KEYBOARD_OFFSET = 68;

type Variant = 'tab' | 'modal' | 'stack' | 'none';

type Props = {
  children: ReactNode;
  /**
   * tab = tab screens with bottom bar; modal = presentation modal + header;
   * stack = pushed stack screen, no tab bar; none = offset 0
   */
  variant?: Variant;
  style?: ViewStyle;
};

/**
 * Wraps scrollable or flex content so `KeyboardAvoidingView` can shrink/pad when the keyboard opens.
 * Android: relies on `softwareKeyboardLayoutMode: 'resize'` (see app.config.js); behavior stays undefined.
 */
export function KeyboardAvoidingScreen({ children, variant = 'tab', style }: Props) {
  const insets = useSafeAreaInsets();
  const offset =
    Platform.OS === 'ios'
      ? variant === 'tab'
        ? IOS_TAB_KEYBOARD_OFFSET
        : variant === 'modal'
          ? IOS_MODAL_KEYBOARD_OFFSET + Math.min(insets.top, 8)
          : variant === 'stack'
            ? IOS_STACK_KEYBOARD_OFFSET + Math.min(insets.top, 8)
            : 0
      : 0;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

type ModalAvoidProps = {
  children: ReactNode;
  /** Extra offset when the modal card is vertically centered (smaller = more lift). */
  offsetIOS?: number;
  style?: ViewStyle;
};

/**
 * Use inside `Modal` (full-screen overlay) so centered sheets and `ScrollView` inputs move above the keyboard.
 */
export function KeyboardAvoidingModalBody({ children, offsetIOS = 36, style }: ModalAvoidProps) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offsetIOS : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
