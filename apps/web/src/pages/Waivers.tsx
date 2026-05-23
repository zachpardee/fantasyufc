import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

type Claim = {
  id: string;
  status: string;
  priority: number;
  submittedAt: string;
  processedAt?: string;
  denialReason?: string;
  fighterId: string;
  fighterName: string;
  weightClassName: string;
  dropFighterId?: string;
  dropFighterName?: string;
};

type FreeAgent = {
  id: string;
  firstName: string;
  lastName: string;
  weightClassName: string;
  ranking?: number;
  isChampion?: boolean;
  averageFantasyPoints?: number;
};

type RosterFighter = {
  fighterId: string;
  firstName: string;
  lastName: string;
  weightClassName: string;
};

export function WaiversPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [selectedFighter, setSelectedFighter] = useState<FreeAgent | null>(null);
  const [dropFighterId, setDropFighterId] = useState('');
  const [msg, setMsg] = useState('');

  const { data: claims = [], isLoading } = useQuery<Claim[]>({
    queryKey: ['waivers', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/waivers`),
  });

  const { data: freeAgents = [] } = useQuery<FreeAgent[]>({
    queryKey: ['free-agents', leagueId],
    queryFn: () => apiClient.get(`/fighters/leagues/${leagueId}/free-agents`),
    enabled: adding,
  });

  const { data: myRoster = [] } = useQuery<RosterFighter[]>({
    queryKey: ['roster', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/roster`),
    enabled: adding,
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/leagues/${leagueId}/waivers`, {
        fighterId: selectedFighter!.id,
        dropFighterId: dropFighterId || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waivers', leagueId] });
      setAdding(false);
      setSelectedFighter(null);
      setDropFighterId('');
      setMsg('Waiver claim submitted.');
      setTimeout(() => setMsg(''), 3000);
    },
    onError: (err: any) => {
      setMsg(err?.error ?? 'Failed to submit claim.');
      setTimeout(() => setMsg(''), 4000);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (claimId: string) =>
      apiClient.delete(`/leagues/${leagueId}/waivers/${claimId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waivers', leagueId] });
    },
  });

  const pending = claims.filter((c) => c.status === 'pending');
  const history = claims.filter((c) => c.status !== 'pending');

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Waivers</span>
        {!adding && (
          <button style={styles.addBtn} onClick={() => setAdding(true)}>+ New Claim</button>
        )}
      </nav>

      {msg && <div style={styles.flash}>{msg}</div>}

      {/* New claim form */}
      {adding && (
        <div style={styles.formCard}>
          <div style={styles.formHeader}>
            <span style={styles.formTitle}>Add Waiver Claim</span>
            <button style={styles.closeBtn} onClick={() => { setAdding(false); setSelectedFighter(null); setDropFighterId(''); }}>✕</button>
          </div>

          <div style={styles.formSection}>
            <div style={styles.formLabel}>Pick up (free agent)</div>
            {selectedFighter ? (
              <div style={styles.selectedFighter}>
                <span style={styles.selectedName}>{selectedFighter.firstName} {selectedFighter.lastName}</span>
                <span style={styles.selectedMeta}>{selectedFighter.weightClassName}</span>
                <button style={styles.clearBtn} onClick={() => setSelectedFighter(null)}>Change</button>
              </div>
            ) : (
              <div style={styles.faList}>
                {freeAgents.length === 0
                  ? <div style={styles.empty}>No free agents available.</div>
                  : freeAgents.slice(0, 30).map((f) => (
                    <button key={f.id} style={styles.faRow} onClick={() => setSelectedFighter(f)}>
                      <span style={styles.faName}>{f.firstName} {f.lastName}</span>
                      <span style={styles.faMeta}>
                        {f.isChampion ? 'C' : f.ranking ? `#${f.ranking}` : 'NR'} · {f.weightClassName}
                        {f.averageFantasyPoints != null ? ` · ${(+f.averageFantasyPoints).toFixed(1)} avg` : ''}
                      </span>
                    </button>
                  ))
                }
              </div>
            )}
          </div>

          {selectedFighter && (
            <div style={styles.formSection}>
              <div style={styles.formLabel}>Drop (optional — required if roster is full)</div>
              <select
                style={styles.select}
                value={dropFighterId}
                onChange={(e) => setDropFighterId(e.target.value)}
              >
                <option value="">— Keep everyone —</option>
                {myRoster.map((f) => (
                  <option key={f.fighterId} value={f.fighterId}>
                    {f.firstName} {f.lastName} ({f.weightClassName})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedFighter && (
            <button
              style={styles.submitBtn}
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? 'Submitting...' : 'Submit Claim'}
            </button>
          )}
        </div>
      )}

      {/* Pending claims */}
      <div style={styles.section}>
        <div style={styles.sectionTitle}>Pending Claims <span style={styles.count}>{pending.length}</span></div>
        {isLoading && <div style={styles.empty}>Loading...</div>}
        {!isLoading && pending.length === 0 && (
          <div style={styles.empty}>No pending claims.</div>
        )}
        {pending.map((c, i) => (
          <div key={c.id} style={styles.claimRow}>
            <div style={styles.claimPriority}>#{i + 1}</div>
            <div style={styles.claimInfo}>
              <span style={styles.claimFighter}>+ {c.fighterName}</span>
              {c.dropFighterName && <span style={styles.claimDrop}>− {c.dropFighterName}</span>}
              <span style={styles.claimMeta}>{c.weightClassName} · Submitted {new Date(c.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            <button
              style={styles.cancelBtn}
              onClick={() => cancelMutation.mutate(c.id)}
              disabled={cancelMutation.isPending}
            >
              Cancel
            </button>
          </div>
        ))}
      </div>

      {/* History */}
      {history.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Recent History</div>
          {history.map((c) => (
            <div key={c.id} style={styles.claimRow}>
              <div style={{
                ...styles.statusDot,
                background: c.status === 'approved' ? '#4caf50' : '#c8102e',
              }} />
              <div style={styles.claimInfo}>
                <span style={styles.claimFighter}>{c.fighterName}</span>
                {c.dropFighterName && <span style={styles.claimDrop}>− {c.dropFighterName}</span>}
                <span style={styles.claimMeta}>
                  {c.status.toUpperCase()}
                  {c.denialReason ? ` — ${c.denialReason}` : ''}
                  {c.processedAt ? ` · ${new Date(c.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  addBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  flash: { background: '#1a2a1a', borderBottom: '1px solid #4caf50', padding: '10px 24px', color: '#4caf50', fontSize: 14 },
  formCard: { margin: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20 },
  formHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  formTitle: { color: '#fff', fontWeight: 700, fontSize: 15 },
  closeBtn: { background: 'none', border: 'none', color: '#555', fontSize: 16, cursor: 'pointer' },
  formSection: { marginBottom: 16 },
  formLabel: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  faList: { maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 },
  faRow: { background: '#111', border: '1px solid #222', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', textAlign: 'left' },
  faName: { color: '#fff', fontSize: 14, fontWeight: 600 },
  faMeta: { color: '#555', fontSize: 12 },
  selectedFighter: { background: '#111', border: '1px solid #333', borderRadius: 6, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 },
  selectedName: { color: '#fff', fontSize: 14, fontWeight: 600, flex: 1 },
  selectedMeta: { color: '#555', fontSize: 12 },
  clearBtn: { background: 'none', border: '1px solid #444', borderRadius: 5, color: '#888', fontSize: 12, padding: '3px 10px', cursor: 'pointer' },
  select: { width: '100%', background: '#111', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none' },
  submitBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 7, padding: '11px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer', width: '100%' },
  section: { padding: '0 24px 24px' },
  sectionTitle: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '24px 0 10px', display: 'flex', alignItems: 'center', gap: 8 },
  count: { background: '#222', color: '#666', borderRadius: 10, padding: '2px 7px', fontSize: 11 },
  claimRow: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, padding: '12px 16px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 12 },
  claimPriority: { color: '#555', fontSize: 13, fontWeight: 700, width: 24, textAlign: 'center', flexShrink: 0 },
  statusDot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  claimInfo: { flex: 1, display: 'flex', flexDirection: 'column', gap: 2 },
  claimFighter: { color: '#fff', fontSize: 14, fontWeight: 600 },
  claimDrop: { color: '#c8102e', fontSize: 12 },
  claimMeta: { color: '#555', fontSize: 11 },
  cancelBtn: { background: 'transparent', border: '1px solid #333', borderRadius: 5, color: '#666', fontSize: 12, padding: '5px 12px', cursor: 'pointer', flexShrink: 0 },
  empty: { color: '#444', fontSize: 13, padding: '12px 0', fontStyle: 'italic' },
};
