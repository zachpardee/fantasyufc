import { Tabs } from 'expo-router';
import { Home, Trophy, Dumbbell, Settings } from 'lucide-react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#1a1a1a', borderTopWidth: 1 },
        tabBarActiveTintColor: '#c8102e',
        tabBarInactiveTintColor: '#555',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="league"
        options={{ title: 'Leagues', tabBarLabel: 'Leagues', headerShown: false, tabBarIcon: ({ color, size }) => <Trophy color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="fighters"
        options={{ title: 'Fighters', tabBarLabel: 'Fighters', headerShown: false, tabBarIcon: ({ color, size }) => <Dumbbell color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size ?? 22} /> }}
      />
    </Tabs>
  );
}
