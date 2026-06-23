import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';

type ScheduleEvent = {
  id: string;
  name: string;
  venue: string;
  location: string;
  scheduledAt: string;
  status: string;
  fightCount: number;
  matchupCount: number;
  isScoring: boolean;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ScheduleScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const { data: schedule = [], isLoading: loadingSchedule } = useQuery<ScheduleEvent[]>({
    queryKey: ['schedule', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule`),
  });

  const { data: available = [], isLoading: loadingAvailable } = useQuery<any[]>({
    queryKey: ['schedule-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule/available`),
  });

  const isLoading = loadingSchedule || loadingAvailable;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const scheduleIds = new Set(schedule.map((e) => e.id));

  const allScheduleRows = schedule
    .filter((ev) => ev.status !== 'cancelled')
    .filter((ev) => {
      if (ev.status === 'completed' || ev.status === 'live') return true;
      return new Date(ev.scheduledAt) > cutoff;
    });

  const completedRows = allScheduleRows
    .filter((ev) => ev.status === 'completed')
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    .slice(0, 3);
  const completedIds = new Set(completedRows.map((ev) => ev.id));

  const scheduleRows = allScheduleRows.filter(
    (ev) => ev.status !== 'completed' || completedIds.has(ev.id),
  );

  const availableRows = available.filter((ev) => !scheduleIds.has(ev.id));

  const all = [...scheduleRows, ...availableRows].sort(
    (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
  );

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {all.length === 0 && <Text style={s.empty}>No upcoming events found.</Text>}

      {all.map((ev) => {
        const isLive = ev.status === 'live';
        const isDone = ev.status === 'completed';
        const isOnSchedule = scheduleIds.has(ev.id);

        return (
          <View key={ev.id} style={[s.card, isLive && s.cardLive, isDone && s.cardDone]}>
            <Text
              style={[s.eventName, isLive && s.eventNameLive, isDone && s.eventNameDone]}
              numberOfLines={1}
            >
              {ev.name}
            </Text>
            <Text style={s.eventMeta}>
              {[ev.venue, ev.location].filter(Boolean).join(' · ')} · {fmtDate(ev.scheduledAt)}
            </Text>
            <View style={s.badges}>
              {isLive && (
                <View style={s.liveBadge}>
                  <Text style={s.liveBadgeText}>LIVE</Text>
                </View>
              )}
              {isDone && (
                <View style={s.doneBadge}>
                  <Text style={s.doneBadgeText}>COMPLETED</Text>
                </View>
              )}
              {isOnSchedule && !isLive && !isDone && (
                <View style={s.onScheduleBadge}>
                  <Text style={s.onScheduleText}>On Schedule</Text>
                </View>
              )}
              {(ev.matchupCount ?? 0) > 0 && <Text style={s.stat}>{ev.matchupCount} matchups</Text>}
              {ev.fightCount > 0 && <Text style={s.stat}>{ev.fightCount} fights</Text>}
            </View>
          </View>
        );
      })}

      <Text style={s.note}>
        Events within the season window are added automatically ~2 days after each event ends.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  content: { padding: 16 },

  empty: {
    color: '#555',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 40,
  },

  card: {
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 16,
    marginBottom: 8,
  },
  cardLive: { borderColor: '#c8102e', backgroundColor: '#1a0808' },
  cardDone: { opacity: 0.45 },

  eventName: { color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 4 },
  eventNameLive: { fontWeight: '700' },
  eventNameDone: { color: '#888' },
  eventMeta: { color: '#666', fontSize: 12, marginBottom: 8 },

  badges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  liveBadge: {
    backgroundColor: '#c8102e',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  liveBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  doneBadge: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#333',
  },
  doneBadgeText: { color: '#555', fontSize: 10, fontWeight: '700' },
  onScheduleBadge: {
    backgroundColor: '#1a2a1a',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#2a4a2a',
  },
  onScheduleText: { color: '#4caf50', fontSize: 10, fontWeight: '700' },
  stat: { color: '#555', fontSize: 12 },

  note: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
