import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Plus, Trophy } from 'lucide-react-native';
import { apiClient } from '../../src/api/client';
import { useAuthStore } from '../../src/store/auth.store';
import { useLeagueStore } from '../../src/store/league.store';
import { useRefresh } from '../../src/hooks/useRefresh';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import type { UFCEvent, League } from '@fantasy-ufc/shared';

export default function DashboardScreen() {
  const router = useRouter();
  const { session } = useAuthStore();
  const setCurrentLeagueId = useLeagueStore((s) => s.setCurrentLeagueId);
  const { refreshing, onRefresh } = useRefresh();

  const { data: profile } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me'),
    enabled: !!session,
  });

  const { data: events } = useQuery<UFCEvent[]>({
    queryKey: ['events'],
    queryFn: () => apiClient.get('/events'),
  });

  const { data: leagues } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  const liveEvent = events?.find((e) => e.status === 'live');
  const upcomingEvent = liveEvent ?? events?.find((e) => e.status === 'scheduled');
  const displayName = profile?.displayName ?? 'Fighter';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c8102e" />
      }
    >
      {/* Header greeting */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey, {displayName}</Text>
          <Text style={styles.subtitle}>Fantasy UFC</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
          <MemberAvatar
            name={displayName}
            color={profile?.avatarColor}
            avatarUrl={profile?.avatarUrl}
            size={42}
          />
        </TouchableOpacity>
      </View>

      {/* Next event card */}
      {upcomingEvent && (
        <View style={[styles.eventCard, liveEvent && styles.eventCardLive]}>
          <View style={styles.eventCardTop}>
            <Text style={styles.cardLabel}>{liveEvent ? 'LIVE NOW' : 'NEXT EVENT'}</Text>
            {liveEvent && <View style={styles.liveDot} />}
          </View>
          <Text style={styles.eventName}>{upcomingEvent.name}</Text>
          {((upcomingEvent as any).venue || (upcomingEvent as any).location) && (
            <Text style={styles.eventVenue} numberOfLines={1}>
              {[(upcomingEvent as any).venue, (upcomingEvent as any).location]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}
          <Text style={styles.eventDate}>
            {new Date(upcomingEvent.scheduledAt).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
        </View>
      )}

      {/* Leagues */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Leagues</Text>
          <View style={styles.sectionActions}>
            <TouchableOpacity
              style={styles.sectionActionRow}
              onPress={() => router.push('/(app)/league/create?tab=join' as never)}
            >
              <Plus size={14} color="#c8102e" />
              <Text style={styles.sectionAction}>Join</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.sectionActionRow}
              onPress={() => router.push('/(app)/league/create')}
            >
              <Plus size={14} color="#c8102e" />
              <Text style={styles.sectionAction}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>

        {leagues?.length === 0 && (
          <View style={styles.emptyState}>
            <Trophy size={36} color="#444" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No leagues yet</Text>
            <Text style={styles.emptyText}>
              Join a league with an invite code or create your own.
            </Text>
            <View style={styles.emptyButtons}>
              <TouchableOpacity
                style={styles.button}
                onPress={() => router.push('/(app)/league/create?tab=join' as never)}
              >
                <Text style={styles.buttonText}>Join a League</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary]}
                onPress={() => router.push('/(app)/league/create')}
              >
                <Text style={styles.buttonText}>Create a League</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {leagues?.map((league) => {
          const isStaking = (league as any).leagueFormat === 'staking';
          const statusColors: Record<string, string> = {
            active: '#1a3a1a',
            playoffs: '#1a1a3a',
            completed: '#2a2a2a',
            setup: '#2a1a1a',
          };
          return (
            <TouchableOpacity
              key={league.id}
              style={[
                styles.leagueCard,
                { borderLeftColor: statusColors[league.status] ?? '#2a2a2a' },
              ]}
              onPress={() => {
                setCurrentLeagueId(league.id);
                router.push('/(app)/current-event');
              }}
            >
              <View style={styles.leagueCardLeft}>
                <Text style={styles.leagueName}>{league.name}</Text>
                <View style={styles.leagueMetaRow}>
                  <Text style={styles.leagueMeta}>
                    {league.memberCount} / {league.maxTeams} teams
                  </Text>
                  {isStaking && (
                    <View style={styles.stakingBadge}>
                      <Text style={styles.stakingText}>STAKING</Text>
                    </View>
                  )}
                </View>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColors[league.status] ?? '#222' },
                ]}
              >
                <Text style={styles.statusText}>{league.status.toUpperCase()}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  header: {
    padding: 24,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 22, fontWeight: '700', color: '#fff' },
  subtitle: { fontSize: 13, color: '#555', marginTop: 2 },

  eventCard: {
    margin: 16,
    marginTop: 0,
    backgroundColor: '#141414',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderLeftWidth: 3,
    borderLeftColor: '#333',
  },
  eventCardLive: { borderLeftColor: '#c8102e', backgroundColor: '#1a0808' },
  eventCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardLabel: { fontSize: 10, color: '#c8102e', fontWeight: '800', letterSpacing: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c8102e' },
  eventName: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  eventVenue: { fontSize: 13, color: '#666', marginBottom: 3 },
  eventDate: { fontSize: 13, color: '#888' },

  section: { paddingHorizontal: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  sectionActions: { flexDirection: 'row', gap: 16 },
  sectionActionRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sectionAction: { color: '#c8102e', fontSize: 14, fontWeight: '600' },

  emptyState: { alignItems: 'center', padding: 32 },
  emptyIcon: { marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  emptyButtons: { gap: 10, width: '100%' },
  button: {
    backgroundColor: '#c8102e',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonSecondary: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  leagueCard: {
    backgroundColor: '#141414',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#222',
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
  },
  leagueCardLeft: { flex: 1 },
  leagueName: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  leagueMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leagueMeta: { fontSize: 13, color: '#666' },
  stakingBadge: {
    backgroundColor: '#1a1000',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stakingText: { color: '#ffd700', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginLeft: 12 },
  statusText: { color: '#aaa', fontSize: 11, fontWeight: '700' },
});
