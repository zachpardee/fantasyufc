import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';

export default function CommissionerScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: league, isLoading } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
    enabled: !!league,
  });

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  const isCommissioner =
    session?.user?.id === league?.commissionerId ||
    session?.user?.id === league?.commissionerUserId;

  if (!isCommissioner) {
    return (
      <View style={s.center}>
        <Text style={s.empty}>Commissioner access only.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.container}>
      <SettingsSection league={league} leagueId={leagueId!} qc={qc} />
      {currentEvent && (
        <OddsSection eventId={currentEvent.id} eventName={currentEvent.name} qc={qc} />
      )}
      <ScheduleSection league={league} leagueId={leagueId!} qc={qc} />
      <DangerSection leagueId={leagueId!} qc={qc} onDeleted={() => router.replace('/(app)/')} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Settings ───────────────────────────────────────────────────────────────

function SettingsSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const [name, setName] = useState(league.name ?? '');
  const [maxTeams, setMaxTeams] = useState(String(league.maxTeams ?? 10));
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/leagues/${leagueId}`, { name, maxTeams: +maxTeams }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>League Settings</Text>
      <Text style={s.fieldLabel}>League Name</Text>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholderTextColor="#555"
        returnKeyType="done"
      />
      <Text style={[s.fieldLabel, { marginTop: 12 }]}>Max Teams</Text>
      <TextInput
        style={s.input}
        value={maxTeams}
        onChangeText={setMaxTeams}
        keyboardType="number-pad"
        returnKeyType="done"
      />
      {mutation.isError && (
        <Text style={s.errText}>{(mutation.error as any)?.error ?? 'Failed to save'}</Text>
      )}
      <View style={s.saveRow}>
        {saved && <Text style={s.savedText}>Saved!</Text>}
        <TouchableOpacity
          style={[s.saveBtn, mutation.isPending && s.btnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={mutation.isPending}
        >
          <Text style={s.saveBtnText}>{mutation.isPending ? 'Saving...' : 'Save Settings'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Odds ────────────────────────────────────────────────────────────────────

function OddsSection({ eventId, eventName, qc }: { eventId: string; eventName: string; qc: any }) {
  const { data: fights, isLoading, refetch } = useQuery<any[]>({
    queryKey: ['admin-event-fights', eventId],
    queryFn: () => apiClient.get(`/admin/events/${eventId}/fights`),
    retry: false,
  });

  const [oddsMap, setOddsMap] = useState<Record<string, { red: string; blue: string }>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!fights) return;
    const m: Record<string, { red: string; blue: string }> = {};
    for (const f of fights) {
      m[f.id] = {
        red: f.redFighterOdds != null ? String(f.redFighterOdds) : '',
        blue: f.blueFighterOdds != null ? String(f.blueFighterOdds) : '',
      };
    }
    setOddsMap(m);
  }, [fights]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(oddsMap).map(([fightId, v]) => ({
        fightId,
        redOdds: v.red !== '' ? Number(v.red) : null,
        blueOdds: v.blue !== '' ? Number(v.blue) : null,
      }));
      return apiClient.post(`/admin/events/${eventId}/odds/bulk`, entries);
    },
    onSuccess: () => {
      refetch();
      setSaved(true);
      setError('');
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => setError(err?.error ?? 'Failed to save odds'),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/events/${eventId}/sync-odds`, {}),
    onSuccess: () => {
      refetch();
      setSaved(true);
      setError('');
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => setError(err?.error ?? 'Sync failed'),
  });

  const sorted = [...(fights ?? [])].sort((a, b) => (b.boutOrder ?? 0) - (a.boutOrder ?? 0));

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Fight Odds — {eventName}</Text>
      <Text style={s.hint}>American-style moneyline (e.g. -250 or +180)</Text>

      {isLoading && <ActivityIndicator color="#c8102e" style={{ marginVertical: 12 }} />}

      {sorted.map((fight) => {
        const entry = oddsMap[fight.id] ?? { red: '', blue: '' };
        return (
          <View key={fight.id} style={s.oddsRow}>
            <Text style={s.oddsName} numberOfLines={1}>{fight.redLastName ?? fight.redFirst}</Text>
            <TextInput
              style={s.oddsInput}
              placeholder="-250"
              placeholderTextColor="#555"
              value={entry.red}
              onChangeText={(v) => setOddsMap((m) => ({ ...m, [fight.id]: { ...entry, red: v } }))}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={s.vsText}>vs</Text>
            <TextInput
              style={s.oddsInput}
              placeholder="+200"
              placeholderTextColor="#555"
              value={entry.blue}
              onChangeText={(v) => setOddsMap((m) => ({ ...m, [fight.id]: { ...entry, blue: v } }))}
              keyboardType="numbers-and-punctuation"
            />
            <Text style={s.oddsName} numberOfLines={1}>{fight.blueLastName ?? fight.blueFirst}</Text>
          </View>
        );
      })}

      {!!error && <Text style={s.errText}>{error}</Text>}

      <View style={[s.saveRow, { flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
        {saved && <Text style={s.savedText}>Saved!</Text>}
        <TouchableOpacity
          style={[s.syncBtn, syncMutation.isPending && s.btnDisabled]}
          onPress={() => { setError(''); syncMutation.mutate(); }}
          disabled={syncMutation.isPending}
        >
          <Text style={s.syncBtnText}>{syncMutation.isPending ? 'Syncing...' : 'Auto-Sync Odds'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.saveBtn, (saveMutation.isPending || !fights?.length) && s.btnDisabled]}
          onPress={() => { setError(''); saveMutation.mutate(); }}
          disabled={saveMutation.isPending || !fights?.length}
        >
          <Text style={s.saveBtnText}>{saveMutation.isPending ? 'Saving...' : 'Save Odds'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Schedule / Playoffs ─────────────────────────────────────────────────────

function ScheduleSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const [confirmStart, setConfirmStart] = useState(false);
  const [regenDone, setRegenDone] = useState(false);

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    enabled: league.status === 'active',
  });

  const { data: semisEvent } = useQuery<any>({
    queryKey: ['event', league.playoffSemisEventId],
    queryFn: () => apiClient.get(`/events/${league.playoffSemisEventId}`),
    enabled: !!league.playoffSemisEventId,
  });

  const regenMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/schedule/regenerate-matchups`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matchups-all', leagueId] });
      setRegenDone(true);
      setTimeout(() => setRegenDone(false), 3000);
    },
  });

  const startPlayoffsMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/start`, {
      semisEventId: league.playoffSemisEventId,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] });
      setConfirmStart(false);
    },
  });

  const isStaking = league.leagueFormat === 'staking';
  const seeded = [...members]
    .filter((m) => m.isActive !== false)
    .sort((a, b) =>
      isStaking
        ? b.wins - a.wins || (b.stakingBalance ?? 0) - (a.stakingBalance ?? 0)
        : (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || b.wins - a.wins,
    )
    .slice(0, 4);

  const canStartPlayoffs = league.status === 'active' && !!league.playoffSemisEventId && seeded.length >= 2;

  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>Matchup Schedule</Text>

      <View style={s.actionRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.actionLabel}>Regenerate Schedule</Text>
          <Text style={s.hint}>Rebuilds future matchups using balanced round-robin. Completed matchups are preserved.</Text>
        </View>
        <TouchableOpacity
          style={[s.saveBtn, (regenMutation.isPending || league.status === 'completed') && s.btnDisabled]}
          onPress={() => regenMutation.mutate()}
          disabled={regenMutation.isPending || league.status === 'completed'}
        >
          <Text style={s.saveBtnText}>
            {regenMutation.isPending ? 'Running...' : regenDone ? 'Done!' : 'Regenerate'}
          </Text>
        </TouchableOpacity>
      </View>
      {regenMutation.isError && <Text style={s.errText}>{(regenMutation.error as any)?.error ?? 'Failed'}</Text>}

      {canStartPlayoffs && (
        <View style={{ marginTop: 20 }}>
          <Text style={s.actionLabel}>Start Playoffs</Text>
          {semisEvent && <Text style={s.hint}>Semifinals event: {semisEvent.name}</Text>}

          {seeded.map((m, i) => (
            <View key={m.id} style={s.seedRow}>
              <Text style={s.seedNum}>#{i + 1}</Text>
              <Text style={s.seedName} numberOfLines={1}>{m.teamName}</Text>
              <Text style={s.seedStat}>
                {isStaking
                  ? ((m.stakingBalance ?? 0) >= 0 ? `+$${(+m.stakingBalance).toFixed(0)}` : `-$${Math.abs(+m.stakingBalance).toFixed(0)}`)
                  : `${(+(m.totalPoints ?? 0)).toFixed(0)} pts`}
              </Text>
            </View>
          ))}

          {!confirmStart ? (
            <TouchableOpacity style={[s.saveBtn, { marginTop: 12 }]} onPress={() => setConfirmStart(true)}>
              <Text style={s.saveBtnText}>Start Playoffs →</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.confirmBox}>
              <Text style={s.confirmText}>
                Start playoffs with seeds 1–{seeded.length} above? This sets the league to playoff mode.
              </Text>
              <View style={s.confirmRow}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setConfirmStart(false)}>
                  <Text style={s.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveBtn, { flex: 1 }, startPlayoffsMutation.isPending && s.btnDisabled]}
                  onPress={() => startPlayoffsMutation.mutate()}
                  disabled={startPlayoffsMutation.isPending}
                >
                  <Text style={s.saveBtnText}>
                    {startPlayoffsMutation.isPending ? 'Starting...' : 'Confirm Start'}
                  </Text>
                </TouchableOpacity>
              </View>
              {startPlayoffsMutation.isError && (
                <Text style={s.errText}>{(startPlayoffsMutation.error as any)?.error ?? 'Failed'}</Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Danger Zone ─────────────────────────────────────────────────────────────

function DangerSection({ leagueId, qc, onDeleted }: { leagueId: string; qc: any; onDeleted: () => void }) {
  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      onDeleted();
    },
  });

  const confirmDelete = () => {
    Alert.alert(
      'Delete League',
      'This will permanently delete the league and all its data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete League',
          style: 'destructive',
          onPress: () => deleteMutation.mutate(),
        },
      ],
    );
  };

  return (
    <View style={[s.section, s.dangerSection]}>
      <Text style={[s.sectionTitle, { color: '#ff5252' }]}>Danger Zone</Text>
      {deleteMutation.isError && (
        <Text style={s.errText}>{(deleteMutation.error as any)?.error ?? 'Failed to delete'}</Text>
      )}
      <TouchableOpacity style={s.deleteBtn} onPress={confirmDelete} disabled={deleteMutation.isPending}>
        <Text style={s.deleteBtnText}>{deleteMutation.isPending ? 'Deleting...' : 'Delete League'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  empty: { color: '#555', fontSize: 16 },

  section: {
    margin: 16, marginBottom: 0,
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 20,
  },
  dangerSection: { borderColor: '#3a1a1a' },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 16 },

  fieldLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  input: {
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#333',
    borderRadius: 8, color: '#fff', fontSize: 14, padding: 12,
  },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  saveBtn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  syncBtn: { backgroundColor: '#1a3a1a', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#2a5a2a' },
  syncBtnText: { color: '#4ade80', fontWeight: '700', fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  savedText: { color: '#4caf50', fontSize: 14 },
  errText: { color: '#ff5252', fontSize: 13, marginTop: 8 },
  hint: { color: '#666', fontSize: 13, marginBottom: 12, lineHeight: 18 },

  oddsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 10, marginBottom: 6,
  },
  oddsName: { flex: 1, color: '#ccc', fontSize: 12, fontWeight: '600' },
  oddsInput: {
    width: 70, backgroundColor: '#111', borderWidth: 1, borderColor: '#333',
    borderRadius: 6, color: '#fff', fontSize: 13, padding: 6, textAlign: 'center',
  },
  vsText: { color: '#555', fontSize: 12 },

  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionLabel: { color: '#ddd', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  seedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  seedNum: { color: '#c8102e', fontSize: 13, fontWeight: '700', width: 24 },
  seedName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  seedStat: { color: '#888', fontSize: 13 },

  confirmBox: { backgroundColor: '#1a1010', borderRadius: 8, borderWidth: 1, borderColor: '#3a1a1a', padding: 16, marginTop: 12, gap: 12 },
  confirmText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { backgroundColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  cancelBtnText: { color: '#aaa', fontSize: 14 },

  deleteBtn: { backgroundColor: '#3a1a1a', borderRadius: 8, borderWidth: 1, borderColor: '#ff525444', padding: 14, alignItems: 'center' },
  deleteBtnText: { color: '#ff5252', fontWeight: '700', fontSize: 14 },
});
