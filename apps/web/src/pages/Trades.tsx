import { useQueryClient } from '@tanstack/react-query';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import type { Trade } from '@fantasy-ufc/shared';

export function TradesPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();

  const { data: members = [] } = useQuery<{ id: string; userId: string }[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });
  const myMemberId = members.find((m) => m.userId === session?.user.id)?.id;

  const { data: trades } = useQuery<(Trade & { proposingTeamName: string; receivingTeamName: string; proposingTeamId: string; receivingTeamId: string })[]>({
    queryKey: ['trades', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/trades`),
  });

  const acceptMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.post(`/leagues/${leagueId}/trades/${tradeId}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.post(`/leagues/${leagueId}/trades/${tradeId}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
  });

  const cancelMutation = useMutation({
    mutationFn: (tradeId: string) => apiClient.delete(`/leagues/${leagueId}/trades/${tradeId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trades', leagueId] }),
  });

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Trades</h1>
      {trades?.length === 0 && <p style={styles.empty}>No trades found.</p>}
      {trades?.map((trade) => (
        <div key={trade.id} style={styles.tradeCard}>
          <div style={styles.tradeHeader}>
            <span style={styles.teams}>{trade.proposingTeamName} → {trade.receivingTeamName}</span>
            <span style={{ ...styles.statusBadge, ...(styles[`status_${trade.status}`] ?? {}) }}>
              {trade.status}
            </span>
          </div>
          {trade.message && <p style={styles.message}>"{trade.message}"</p>}
          <p style={styles.expires}>Expires: {new Date(trade.expiresAt).toLocaleDateString()}</p>
          {trade.status === 'pending' && myMemberId && (
            <div style={styles.actions}>
              {(trade as any).receivingTeamId === myMemberId && (
                <>
                  <button style={styles.acceptBtn} onClick={() => acceptMutation.mutate(trade.id)}>Accept</button>
                  <button style={styles.rejectBtn} onClick={() => rejectMutation.mutate(trade.id)}>Reject</button>
                </>
              )}
              {(trade as any).proposingTeamId === myMemberId && (
                <button style={styles.cancelBtn} onClick={() => cancelMutation.mutate(trade.id)}>Cancel</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', padding: 24 },
  title: { color: '#fff', fontSize: 24, marginBottom: 24 },
  empty: { color: '#666', textAlign: 'center', padding: 40 },
  tradeCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20, marginBottom: 12 },
  tradeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  teams: { color: '#fff', fontWeight: 600, fontSize: 15 },
  statusBadge: { background: '#333', color: '#aaa', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700 },
  message: { color: '#888', fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  expires: { color: '#555', fontSize: 12 },
  actions: { display: 'flex', gap: 10, marginTop: 14 },
  acceptBtn: { background: '#1a3a1a', color: '#4caf50', border: '1px solid #4caf50', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700 },
  rejectBtn: { background: '#3a1a1a', color: '#ff5252', border: '1px solid #ff5252', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700 },
  cancelBtn: { background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: 6, padding: '7px 16px', cursor: 'pointer' },
};
