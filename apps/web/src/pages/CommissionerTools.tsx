import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function CommissionerToolsPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const isCommissioner = session?.user.id === league?.commissionerId;

  if (league && !isCommissioner) {
    return <div style={styles.page}><div style={styles.empty}>Commissioner access only.</div></div>;
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Commissioner Tools</span>
      </nav>
      {league && (
        <div style={styles.body}>
          <SettingsSection league={league} leagueId={leagueId!} qc={qc} />
          <RosterSection leagueId={leagueId!} />
          <DangerSection leagueId={leagueId!} qc={qc} navigate={navigate} />
        </div>
      )}
    </div>
  );
}

function SettingsSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const [name, setName] = useState(league.name ?? '');
  const [maxTeams, setMaxTeams] = useState(String(league.maxTeams ?? 10));
  const [rosterSize, setRosterSize] = useState(String(league.rosterSize ?? 10));
  const [starterSlots, setStarterSlots] = useState(String(league.starterSlots ?? 5));
  const [tradeDeadlineDays, setTradeDeadlineDays] = useState(String(league.tradeDeadlineDays ?? 3));
  const [draftPickTime, setDraftPickTime] = useState(String(league.draftPickTimeSeconds ?? 90));
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/leagues/${leagueId}`, {
      name,
      maxTeams: +maxTeams,
      rosterSize: +rosterSize,
      starterSlots: +starterSlots,
      tradeDeadlineDays: +tradeDeadlineDays,
      draftPickTimeSeconds: +draftPickTime,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>League Settings</h2>
      <div style={styles.fieldGrid}>
        <Field label="League Name">
          <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Max Teams">
          <input style={styles.input} type="number" min={2} max={20} value={maxTeams} onChange={(e) => setMaxTeams(e.target.value)} />
        </Field>
        <Field label="Roster Size">
          <input style={styles.input} type="number" min={5} max={20} value={rosterSize} onChange={(e) => setRosterSize(e.target.value)} />
        </Field>
        <Field label="Starter Slots">
          <input style={styles.input} type="number" min={1} max={10} value={starterSlots} onChange={(e) => setStarterSlots(e.target.value)} />
        </Field>
        <Field label="Trade Deadline (days before event)">
          <input style={styles.input} type="number" min={0} max={14} value={tradeDeadlineDays} onChange={(e) => setTradeDeadlineDays(e.target.value)} />
        </Field>
        <Field label="Draft Pick Timer (seconds)">
          <input style={styles.input} type="number" min={30} max={300} value={draftPickTime} onChange={(e) => setDraftPickTime(e.target.value)} />
        </Field>
      </div>
      <div style={styles.saveRow}>
        {saved && <span style={styles.savedMsg}>Saved!</span>}
        {mutation.isError && <span style={styles.errMsg}>{(mutation.error as any)?.error ?? 'Failed to save'}</span>}
        <button style={styles.saveBtn} onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </section>
  );
}

function RosterSection({ leagueId }: { leagueId: string }) {
  const qc = useQueryClient();
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const [addSearch, setAddSearch] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const { data: allFighters = [] } = useQuery<any[]>({
    queryKey: ['fighters-all'],
    queryFn: () => apiClient.get('/fighters?status=active'),
  });

  const rosterQueries = useQuery<Record<string, any[]>>({
    queryKey: ['all-rosters-comm', leagueId],
    queryFn: async () => {
      const results: Record<string, any[]> = {};
      await Promise.all(members.map(async (m) => {
        const r = await apiClient.get<any[]>(`/leagues/${leagueId}/roster/${m.id}`);
        results[m.id] = r;
      }));
      return results;
    },
    enabled: members.length > 0,
  });

  const dropMutation = useMutation({
    mutationFn: ({ memberId, fighterId }: { memberId: string; fighterId: string }) =>
      apiClient.delete(`/leagues/${leagueId}/roster/${memberId}/${fighterId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['all-rosters-comm', leagueId] }),
  });

  const addMutation = useMutation({
    mutationFn: ({ memberId, fighterId }: { memberId: string; fighterId: string }) =>
      apiClient.post(`/leagues/${leagueId}/roster/${memberId}/add`, { fighterId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-rosters-comm', leagueId] });
      setAddingTo(null);
      setAddSearch('');
    },
  });

  const rosters = rosterQueries.data ?? {};

  const rostered = new Set(
    Object.values(rosters).flat().map((f: any) => f.fighterId ?? f.id),
  );
  const freeAgents = allFighters.filter((f: any) => !rostered.has(f.id) &&
    (addSearch === '' || `${f.firstName} ${f.lastName}`.toLowerCase().includes(addSearch.toLowerCase())),
  );

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Roster Management</h2>
      {members.map((m) => {
        const fighters: any[] = rosters[m.id] ?? [];
        const expanded = expandedMember === m.id;
        return (
          <div key={m.id} style={styles.teamCard}>
            <button style={styles.teamHeader} onClick={() => setExpandedMember(expanded ? null : m.id)}>
              <span style={styles.teamName}>{m.teamName}</span>
              <span style={styles.teamMeta}>{m.username} · {fighters.length} fighters</span>
              <span style={styles.chevron}>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
              <div style={styles.teamBody}>
                {fighters.map((f) => (
                  <div key={f.fighterId ?? f.id} style={styles.rosterRow}>
                    {f.imageUrl && (
                      <div style={{ width: 30, height: 34, borderRadius: 3, overflow: 'hidden', flexShrink: 0, background: '#222' }}>
                        <img src={f.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                      </div>
                    )}
                    <span style={styles.rosterName}>{f.firstName} {f.lastName}</span>
                    <span style={styles.rosterMeta}>{f.weightClassName}</span>
                    <button
                      style={styles.dropBtn}
                      onClick={() => dropMutation.mutate({ memberId: m.id, fighterId: f.fighterId ?? f.id })}
                      disabled={dropMutation.isPending}
                    >Drop</button>
                  </div>
                ))}
                {addingTo === m.id ? (
                  <div style={styles.addPanel}>
                    <input
                      style={{ ...styles.input, marginBottom: 8 }}
                      placeholder="Search free agents..."
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      autoFocus
                    />
                    <div style={styles.faList}>
                      {freeAgents.slice(0, 20).map((f: any) => (
                        <button key={f.id} style={styles.faRow}
                          onClick={() => addMutation.mutate({ memberId: m.id, fighterId: f.id })}
                          disabled={addMutation.isPending}
                        >
                          <span>{f.firstName} {f.lastName}</span>
                          <span style={{ color: '#555', fontSize: 11 }}>{f.weightClassName}</span>
                        </button>
                      ))}
                      {freeAgents.length === 0 && <div style={{ color: '#555', fontSize: 13, padding: 8 }}>No free agents match</div>}
                    </div>
                    <button style={styles.cancelBtn} onClick={() => { setAddingTo(null); setAddSearch(''); }}>Cancel</button>
                  </div>
                ) : (
                  <button style={styles.addBtn} onClick={() => setAddingTo(m.id)}>+ Add Fighter</button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

function DangerSection({ leagueId, qc, navigate }: { leagueId: string; qc: any; navigate: any }) {
  const [confirming, setConfirming] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      navigate('/');
    },
  });

  return (
    <section style={{ ...styles.section, borderColor: '#3a1a1a' }}>
      <h2 style={{ ...styles.sectionTitle, color: '#ff5252' }}>Danger Zone</h2>
      {!confirming ? (
        <button style={styles.deleteBtn} onClick={() => setConfirming(true)}>Delete League</button>
      ) : (
        <div style={styles.confirmBox}>
          <p style={styles.confirmText}>This will permanently delete the league and all its data. Are you sure?</p>
          <div style={styles.confirmRow}>
            <button style={styles.cancelBtn} onClick={() => setConfirming(false)}>Cancel</button>
            <button style={styles.deleteBtn} onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete League'}
            </button>
          </div>
          {deleteMutation.isError && <p style={styles.errMsg}>{(deleteMutation.error as any)?.error ?? 'Failed to delete'}</p>}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  body: { padding: 24, display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 720 },
  empty: { color: '#555', padding: 40, textAlign: 'center' },
  section: { background: '#111', border: '1px solid #222', borderRadius: 12, padding: 24 },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 20px' },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { color: '#888', fontSize: 12, fontWeight: 600 },
  input: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  savedMsg: { color: '#4caf50', fontSize: 13 },
  errMsg: { color: '#ff5252', fontSize: 13 },
  teamCard: { border: '1px solid #2a2a2a', borderRadius: 8, marginBottom: 10, overflow: 'hidden' },
  teamHeader: { width: '100%', background: '#1a1a1a', border: 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' },
  teamName: { color: '#fff', fontWeight: 600, fontSize: 14, flex: 1 },
  teamMeta: { color: '#555', fontSize: 12 },
  chevron: { color: '#555', fontSize: 11 },
  teamBody: { background: '#141414', padding: 12 },
  rosterRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #1e1e1e' },
  rosterName: { color: '#ddd', fontSize: 13, flex: 1 },
  rosterMeta: { color: '#555', fontSize: 12 },
  dropBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 4, color: '#ff5252', fontSize: 11, padding: '3px 10px', cursor: 'pointer' },
  addBtn: { background: 'transparent', border: '1px dashed #333', borderRadius: 6, color: '#888', fontSize: 12, padding: '8px 16px', cursor: 'pointer', width: '100%', marginTop: 8 },
  addPanel: { marginTop: 8 },
  faList: { maxHeight: 200, overflowY: 'auto', border: '1px solid #2a2a2a', borderRadius: 6, marginBottom: 8 },
  faRow: { width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a', color: '#ddd', fontSize: 13, padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' },
  cancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 13, padding: '8px 16px', cursor: 'pointer' },
  deleteBtn: { background: '#3a1a1a', border: '1px solid #ff525244', borderRadius: 6, color: '#ff5252', fontSize: 13, fontWeight: 700, padding: '10px 20px', cursor: 'pointer' },
  confirmBox: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: 16 },
  confirmText: { color: '#ccc', fontSize: 14, margin: '0 0 16px' },
  confirmRow: { display: 'flex', gap: 10 },
};
