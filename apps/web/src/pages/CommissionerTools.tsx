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
          <PlayoffsSection league={league} leagueId={leagueId!} qc={qc} />
          <DangerSection leagueId={leagueId!} qc={qc} navigate={navigate} />
        </div>
      )}
    </div>
  );
}

function SettingsSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const [name, setName] = useState(league.name ?? '');
  const [maxTeams, setMaxTeams] = useState(String(league.maxTeams ?? 10));
  const [saved, setSaved] = useState(false);

  const mutation = useMutation({
    mutationFn: () => apiClient.patch(`/leagues/${leagueId}`, {
      name,
      maxTeams: +maxTeams,
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

function PlayoffsSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const { data: bracket, refetch: refetchBracket } = useQuery<any>({
    queryKey: ['playoffs-bracket', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/playoffs/bracket`),
    enabled: league.status === 'playoffs',
  });

  const { data: semisEvent } = useQuery<any>({
    queryKey: ['event', league.playoffSemisEventId],
    queryFn: () => apiClient.get(`/events/${league.playoffSemisEventId}`),
    enabled: !!league.playoffSemisEventId,
  });

  const { data: finalsEvent } = useQuery<any>({
    queryKey: ['event', league.playoffFinalsEventId],
    queryFn: () => apiClient.get(`/events/${league.playoffFinalsEventId}`),
    enabled: !!league.playoffFinalsEventId,
  });

  const advanceMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/playoffs/advance`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['playoffs-bracket', leagueId] });
      refetchBracket();
    },
  });

  const phase = bracket?.phase ?? 'none';
  const canAdvance = league.status === 'playoffs' && phase === 'semis';
  const inPlayoffs = league.status === 'playoffs';

  function fmtDate(iso: string | undefined) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Season Schedule</h2>

      {/* Season info */}
      {league.seasonEndsAt && (
        <div style={styles.scheduleGrid}>
          <div style={styles.scheduleRow}>
            <span style={styles.scheduleLabel}>Regular season ends</span>
            <span style={styles.scheduleVal}>{fmtDate(league.seasonEndsAt)}</span>
          </div>
          <div style={styles.scheduleRow}>
            <span style={styles.scheduleLabel}>Semifinals</span>
            <span style={styles.scheduleVal}>{semisEvent ? `${semisEvent.name} · ${fmtDate(semisEvent.scheduledAt)}` : '—'}</span>
          </div>
          <div style={styles.scheduleRow}>
            <span style={styles.scheduleLabel}>Finals</span>
            <span style={styles.scheduleVal}>{finalsEvent ? `${finalsEvent.name} · ${fmtDate(finalsEvent.scheduledAt)}` : '—'}</span>
          </div>
        </div>
      )}

      {!league.seasonEndsAt && (
        <p style={styles.hint}>
          {league.status === 'setup'
            ? 'Season schedule will be set automatically when you start the season.'
            : 'Season schedule not set. Re-activate the league to generate a schedule.'}
        </p>
      )}

      {/* Playoff bracket */}
      {inPlayoffs && bracket && (
        <>
          <div style={{ ...styles.bracketBlock, marginTop: league.seasonEndsAt ? 20 : 0 }}>
            {bracket.semisMatchups?.length > 0 && (
              <>
                <p style={styles.roundLabel}>Semifinals</p>
                {bracket.semisMatchups.map((m: any) => (
                  <MatchupRow key={m.id} matchup={m} isStaking={bracket.isStaking} />
                ))}
              </>
            )}
            {bracket.finalsMatchup && (
              <>
                <p style={styles.roundLabel}>Finals</p>
                <MatchupRow matchup={bracket.finalsMatchup} isStaking={bracket.isStaking} />
              </>
            )}
          </div>

          {canAdvance && (
            <div style={styles.advanceBlock}>
              {advanceMutation.isError && (
                <p style={styles.errMsg}>{(advanceMutation.error as any)?.error ?? 'Failed to advance'}</p>
              )}
              <button
                style={styles.saveBtn}
                onClick={() => advanceMutation.mutate()}
                disabled={advanceMutation.isPending}
              >
                {advanceMutation.isPending ? 'Advancing...' : 'Advance to Finals'}
              </button>
            </div>
          )}

        </>
      )}
    </section>
  );
}

