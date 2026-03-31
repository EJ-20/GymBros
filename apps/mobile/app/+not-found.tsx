import { useColors } from '@/src/hooks/useColors';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  const c = useColors();
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Text style={[styles.title, { color: c.text }]}>This screen does not exist.</Text>
        <Link href="/(tabs)" style={{ marginTop: 20 }}>
          <Text style={{ color: c.tint, fontSize: 16, fontWeight: '600' }}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
});
