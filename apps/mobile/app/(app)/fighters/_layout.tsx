import { Stack } from 'expo-router';

export default function FightersLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: '#0a0a0a' }, headerTintColor: '#fff', headerBackTitle: 'Fighters' }}>
      <Stack.Screen name="index" options={{ title: 'Fighters' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
