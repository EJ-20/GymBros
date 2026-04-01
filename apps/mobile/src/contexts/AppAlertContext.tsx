import { useColors } from '@/src/hooks/useColors';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type AppAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export type AppAlertButton = {
  text: string;
  style?: AppAlertButtonStyle;
  onPress?: () => void | Promise<void>;
};

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

const initialState: AlertState = {
  visible: false,
  title: '',
  message: undefined,
  buttons: [],
};

type AppAlertContextValue = {
  showAlert: (title: string, message?: string, buttons?: AppAlertButton[]) => void;
};

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function useAppAlert(): AppAlertContextValue['showAlert'] {
  const ctx = useContext(AppAlertContext);
  if (!ctx) {
    throw new Error('useAppAlert must be used within AppAlertProvider');
  }
  return ctx.showAlert;
}

function AppAlertModal({
  state,
  onDismiss,
}: {
  state: AlertState;
  onDismiss: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();

  const runThenDismiss = (btn: AppAlertButton) => {
    const fn = btn.onPress;
    onDismiss();
    queueMicrotask(() => {
      void fn?.();
    });
  };

  const buttonRow = (children: ReactNode) => (
    <View style={styles.buttonRow}>{children}</View>
  );

  const renderButtons = () => {
    const btns = state.buttons;
    if (btns.length === 0) {
      return buttonRow(
        <Pressable
          onPress={() => runThenDismiss({ text: 'OK' })}
          style={({ pressed }) => [
            styles.btnPrimary,
            styles.btnGrow,
            { backgroundColor: c.tint, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={[styles.btnPrimaryLabel, { color: c.onTintLight }]}>OK</Text>
        </Pressable>
      );
    }

    if (btns.length === 1) {
      const b = btns[0]!;
      return buttonRow(renderSingleWide(b));
    }

    if (btns.length === 2) {
      const [a, b] = btns;
      return buttonRow(
        <>
          {renderPill(a!, true)}
          {renderPill(b!, true)}
        </>
      );
    }

    return (
      <View style={styles.buttonColumn}>
        {btns.map((b, i) => (
          <View key={`${b.text}-${i}`} style={i > 0 ? { marginTop: 10 } : undefined}>
            {renderPill(b, false)}
          </View>
        ))}
      </View>
    );
  };

  const renderSingleWide = (b: AppAlertButton) => {
    const st = b.style ?? 'default';
    if (st === 'destructive') {
      return (
        <Pressable
          onPress={() => runThenDismiss(b)}
          style={({ pressed }) => [
            styles.btnPrimary,
            styles.btnGrow,
            { backgroundColor: c.danger, opacity: pressed ? 0.88 : 1 },
          ]}
        >
          <Text style={[styles.btnPrimaryLabel, { color: c.onTintLight }]}>{b.text}</Text>
        </Pressable>
      );
    }
    if (st === 'cancel') {
      return (
        <Pressable
          onPress={() => runThenDismiss(b)}
          style={({ pressed }) => [
            styles.btnSecondary,
            styles.btnGrow,
            { borderColor: c.border, backgroundColor: c.background, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnSecondaryLabel, { color: c.text }]}>{b.text}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => runThenDismiss(b)}
        style={({ pressed }) => [
          styles.btnPrimary,
          styles.btnGrow,
          { backgroundColor: c.tint, opacity: pressed ? 0.88 : 1 },
        ]}
      >
        <Text style={[styles.btnPrimaryLabel, { color: c.onTintLight }]}>{b.text}</Text>
      </Pressable>
    );
  };

  const renderPill = (b: AppAlertButton, flex: boolean) => {
    const st = b.style ?? 'default';
    const wrap = { flex: 1, minWidth: 0 } as const;
    const rowLayout = flex ? wrap : styles.btnStretch;

    if (st === 'destructive') {
      return (
        <Pressable
          onPress={() => runThenDismiss(b)}
          style={({ pressed }) => [
            styles.btnSecondary,
            rowLayout,
            { borderColor: c.danger, backgroundColor: c.background, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnSecondaryLabel, { color: c.danger }]}>{b.text}</Text>
        </Pressable>
      );
    }
    if (st === 'cancel') {
      return (
        <Pressable
          onPress={() => runThenDismiss(b)}
          style={({ pressed }) => [
            styles.btnSecondary,
            rowLayout,
            { borderColor: c.border, backgroundColor: c.background, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.btnSecondaryLabel, { color: c.text }]}>{b.text}</Text>
        </Pressable>
      );
    }
    return (
      <Pressable
        onPress={() => runThenDismiss(b)}
        style={({ pressed }) => [
          styles.btnPrimary,
          rowLayout,
          { backgroundColor: c.tint, opacity: pressed ? 0.88 : 1 },
        ]}
      >
        <Text style={[styles.btnPrimaryLabel, { color: c.onTintLight }]}>{b.text}</Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={state.visible} transparent animationType="fade" statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: c.overlay, paddingTop: insets.top + 16 }]}>
        <View
          style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}
          accessibilityViewIsModal
        >
          <View style={[styles.accent, { backgroundColor: c.tint }]} />
          <View style={styles.sheetInner}>
            <Text style={[styles.title, { color: c.text }]}>{state.title}</Text>
            {state.message ? (
              <Text style={[styles.message, { color: c.textMuted }]}>{state.message}</Text>
            ) : null}
            <View style={styles.buttonBlock}>{renderButtons()}</View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export function AppAlertProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AlertState>(initialState);

  const showAlert = useCallback((title: string, message?: string, buttons?: AppAlertButton[]) => {
    setState({
      visible: true,
      title,
      message,
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    });
  }, []);

  const onDismiss = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const value = useMemo(() => ({ showAlert }), [showAlert]);

  return (
    <AppAlertContext.Provider value={value}>
      {children}
      <AppAlertModal state={state} onDismiss={onDismiss} />
    </AppAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accent: { width: 4 },
  sheetInner: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 18,
    paddingLeft: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  message: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
  },
  buttonBlock: { marginTop: 22 },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  buttonColumn: { alignSelf: 'stretch' },
  btnPrimary: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGrow: { flex: 1, minWidth: 0 },
  btnStretch: { alignSelf: 'stretch' },
  btnPrimaryLabel: { fontSize: 16, fontWeight: '800' },
  btnSecondary: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  btnSecondaryLabel: { fontSize: 16, fontWeight: '800' },
});
