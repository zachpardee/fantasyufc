import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/client';
import type { UFCEvent, League } from '@fantasy-ufc/shared';

export default function DashboardScreen() {
  const router = useRouter();

  const { data: events } = useQuery<UFCEvent[]>({
    queryKey: ['events'],
    queryFn: () => apiClient.get('/events'),
  });

  const { data: leagues } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  const upcomingEvent = events?.find((e) => e.status === 'scheduled' || e.status === 'live');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Fantasy UFC</Text>
      </View>

      {upcomingEvent && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NEXT EVENT</Text>
          <Text style={styles.eventName}>{upcomingEvent.name}</Text>
          <Text style={styles.eventDate}>
            {new Date(upcomingEvent.scheduledAt).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </Text>
          {upcomingEvent.status === 'live' && (
            <View style={styles.liveBadge}><Text style={styles.liveText}>LIVE</Text></View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Leagues</Text>
          <TouchableOpacity onPress={() => router.push('/(app)/league/create')}>
            <Text style={styles.sectionAction}>+ Create</Text>
          </TouchableOpacity>
        </View>

        {leagues?.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No leagues yet</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.push('/(app)/league/create')}>
              <Text style={styles.buttonText}>Create or Join a League</Text>
            </TouchableOpacity>
          </View>
        )}

        {leagues?.map((league) => (
          <TouchableOpacity
            key={league.id}
            style={styles.leagueCard}
            onPress={() => router.push(`/(app)/league/${league.id}`)}
          >
            <Text style={styles.leagueName}>{league.name}</Text>
            <Text style={styles.leagueMeta}>{league.memberCount} teams · {league.status}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: { padding: 24, paddingTop: 16 },
  greeting: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  card: {
    margin: 16, marginTop: 0, backgroundColor: '#1a1a1a',
    borderRadius: 12, padding: 20, borderWidth: 1, borderColor: '#333',
  },
  cardLabel: { fontSize: 11, color: '#c8102e', fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  eventName: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  eventDate: { fontSize: 14, color: '#999' },
  liveBadge: {
    marginTop: 12, alignSelf: 'flex-start',
    backgroundColor: '#c8102e', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3,
  },
  liveText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  section: { padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  sectionAction: { color: '#c8102e', fontSize: 14, fontWeight: '600' },
  emptyState: { alignItems: 'center', padding: 32 },
  emptyText: { color: '#666', marginBottom: 16 },
  button: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
  leagueCard: {
    backgroundColor: '#1a1a1a', borderRadius: 10, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  leagueName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  leagueMeta: { fontSize: 13, color: '#888' },
});
