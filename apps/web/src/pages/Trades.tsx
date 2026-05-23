import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import type { Trade } from '@fantasy-ufc/shared';

type TradeRow = Trade & {
  proposingTeamName: string;
  receivingTeamName: string;
  proposingTeamId: string;
  receivingTeamId: string;
};

type Member = { id: string; userId: string; teamName: string };
type RosterFighter = { id: string; fighterId: string; firstName: string; lastName: string; weightClassName: string };

export function TradesPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
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

  const { data: trades } = useQuery<TradeRow[]>({
    queryKey: ['trades', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/trades`),
  });

  const { data: myRoster = [] } = useQuery<RosterFighter[]>({
    queryKey: ['roster', leagueId],
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

  function toggleId(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  const otherMembers = members.filter((m) => m.id !== myMemberId);
  const targetMember = members.find((m) => m.id === targetTeamId);

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Trades</span>
        {!proposing && (
          <button style={styles.proposeBtn} onClick={() => setProposing(true)}>+ Propose Trade</button>
        )}
      </nav>

      {/* Propose trade form */}
      {proposing && (
        <div style={styles.formCard}>
          <div style={styles.formHeader}>
            <span style={styles.formTitle}>Propose Trade</span>
            <button style={styles.closeBtn} onClick={resetForm}>✕</button>
          </div>

          {/* Step 1: pick opponent */}
          <div style={styles.formSection}>
            <div style={styles.formLabel}>Trade with</div>
            <div style={styles.teamPills}>
              {otherMembers.map((m) => (
                <button
                  key={m.id}
                  style={{ ...styles.teamPill, ...(targetTeamId === m.id ? styles.teamPillActive : {}) }}
                  onClick={() => { setTargetTeamId(m.id); setRequesting([]); }}
                >
                  {m.teamName}
                </button>
              ))}
            </div>
          </div>

          {targetTeamId && (
            <>
              {/* Step 2: fighters to offer */}
              <div style={styles.formSection}>
                <div style={styles.formLabel}>You offer</div>
                <div style={styles.fighterGrid}>
                  {myRoster.map((f) => (
                    <button
                      key={f.fighterId}
                      style={{ ...styles.fighterChip, ...(offering.includes(f.fighterId) ? styles.fighterChipSelected : {}) }}
                      onClick={() => toggleId(offering, setOffering, f.fighterId)}
                    >
                      {f.firstName} {f.lastName}
                      <span style={styles.chipMeta}>{f.weightClassName}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: fighters to request */}
              <div style={styles.formSection}>
                <div style={styles.formLabel}>You request from {targetMember?.teamName}</div>
                <div style={styles.fighterGrid}>
                  {theirRoster.map((f) => (
                    <button
                      key={f.fighterId}
                      style={{ ...styles.fighterChip, ...(requesting.includes(f.fighterId) ? styles.fighterChipSelected : {}) }}
                      onClick={() => toggleId(requesting, setRequesting, f.fighterId)}
                    >
                      {f.firstName} {f.lastName}
                      <span style={styles.chipMeta}>{f.weightClassName}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional message */}
              <div style={styles.formSection}>
                <div style={styles.formLabel}>Message (optional)</div>
                <input
                  style={styles.msgInput}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Add a note..."
                  maxLength={200}
                />
              </div>

              {err && <div style={styles.errMsg}>{err}</div>}

              <button
                style={{
                  ...styles.submitBtn,
                  ...(!offering.length || !requesting.length || proposeMutation.isPending ? styles.submitBtnDisabled : {}),
                }}
                disabled={!offering.length || !requesting.length || proposeMutation.isPending}
                onClick={() => proposeMutation.mutate()}
              >
                {proposeMutation.isPending ? 'Sending...' : `Send Trade Offer`}
              </button>
            </>
          )}
        </div>
      )}

      {/* Trade list */}
      {!proposing && trades?.length === 0 && (
        <div style={styles.empty}>No trades yet. Propose one!</div>
      )}

      {trades?.map((trade) => (
        <div key={trade.id} style={styles.tradeCard}>
          <div style={styles.tradeHeader}>
            <span style={styles.teams}>{trade.proposingTeamName} → {trade.receivingTeamName}</span>
            <span style={{ ...styles.statusBadge, ...(statusColors[trade.status] ?? {}) }}>
              {trade.status}
            </span>
          </div>
          {trade.message && <p style={styles.message}>"{trade.message}"</p>}
          <p style={styles.expires}>Expires: {new Date(trade.expiresAt).toLocaleDateString()}</p>
          {trade.status === 'pending' && myMemberId && (
            <div style={styles.actions}>
              {trade.receivingTeamId === myMemberId && (
                <>
                  <button style={styles.acceptBtn} onClick={() => acceptMutation.mutate(trade.id)}>Accept</button>
                  <button style={styles.rejectBtn} onClick={() => rejectMutation.mutate(trade.id)}>Reject</button>
                </>
              )}
              {trade.proposingTeamId === myMemberId && (
                <button style={styles.cancelBtn} onClick={() => cancelMutation.mutate(trade.id)}>Cancel</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const statusColors: Record<string, React.CSSProperties> = {
  accepted: { color: '#4caf50' },
  rejected: { color: '#ff5252' },
  cancelled: { color: '#555' },
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  proposeBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  formCard: { margin: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20 },
  formHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { color: '#fff', fontWeight: 700, fontSize: 15 },
  closeBtn: { background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer' },
  formSection: { marginBottom: 16 },
  formLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  teamPills: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  teamPill: { background: '#111', border: '1px solid #333', borderRadius: 20, color: '#888', padding: '6px 14px', fontSize: 13, cursor: 'pointer' },
  teamPillActive: { border: '1px solid #c8102e', color: '#fff', background: '#1a0a0a' },
  fighterGrid: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  fighterChip: { background: '#111', border: '1px solid #2a2a2a', borderRadius: 6, color: '#888', padding: '7px 12px', fontSize: 12, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' },
  fighterChipSelected: { border: '1px solid #c8102e', color: '#fff', background: '#1a0a0a' },
  chipMeta: { color: '#555', fontSize: 10 },
  msgInput: { width: '100%', background: '#111', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 13, padding: '9px 12px', outline: 'none', boxSizing: 'border-box' },
  errMsg: { color: '#ff5252', fontSize: 13, marginBottom: 10 },
  submitBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' },
  submitBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  empty: { color: '#555', textAlign: 'center', padding: '60px 24px', fontSize: 14, fontStyle: 'italic' },
  tradeCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20, margin: '0 24px 12px' },
  tradeHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  teams: { color: '#fff', fontWeight: 600, fontSize: 15 },
  statusBadge: { background: '#222', color: '#888', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700 },
  message: { color: '#888', fontSize: 13, fontStyle: 'italic', marginBottom: 6 },
  expires: { color: '#555', fontSize: 12 },
  actions: { display: 'flex', gap: 10, marginTop: 14 },
  acceptBtn: { background: '#1a3a1a', color: '#4caf50', border: '1px solid #4caf50', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  rejectBtn: { background: '#3a1a1a', color: '#ff5252', border: '1px solid #ff5252', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontWeight: 700, fontSize: 13 },
  cancelBtn: { background: 'transparent', color: '#666', border: '1px solid #444', borderRadius: 6, padding: '7px 16px', cursor: 'pointer', fontSize: 13 },
};
