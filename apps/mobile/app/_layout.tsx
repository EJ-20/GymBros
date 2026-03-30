import { AuthProvider } from '@/src/contexts/AuthContext';
import { initDatabase } from '@/src/db/database';
import { parseWatchIntent } from '@/src/watch/WatchBridge';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useColorScheme, Linking } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    try {
      initDatabase();
    } catch (e) {
      console.error(e);
    } finally {
      setDbReady(true);
      SplashScreen.hideAsync();
    }
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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="profile"
              options={{
                title: 'Account',
                presentation: 'modal',
                headerShown: true,
              }}
            />
          </Stack>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
