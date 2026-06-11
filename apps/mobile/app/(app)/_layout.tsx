import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function Icon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === '#c8102e' ? 1 : 0.45 }}>{emoji}</Text>;
}

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
        options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Icon emoji="🏠" color={color} /> }}
      />
      <Tabs.Screen
        name="league"
        options={{ title: 'Leagues', tabBarLabel: 'Leagues', headerShown: false, tabBarIcon: ({ color }) => <Icon emoji="🥋" color={color} /> }}
      />
      <Tabs.Screen
        name="fighters"
        options={{ title: 'Fighters', tabBarLabel: 'Fighters', headerShown: false, tabBarIcon: ({ color }) => <Icon emoji="👊" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <Icon emoji="⚙️" color={color} /> }}
      />
    </Tabs>
  );
}
