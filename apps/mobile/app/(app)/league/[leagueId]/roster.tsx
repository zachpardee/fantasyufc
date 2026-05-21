import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { apiClient } from '../../../../src/api/client';

type SlotType = 'starter' | 'bench';

interface RosterFighter {
  fighter_id: string;
  first_name: string;
  last_name: string;
  weight_class: string;
  status: string;
  slot_type: SlotType;
  slot_position: number | null;
  acquired_via: string;
  average_points: number | null;
}

export default function RosterScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const queryClient = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [pendingSlots, setPendingSlots] = useState<Record<string, SlotType>>({});

  const { data: fighters = [], isLoading } = useQuery<RosterFighter[]>({
    queryKey: ['roster', leagueId, 'mine'],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster`),
  });

  const saveLineup = useMutation({
    mutationFn: () => {
      const slots = fighters.map((f) => ({
        fighterId: f.fighter_id,
        slotType: pendingSlots[f.fighter_id] ?? f.slot_type,
        slotPosition: f.slot_position,
      }));
      return apiClient.post(`/leagues/${leagueId}/roster/set-lineup`, { slots });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roster', leagueId] });
      setEditMode(false);
      setPendingSlots({});
    },
  });

  const toggleSlot = (fighterId: string, current: SlotType) => {
    setPendingSlots((prev) => ({
      ...prev,
      [fighterId]: current === 'starter' ? 'bench' : 'starter',
    }));
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  if (!fighters.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>Your roster is empty</Text>
        <Text style={styles.emptySubtext}>Fighters added via draft or waivers appear here</Text>
      </View>
    );
  }

  const displayFighters = fighters.map((f) => ({
    ...f,
    slot_type: (pendingSlots[f.fighter_id] ?? f.slot_type) as SlotType,
  }));

  const starters = displayFighters.filter((f) => f.slot_type === 'starter');
  const bench = displayFighters.filter((f) => f.slot_type === 'bench');

  return (
    <ScrollView style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.rosterCount}>{fighters.length} fighters</Text>
        {editMode ? (
          <View style={styles.editActions}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setEditMode(false); setPendingSlots({}); }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saveLineup.isPending && styles.disabledBtn]}
              onPress={() => saveLineup.mutate()}
              disabled={saveLineup.isPending}
            >
              <Text style={styles.saveText}>
                {saveLineup.isPending ? 'Saving...' : 'Save Lineup'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.editBtn} onPress={() => setEditMode(true)}>
            <Text style={styles.editText}>Edit Lineup</Text>
          </TouchableOpacity>
        )}
      </View>

      <Section title="STARTERS" count={starters.length}>
        {starters.map((f) => (
          <FighterRow
            key={f.fighter_id}
            fighter={f}
            editMode={editMode}
            onToggle={() => toggleSlot(f.fighter_id, f.slot_type)}
            isPending={pendingSlots[f.fighter_id] !== undefined}
          />
        ))}
        {starters.length === 0 && (
          <Text style={styles.sectionEmpty}>No starters set — tap Edit Lineup</Text>
        )}
      </Section>

      <Section title="BENCH" count={bench.length}>
        {bench.map((f) => (
          <FighterRow
            key={f.fighter_id}
            fighter={f}
            editMode={editMode}
            onToggle={() => toggleSlot(f.fighter_id, f.slot_type)}
            isPending={pendingSlots[f.fighter_id] !== undefined}
          />
        ))}
        {bench.length === 0 && (
          <Text style={styles.sectionEmpty}>Bench is empty</Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionCount}>{count}</Text>
      </View>
      {children}
    </View>
  );
}

function FighterRow({
  fighter, editMode, onToggle, isPending,
}: {
  fighter: RosterFighter & { slot_type: SlotType };
  editMode: boolean;
  onToggle: () => void;
  isPending: boolean;
}) {
  const statusColor = fighter.status === 'active' ? '#4caf50' : fighter.status === 'injured' ? '#ff9800' : '#666';

  return (
    <View style={[styles.fighterRow, isPending && styles.pendingRow]}>
      <View style={styles.fighterInfo}>
        <View style={styles.fighterNameRow}>
          <Text style={styles.fighterName}>{fighter.first_name} {fighter.last_name}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>
        <Text style={styles.fighterMeta}>
          {fighter.weight_class.replace(/_/g, ' ')} · via {fighter.acquired_via}
        </Text>
      </View>

      <View style={styles.fighterRight}>
        {fighter.average_points !== null && (
          <Text style={styles.avgPts}>{fighter.average_points.toFixed(1)} avg</Text>
        )}
        {editMode && (
          <TouchableOpacity
            style={[styles.slotToggle, fighter.slot_type === 'starter' ? styles.starterToggle : styles.benchToggle]}
            onPress={onToggle}
          >
            <Text style={styles.slotToggleText}>
              {fighter.slot_type === 'starter' ? 'Move to Bench' : 'Start'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a', padding: 32 },
  empty: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtext: { color: '#666', fontSize: 14, textAlign: 'center' },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#222',
  },
  rosterCount: { color: '#666', fontSize: 13 },
  editActions: { flexDirection: 'row', gap: 8 },
  editBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#c8102e' },
  editText: { color: '#c8102e', fontSize: 13, fontWeight: '600' },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#555' },
  cancelText: { color: '#999', fontSize: 13, fontWeight: '600' },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 6, backgroundColor: '#c8102e' },
  disabledBtn: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  section: { marginTop: 8 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  sectionTitle: { color: '#c8102e', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  sectionCount: { color: '#555', fontSize: 12 },
  sectionEmpty: { color: '#555', fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  fighterRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  pendingRow: { backgroundColor: '#1a1100' },
  fighterInfo: { flex: 1 },
  fighterNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  fighterName: { color: '#fff', fontSize: 15, fontWeight: '600' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  fighterMeta: { color: '#666', fontSize: 12 },
  fighterRight: { alignItems: 'flex-end', gap: 6 },
  avgPts: { color: '#888', fontSize: 12 },
  slotToggle: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5 },
  starterToggle: { backgroundColor: '#2a2a2a' },
  benchToggle: { backgroundColor: '#c8102e22', borderWidth: 1, borderColor: '#c8102e' },
  slotToggleText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
