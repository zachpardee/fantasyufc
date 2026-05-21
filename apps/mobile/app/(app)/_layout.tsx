import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#0a0a0a', borderTopColor: '#222' },
        tabBarActiveTintColor: '#c8102e',
        tabBarInactiveTintColor: '#666',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏠</Text> }}
      />
      <Tabs.Screen
        name="league"
        options={{ title: 'League', tabBarLabel: 'League', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🏆</Text> }}
      />
      <Tabs.Screen
        name="fighters"
        options={{ title: 'Fighters', tabBarLabel: 'Fighters', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>👊</Text> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text> }}
      />
    </Tabs>
  );
}
