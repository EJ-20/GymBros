import { SignInPromptBanner } from '@/src/components/SignInPromptBanner';
import { useColors } from '@/src/hooks/useColors';
import { Ionicons } from '@expo/vector-icons';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';

export default function TabLayout() {
  const c = useColors();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <SignInPromptBanner />
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: c.tint,
            tabBarInactiveTintColor: c.tabIconDefault,
            tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
            headerStyle: { backgroundColor: c.card },
            headerTintColor: c.text,
            headerShadowVisible: false,
            headerRight: () => (
              <Link href="/profile" asChild>
                <Pressable style={{ marginRight: 16 }} hitSlop={12}>
                  <Ionicons name="person-circle-outline" size={26} color={c.tint} />
                </Pressable>
              </Link>
            ),
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Home',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="home-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="health"
            options={{
              title: 'Health',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="pulse-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="workout"
            options={{
              title: 'Workout',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="barbell-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="history"
            options={{
              title: 'History',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="calendar-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="leadership"
            options={{
              title: 'Leadership',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="people-outline" size={size} color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="coach"
            options={{
              title: 'Coach',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
              ),
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}
