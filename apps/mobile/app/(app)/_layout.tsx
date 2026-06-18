import { Tabs } from 'expo-router';
import { Home, Trophy, Swords, Settings } from 'lucide-react-native';

// Anchor the tab navigator on League Home so re-tapping a tab doesn't bounce to User Home.
export const unstable_settings = {
  initialRouteName: 'league',
};

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
        name="league"
        options={{ title: 'League Home', tabBarLabel: 'League Home', headerShown: false, tabBarIcon: ({ color, size }) => <Trophy color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="current-event"
        options={{ title: 'Current Event', tabBarLabel: 'Current Event', headerShown: false, tabBarIcon: ({ color, size }) => <Swords color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="index"
        options={{ title: 'User Home', tabBarLabel: 'User Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size ?? 22} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color, size }) => <Settings color={color} size={size ?? 22} /> }}
      />
      {/* Fighters browser still exists as a route, just not shown in the tab bar */}
      <Tabs.Screen name="fighters" options={{ href: null }} />
    </Tabs>
  );
}
