import { Tabs } from 'expo-router';
import { Text } from 'react-native';

function Icon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ color, fontSize: 18, fontWeight: '600' }}>{symbol}</Text>;
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#0a0a0a' },
        headerTintColor: '#fff',
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222', borderTopWidth: 1 },
        tabBarActiveTintColor: '#c8102e',
        tabBarInactiveTintColor: '#555',
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarLabel: 'Home', tabBarIcon: ({ color }) => <Icon symbol="H" color={color} /> }}
      />
      <Tabs.Screen
        name="league"
        options={{ title: 'Leagues', tabBarLabel: 'Leagues', headerShown: false, tabBarIcon: ({ color }) => <Icon symbol="L" color={color} /> }}
      />
      <Tabs.Screen
        name="fighters"
        options={{ title: 'Fighters', tabBarLabel: 'Fighters', headerShown: false, tabBarIcon: ({ color }) => <Icon symbol="F" color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarLabel: 'Settings', tabBarIcon: ({ color }) => <Icon symbol="S" color={color} /> }}
      />
    </Tabs>
  );
}
