import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';

type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
type TradeWindow = { open: boolean; deadline: string | null; reason: string | null };
type Member = { id: string; userId: string; teamName: string };
type RosterFighter = { fighterId: string; firstName: string; lastName: string; weightClassName: string };
type TradeFighterItem = { id: string; fromTeamId: string; toTeamId: string; fighterId: string; firstName: string; lastName: string };
type TradeRow = {
  id: string;
  status: TradeStatus;
  proposingTeamId: string;
  receivingTeamId: string;
  proposingTeamName: string;
  receivingTeamName: string;
  message: string | null;
  expiresAt: string;
  items: TradeFighterItem[];
};

export default function TradeScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();

  const [proposing, setProposing] = useState(false);
  const [targetTeamId, setTargetTeamId] = useState('');
  const [offering, setOffering] = useState<string[]>([]);
  const [requesting, setRequesting] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [err, setErr] = useState('');

  const { data: members = [] } = useQuery<Member[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const myMemberId = members.find((m) => m.userId === session?.user.id)?.id;

  const { data: tradeWindow } = useQuery<TradeWindow>({
    queryKey: ['trade-deadline', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/trades/deadline`),
  });

  const { data: trades = [], isLoading } = useQuery<TradeRow[]>({
    queryKey: ['trades', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/trades`),
  });

  const { data: myRoster = [] } = useQuery<RosterFighter[]>({
    queryKey: ['roster', leagueId, 'mine'],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster`),
    enabled: proposing,
  });

  const { data: theirRoster = [] } = useQuery<RosterFighter[]>({
    queryKey: ['roster', leagueId, targetTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster/${targetTeamId}`),
    enabled: proposing && !!targetTeamId,
  });

  function resetForm() {
    setProposing(false);
    setTargetTeamId('');
    setOffering([]);
    setRequesting([]);
    setMessage('');
    setErr('');
  }

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const proposeMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/trades`, {
      receivingTeamId: targetTeamId,
      offering,
      requesting,
      message: message.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] });
      resetForm();
    },
    onError: (e: any) => setErr(e?.error ?? 'Failed to propose trade.'),
  });

  const acceptMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.post(`/leagues/${leagueId}/trades/${tradeId}/accept`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trades', leagueId] });
      qc.invalidateQueries({ queryKey: ['roster', leagueId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.post(`/leagues/${leagueId}/trades/${tradeId}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.delete(`/leagues/${leagueId}/trades/${tradeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
  });

  const otherMembers = members.filter((m) => m.id !== myMemberId);
  const targetMember = members.find((m) => m.id === targetTeamId);
  const canSubmit = offering.length > 0 && requesting.length > 0 && !proposeMutation.isPending;

  if (proposing) {
    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.formHeader}>
          <Text style={styles.formTitle}>Propose Trade</Text>
          <TouchableOpacity onPress={resetForm}>
            <Text style={styles.cancelLink}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRADE WITH</Text>
          <View style={styles.pillRow}>
            {otherMembers.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={[styles.pill, targetTeamId === m.id && styles.pillActive]}
                onPress={() => { setTargetTeamId(m.id); setRequesting([]); }}
              >
                <Text style={[styles.pillText, targetTeamId === m.id && styles.pillTextActive]}>
                  {m.teamName}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {targetTeamId && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>YOU OFFER</Text>
              {myRoster.length === 0 && <Text style={styles.empty}>Your roster is empty</Text>}
              {myRoster.map((f) => (
                <TouchableOpacity
                  key={f.fighterId}
                  style={[styles.fighterChip, offering.includes(f.fighterId) && styles.chipSelected]}
                  onPress={() => toggle(offering, setOffering, f.fighterId)}
                >
                  <Text style={[styles.chipName, offering.includes(f.fighterId) && styles.chipNameSelected]}>
                    {f.firstName} {f.lastName}
                  </Text>
                  <Text style={styles.chipMeta}>{f.weightClassName}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>YOU REQUEST FROM {targetMember?.teamName.toUpperCase()}</Text>
              {theirRoster.length === 0 && <Text style={styles.empty}>Their roster is empty</Text>}
              {theirRoster.map((f) => (
                <TouchableOpacity
                  key={f.fighterId}
                  style={[styles.fighterChip, requesting.includes(f.fighterId) && styles.chipSelected]}
                  onPress={() => toggle(requesting, setRequesting, f.fighterId)}
                >
                  <Text style={[styles.chipName, requesting.includes(f.fighterId) && styles.chipNameSelected]}>
                    {f.firstName} {f.lastName}
                  </Text>
                  <Text style={styles.chipMeta}>{f.weightClassName}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>MESSAGE (OPTIONAL)</Text>
              <TextInput
                style={styles.msgInput}
                value={message}
                onChangeText={setMessage}
                placeholder="Add a note..."
                placeholderTextColor="#555"
                maxLength={500}
              />
            </View>

            {!!err && <Text style={styles.errMsg}>{err}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
              onPress={() => proposeMutation.mutate()}
              disabled={!canSubmit}
            >
              <Text style={styles.submitText}>
                {proposeMutation.isPending ? 'Sending...' : 'Send Trade Offer'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {tradeWindow && !tradeWindow.open && (
        <View style={styles.deadlineBanner}>
          <Text style={styles.deadlineText}>🔒 {tradeWindow.reason}</Text>
        </View>
      )}

      {tradeWindow?.open && tradeWindow.deadline && (
        <View style={styles.deadlineOpen}>
          <Text style={styles.deadlineOpenText}>
            Trade deadline:{' '}
            <Text style={styles.deadlineOpenDate}>
              {new Date(tradeWindow.deadline).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </Text>
          </Text>
        </View>
      )}

      {tradeWindow?.open && (
        <TouchableOpacity style={styles.proposeBtn} onPress={() => setProposing(true)}>
          <Text style={styles.proposeBtnText}>+ Propose Trade</Text>
        </TouchableOpacity>
      )}

      {isLoading && <ActivityIndicator color="#c8102e" style={{ marginTop: 40 }} />}

      {!isLoading && trades.length === 0 && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No trades yet</Text>
          <Text style={styles.emptySubtext}>Propose one above</Text>
        </View>
      )}

      {trades.map((trade) => {
        const statusColor = statusColors[trade.status] ?? '#666';
        const isMine = trade.proposingTeamId === myMemberId;
        const isReceiving = trade.receivingTeamId === myMemberId;
        const theyOffer = trade.items.filter((i) => i.fromTeamId === trade.proposingTeamId);
        const iOffer = trade.items.filter((i) => i.fromTeamId === trade.receivingTeamId);

        return (
          <View key={trade.id} style={styles.tradeCard}>
            <View style={styles.tradeHeader}>
              <Text style={styles.tradeTeams}>
                {trade.proposingTeamName} → {trade.receivingTeamName}
              </Text>
              <Text style={[styles.tradeBadge, { color: statusColor }]}>
                {trade.status.toUpperCase()}
              </Text>
            </View>

            <View style={styles.tradeItems}>
              <View style={styles.tradeItemsCol}>
                <Text style={styles.tradeItemsLabel}>{trade.proposingTeamName} sends</Text>
                {theyOffer.map((i) => (
                  <Text key={i.id} style={styles.tradeItemName}>{i.firstName} {i.lastName}</Text>
                ))}
              </View>
              <Text style={styles.tradeArrow}>⇄</Text>
              <View style={[styles.tradeItemsCol, styles.tradeItemsRight]}>
                <Text style={styles.tradeItemsLabel}>{trade.receivingTeamName} sends</Text>
                {iOffer.map((i) => (
                  <Text key={i.id} style={[styles.tradeItemName, styles.tradeItemNameRight]}>
                    {i.firstName} {i.lastName}
                  </Text>
                ))}
              </View>
            </View>

            {!!trade.message && (
              <Text style={styles.tradeMessage}>"{trade.message}"</Text>
            )}

            {trade.status === 'pending' && (
              <Text style={styles.tradeExpiry}>
                Expires {new Date(trade.expiresAt).toLocaleDateString()}
              </Text>
            )}

            {trade.status === 'pending' && (
              <View style={styles.tradeActions}>
                {isReceiving && (
                  <>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      onPress={() => acceptMutation.mutate(trade.id)}
                      disabled={acceptMutation.isPending}
                    >
                      <Text style={styles.acceptText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={() => rejectMutation.mutate(trade.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <Text style={styles.rejectText}>Reject</Text>
                    </TouchableOpacity>
                  </>
                )}
                {isMine && (
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => cancelMutation.mutate(trade.id)}
                    disabled={cancelMutation.isPending}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const statusColors: Record<TradeStatus, string> = {
  pending: '#888',
  accepted: '#4caf50',
  rejected: '#ff5252',
  cancelled: '#555',
  expired: '#555',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  deadlineBanner: {
    backgroundColor: '#1a1010', borderBottomWidth: 1, borderBottomColor: '#c8102e33',
    padding: 14, paddingHorizontal: 16,
  },
  deadlineText: { color: '#888', fontSize: 13 },
  deadlineOpen: { paddingHorizontal: 16, paddingVertical: 10 },
  deadlineOpenText: { color: '#666', fontSize: 12 },
  deadlineOpenDate: { color: '#aaa', fontWeight: '700' },

  proposeBtn: {
    margin: 16, backgroundColor: '#c8102e', borderRadius: 8,
    paddingVertical: 13, alignItems: 'center',
  },
  proposeBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  emptyState: { alignItems: 'center', padding: 48 },
  emptyTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptySubtext: { color: '#666', fontSize: 13 },

  tradeCard: {
    margin: 12, marginBottom: 4, backgroundColor: '#1a1a1a',
    borderRadius: 10, padding: 16, borderWidth: 1, borderColor: '#2a2a2a',
  },
  tradeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  tradeTeams: { color: '#fff', fontWeight: '600', fontSize: 14, flex: 1 },
  tradeBadge: { fontSize: 11, fontWeight: '700' },
  tradeItems: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  tradeItemsCol: { flex: 1 },
  tradeItemsRight: { alignItems: 'flex-end' },
  tradeItemsLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  tradeItemName: { color: '#ccc', fontSize: 13, marginBottom: 2 },
  tradeItemNameRight: { textAlign: 'right' },
  tradeArrow: { color: '#444', fontSize: 18, paddingHorizontal: 8, marginTop: 14 },
  tradeMessage: { color: '#777', fontSize: 12, fontStyle: 'italic', marginBottom: 8 },
  tradeExpiry: { color: '#555', fontSize: 11, marginBottom: 10 },
  tradeActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  acceptBtn: {
    flex: 1, backgroundColor: '#1a3a1a', borderRadius: 6, borderWidth: 1,
    borderColor: '#4caf50', paddingVertical: 8, alignItems: 'center',
  },
  acceptText: { color: '#4caf50', fontWeight: '700', fontSize: 13 },
  rejectBtn: {
    flex: 1, backgroundColor: '#3a1a1a', borderRadius: 6, borderWidth: 1,
    borderColor: '#ff5252', paddingVertical: 8, alignItems: 'center',
  },
  rejectText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    borderRadius: 6, borderWidth: 1, borderColor: '#444',
    paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center',
  },
  cancelBtnText: { color: '#666', fontSize: 13 },

  // Propose form
  formHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#222',
  },
  formTitle: { color: '#fff', fontWeight: '700', fontSize: 17 },
  cancelLink: { color: '#c8102e', fontSize: 14, fontWeight: '600' },

  section: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  sectionLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 10 },

  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderRadius: 20, borderWidth: 1, borderColor: '#333',
    paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#111',
  },
  pillActive: { borderColor: '#c8102e', backgroundColor: '#1a0a0a' },
  pillText: { color: '#888', fontSize: 13 },
  pillTextActive: { color: '#fff' },

  fighterChip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 12, borderRadius: 7, marginBottom: 6,
    backgroundColor: '#111', borderWidth: 1, borderColor: '#2a2a2a',
  },
  chipSelected: { borderColor: '#c8102e', backgroundColor: '#1a0a0a' },
  chipName: { color: '#888', fontSize: 14 },
  chipNameSelected: { color: '#fff' },
  chipMeta: { color: '#555', fontSize: 11 },

  msgInput: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 7,
    color: '#fff', fontSize: 14, padding: 12,
  },

  errMsg: { color: '#ff5252', fontSize: 13, paddingHorizontal: 16, marginBottom: 8 },

  submitBtn: {
    margin: 16, backgroundColor: '#c8102e', borderRadius: 8,
    paddingVertical: 13, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  empty: { color: '#555', fontSize: 13 },
});
