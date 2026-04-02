import { useColors } from '@/src/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ToastContextValue = {
  showToast: (message: string, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue['showToast'] {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.showToast;
}

function ToastOverlay({
  text,
  token,
  durationMs,
  onDone,
}: {
  text: string;
  token: number;
  durationMs: number;
  onDone: () => void;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 10,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) onDone();
      });
    }, durationMs);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [token, durationMs, onDone, opacity, translateY]);

  return (
    <View
      style={[
        styles.viewport,
        {
          // Sit above the tab bar (root layout is tabs inside Stack).
          paddingBottom: Math.max(insets.bottom, 12) + 56,
        },
      ]}
      pointerEvents="none"
    >
      <Animated.View
        style={[
          styles.chipWrap,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
      >
        <View
          style={[
            styles.chip,
            {
              backgroundColor: c.card,
              borderColor: c.border,
              shadowColor: c.text,
              ...(Platform.OS === 'android' ? { elevation: 6 } : {}),
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: c.background }]}>
            <Ionicons name="trophy" size={18} color={c.tint} />
          </View>
          <Text style={[styles.message, { color: c.text }]} numberOfLines={3}>
            {text}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [payload, setPayload] = useState<{
    text: string;
    token: number;
    durationMs: number;
  } | null>(null);

  const showToast = useCallback((message: string, durationMs = 2600) => {
    setPayload((p) => ({
      text: message,
      token: (p?.token ?? 0) + 1,
      durationMs,
    }));
  }, []);

  const onDone = useCallback(() => {
    setPayload(null);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        {payload ? (
          <ToastOverlay
            text={payload.text}
            token={payload.token}
            durationMs={payload.durationMs}
            onDone={onDone}
          />
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewport: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 50,
    elevation: 50,
  },
  chipWrap: {
    maxWidth: 400,
    width: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
});
