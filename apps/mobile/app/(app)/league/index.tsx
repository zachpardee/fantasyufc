import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../src/api/client';
import type { League } from '@fantasy-ufc/shared';

export default function LeaguePickerScreen() {
  const router = useRouter();

  const { data: leagues = [], isLoading } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Leagues</Text>
        <TouchableOpacity onPress={() => router.push('/(app)/league/create')}>
          <Text style={styles.createLink}>+ Create / Join</Text>
        </TouchableOpacity>
      </View>

      {leagues.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No leagues yet</Text>
          <Text style={styles.emptySub}>Create one or get an invite code from a friend</Text>
          <TouchableOpacity style={styles.btn} onPress={() => router.push('/(app)/league/create')}>
            <Text style={styles.btnText}>Create or Join</Text>
          </TouchableOpacity>
        </View>
      )}

      {leagues.map((league) => (
        <TouchableOpacity
          key={league.id}
          style={styles.card}
          onPress={() => router.push(`/(app)/league/${league.id}`)}
        >
          <View style={styles.cardLeft}>
            <Text style={styles.leagueName}>{league.name}</Text>
            <Text style={styles.leagueMeta}>{league.memberCount} / {league.maxTeams} teams</Text>
          </View>
          <View style={[styles.statusBadge, statusStyle[league.status] ?? {}]}>
            <Text style={styles.statusText}>{league.status.toUpperCase()}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const statusStyle: Record<string, object> = {
  active: { backgroundColor: '#1a3a1a' },
  playoffs: { backgroundColor: '#1a1a3a' },
  completed: { backgroundColor: '#2a2a2a' },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#222',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  createLink: { color: '#c8102e', fontSize: 14, fontWeight: '600' },

  empty: { alignItems: 'center', padding: 48 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  btn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, marginHorizontal: 16, marginTop: 12,
    backgroundColor: '#1a1a1a', borderRadius: 10, borderWidth: 1, borderColor: '#2a2a2a',
  },
  cardLeft: { flex: 1 },
  leagueName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 3 },
  leagueMeta: { color: '#666', fontSize: 13 },
  statusBadge: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { color: '#aaa', fontSize: 11, fontWeight: '700' },
});
