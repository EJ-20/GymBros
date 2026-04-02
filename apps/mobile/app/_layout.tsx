import { AppAlertProvider } from '@/src/contexts/AppAlertContext';
import { AuthProvider } from '@/src/contexts/AuthContext';
import { ToastProvider } from '@/src/contexts/ToastContext';
import { WeightUnitProvider } from '@/src/contexts/WeightUnitContext';
import { initDatabase } from '@/src/db/database';
import { parseWatchIntent } from '@/src/watch/WatchBridge';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import type { ComponentType, PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { useColorScheme, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** RNGH types omit `children` under React 19 until a matching @types/rn release. */
function GestureRoot({ children }: PropsWithChildren) {
  const Root = GestureHandlerRootView as ComponentType<
    PropsWithChildren<{ style?: { flex: number } }>
  >;
  return <Root style={{ flex: 1 }}>{children}</Root>;
}

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    initDatabase()
      .then(() => {
        if (!cancelled) setDbReady(true);
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!cancelled) setDbReady(true);
      })
      .finally(() => {
        SplashScreen.hideAsync();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = (url: string | null) => {
      if (!url) return;
      const intent = parseWatchIntent(url);
      if (intent) router.push('/(tabs)/workout');
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [router]);

  if (!dbReady) return null;

  return (
    <GestureRoot>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <WeightUnitProvider>
          <AppAlertProvider>
          <ToastProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="routines" options={{ title: 'Routines', headerShown: true }} />
            <Stack.Screen
              name="routine-builder"
              options={{ headerShown: true, title: 'Routine' }}
            />
            <Stack.Screen
              name="profile"
              options={{
                title: 'Account',
                presentation: 'modal',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="profile-edit"
              options={{
                title: 'Edit profile',
                presentation: 'modal',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="sign-in"
              options={{
                title: 'Sign in',
                presentation: 'modal',
                headerShown: true,
              }}
            />
          </Stack>
          </ToastProvider>
          </AppAlertProvider>
          </WeightUnitProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureRoot>
  );
}