function fmtMatchupScore(n: number, isStaking: boolean): string {
  if (!isStaking) return n.toFixed(0);
  const abs = Math.abs(n);
  const s = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  return n < 0 ? `(${s})` : s;
}

function MatchupRow({ matchup, isStaking = false }: { matchup: any; isStaking?: boolean }) {
  const home = +matchup.homeScore;
  const away = +matchup.awayScore;
  const homeWon = matchup.winnerId === matchup.homeTeamId;
  const awayWon = matchup.winnerId === matchup.awayTeamId;
  return (
    <div style={styles.matchupRow}>
      <span style={{ ...styles.mTeam, ...(homeWon ? styles.mWinner : {}) }}>
        {matchup.homeTeamName}
      </span>
      <span style={styles.mScore}>{fmtMatchupScore(home, isStaking)} – {fmtMatchupScore(away, isStaking)}</span>
      <span style={{ ...styles.mTeam, textAlign: 'right', ...(awayWon ? styles.mWinner : {}) }}>
        {matchup.awayTeamName}
      </span>
      {matchup.eventName && (
        <span style={styles.mEvent}>{matchup.eventName}</span>
      )}
    </div>
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
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 16px' },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  label: { color: '#888', fontSize: 12, fontWeight: 600 },
  input: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  savedMsg: { color: '#4caf50', fontSize: 13 },
  errMsg: { color: '#ff5252', fontSize: 13, marginBottom: 8 },
  hint: { color: '#666', fontSize: 13, margin: '0 0 16px' },
  // Seed table
  seedTable: { border: '1px solid #2a2a2a', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  seedHeader: { display: 'flex', alignItems: 'center', background: '#1a1a1a', padding: '7px 12px', gap: 8, borderBottom: '1px solid #2a2a2a' },
  seedCol: { width: 20, color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  seedStat: { width: 42, textAlign: 'right' as const, color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  seedReorder: { width: 52, display: 'flex', gap: 4, justifyContent: 'flex-end' as const },
  seedRow: { display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8, borderBottom: '1px solid #1a1a1a' },
  seedNum: { width: 20, color: '#c8102e', fontSize: 12, fontWeight: 800 },
  seedName: { flex: 1, color: '#fff', fontSize: 13, fontWeight: 600 },
  seedCutline: { background: '#111', borderBottom: '1px solid #2a2a2a', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' as const },
  cutlineLabel: { color: '#333', fontSize: 11 },
  arrowBtn: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 3, color: '#888', fontSize: 10, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 },
  // Bracket display
  bracketBlock: { background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
  roundLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 8px' },
  matchupRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' as const },
  mTeam: { flex: 1, color: '#aaa', fontSize: 13, fontWeight: 600 },
  mWinner: { color: '#fff' },
  mScore: { color: '#888', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  mEvent: { width: '100%', color: '#444', fontSize: 11, paddingLeft: 0, marginTop: 2 },
  advanceBlock: { marginTop: 16 },
  scheduleGrid: { display: 'flex', flexDirection: 'column' as const, gap: 0, border: '1px solid #1e1e1e', borderRadius: 8, overflow: 'hidden' },
  scheduleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #1a1a1a' },
  scheduleLabel: { color: '#666', fontSize: 13 },
  scheduleVal: { color: '#ccc', fontSize: 13, fontWeight: 600, textAlign: 'right' as const, maxWidth: '60%' },
  // Confirm / danger
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 6, color: '#ff5252', fontSize: 13, padding: '8px 16px', cursor: 'pointer' },
  deleteBtn: { background: '#3a1a1a', border: '1px solid #ff525444', borderRadius: 6, color: '#ff5252', fontSize: 13, fontWeight: 700, padding: '10px 20px', cursor: 'pointer' },
  confirmBox: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: 16, marginTop: 8 },
  confirmText: { color: '#ccc', fontSize: 14, margin: '0 0 16px' },
  confirmRow: { display: 'flex', gap: 10 },
  cancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 13, padding: '8px 16px', cursor: 'pointer' },
};
