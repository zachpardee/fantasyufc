import { useState, useEffect } from 'react';
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

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
    enabled: !!league,
  });

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Commissioner Tools</span>
      </nav>
      {league && (
        <div style={styles.body}>
          <SettingsSection league={league} leagueId={leagueId!} qc={qc} />
          {currentEvent && <OddsSection eventId={currentEvent.id} eventName={currentEvent.name} qc={qc} />}
          <ScheduleSection league={league} leagueId={leagueId!} qc={qc} />
          <PlayoffsSection league={league} leagueId={leagueId!} qc={qc} />
          <DangerSection leagueId={leagueId!} qc={qc} navigate={navigate} />
        </div>
      )}
    </div>
  );
}

function OddsSection({ eventId, eventName }: { eventId: string; eventName: string; qc: any }) {
  const { data: adminFights, isLoading: fightsLoading, refetch } = useQuery<any[]>({
    queryKey: ['admin-event-fights', eventId],
    queryFn: () => apiClient.get(`/admin/events/${eventId}/fights`),
    retry: false,
  });

  const [oddsMap, setOddsMap] = useState<Record<string, { red: string; blue: string }>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Seed oddsMap from loaded fights
  useEffect(() => {
    if (!adminFights) return;
    const m: Record<string, { red: string; blue: string }> = {};
    for (const f of adminFights) {
      m[f.id] = {
        red: f.redFighterOdds != null ? String(f.redFighterOdds) : '',
        blue: f.blueFighterOdds != null ? String(f.blueFighterOdds) : '',
      };
    }
    setOddsMap(m);
  }, [adminFights]);

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
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: any) => setError(err?.error ?? 'Failed to save odds'),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiClient.post(`/admin/events/${eventId}/sync-odds`, {}),
    onSuccess: () => {
      refetch();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setError('');
    },
    onError: (err: any) => setError(err?.error ?? 'Sync failed'),
  });

  const fights = adminFights ?? [];

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Fight Odds — {eventName}</h2>
      <p style={{ ...styles.hint, marginBottom: 16 }}>
        Enter American-style moneyline odds (e.g. -250 or +180). You can also auto-sync from The Odds API if ODDS_API_KEY is configured.
      </p>

      {fightsLoading && <p style={styles.hint}>Loading fights...</p>}

      {fights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {[...fights].sort((a, b) => (b.boutOrder ?? 0) - (a.boutOrder ?? 0)).map((fight) => {
            const entry = oddsMap[fight.id] ?? { red: '', blue: '' };
            return (
              <div key={fight.id} style={oddsRowStyle}>
                <span style={oddsName}>{fight.redLastName ?? fight.redFirst}</span>
                <input
                  style={oddsInput}
                  placeholder="e.g. -250"
                  value={entry.red}
                  onChange={(e) => setOddsMap((m) => ({ ...m, [fight.id]: { ...entry, red: e.target.value } }))}
                />
                <span style={{ color: '#555', fontSize: 12 }}>vs</span>
                <input
                  style={oddsInput}
                  placeholder="e.g. +200"
                  value={entry.blue}
                  onChange={(e) => setOddsMap((m) => ({ ...m, [fight.id]: { ...entry, blue: e.target.value } }))}
                />
                <span style={oddsName}>{fight.blueLastName ?? fight.blueFirst}</span>
              </div>
            );
          })}
        </div>
      )}

      {error && <p style={styles.errMsg}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {saved && <span style={styles.savedMsg}>Saved!</span>}
        <button
          style={{ ...styles.saveBtn, background: '#1a3a1a', color: '#4ade80', border: '1px solid #2a5a2a' }}
          onClick={() => { setError(''); syncMutation.mutate(); }}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? 'Syncing...' : 'Auto-Sync Odds'}
        </button>
        <button
          style={styles.saveBtn}
          onClick={() => { setError(''); saveMutation.mutate(); }}
          disabled={saveMutation.isPending || fights.length === 0}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Odds'}
        </button>
      </div>
    </section>
  );
}

const oddsRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 90px 24px 90px 1fr',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  background: '#1a1a1a',
  borderRadius: 6,
};
const oddsName: React.CSSProperties = { color: '#ccc', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const oddsInput: React.CSSProperties = { background: '#111', border: '1px solid #333', borderRadius: 5, color: '#fff', fontSize: 13, padding: '6px 8px', outline: 'none', width: '100%', boxSizing: 'border-box', textAlign: 'center' };

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

function ScheduleSection({ league, leagueId, qc }: { league: any; leagueId: string; qc: any }) {
  const isStaking = league.leagueFormat === 'staking';

  // Current standings for playoff seeding preview
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    enabled: league.status === 'active',
  });

  const seeded = [...members]
    .filter((m) => m.isActive !== false)
    .sort((a, b) =>
      isStaking
        ? b.wins - a.wins || b.stakingBalance - a.stakingBalance
        : b.totalPoints - a.totalPoints || b.wins - a.wins,
    )
    .slice(0, 4);

  const [regenDone, setRegenDone] = useState(false);
  const regenMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/schedule/regenerate-matchups`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['matchups-all', leagueId] });
      qc.invalidateQueries({ queryKey: ['season-events', leagueId] });
      setRegenDone(true);
      setTimeout(() => setRegenDone(false), 3000);
    },
  });

  const { data: semisEvent } = useQuery<any>({
    queryKey: ['event', league.playoffSemisEventId],
    queryFn: () => apiClient.get(`/events/${league.playoffSemisEventId}`),
    enabled: !!league.playoffSemisEventId,
  });

  const [confirmStart, setConfirmStart] = useState(false);
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

  const canStartPlayoffs = league.status === 'active' && !!league.playoffSemisEventId && seeded.length >= 2;

  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>Matchup Schedule</h2>

      <div style={styles.actionRow}>
        <div>
          <div style={styles.actionLabel}>Regenerate Schedule</div>
          <div style={styles.actionHint}>
            Rebuilds all future matchups using a balanced round-robin. Completed matchups are preserved.
          </div>
        </div>
        <button
          style={{ ...styles.saveBtn, opacity: regenMutation.isPending ? 0.6 : 1 }}
          onClick={() => regenMutation.mutate()}
          disabled={regenMutation.isPending || league.status === 'completed'}
        >
          {regenMutation.isPending ? 'Regenerating...' : regenDone ? 'Done!' : 'Regenerate'}
        </button>
      </div>
      {regenMutation.isError && <p style={styles.errMsg}>{(regenMutation.error as any)?.error ?? 'Failed'}</p>}

      {canStartPlayoffs && (
        <div style={{ marginTop: 20 }}>
          <div style={styles.actionLabel}>Start Playoffs</div>
          <div style={styles.actionHint}>
            Semifinals: {semisEvent ? `${semisEvent.name}` : '—'}
          </div>

          <div style={{ ...styles.seedTable, marginTop: 10 }}>
            <div style={styles.seedHeader}>
              <span style={styles.seedCol}>#</span>
              <span style={{ flex: 1, color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Team</span>
              <span style={styles.seedStat}>{isStaking ? 'W' : 'PTS'}</span>
              <span style={styles.seedStat}>{isStaking ? 'Bankroll' : 'W'}</span>
            </div>
            {seeded.map((m, i) => (
              <div key={m.id} style={{ ...styles.seedRow, ...(i === 3 ? { borderBottom: 'none' } : {}) }}>
                <span style={styles.seedNum}>{i + 1}</span>
                <span style={styles.seedName}>{m.teamName}</span>
                <span style={{ ...styles.seedStat, color: '#ccc' }}>
                  {isStaking ? m.wins : (+m.totalPoints).toFixed(0)}
                </span>
                <span style={{ ...styles.seedStat, color: '#888' }}>
                  {isStaking ? (m.stakingBalance >= 0 ? `+$${(+m.stakingBalance).toFixed(0)}` : `-$${Math.abs(+m.stakingBalance).toFixed(0)}`) : m.wins}
                </span>
              </div>
            ))}
            {seeded.length > 2 && (
              <div style={styles.seedCutline}>
                <span style={styles.cutlineLabel}>— playoff cutline —</span>
              </div>
            )}
          </div>

          {!confirmStart ? (
            <button style={{ ...styles.saveBtn, marginTop: 12 }} onClick={() => setConfirmStart(true)}>
              Start Playoffs →
            </button>
          ) : (
            <div style={{ ...styles.confirmBox, marginTop: 12 }}>
              <p style={styles.confirmText}>
                Start playoffs with seeds 1–{seeded.length} above? This sets the league to playoff mode.
              </p>
              <div style={styles.confirmRow}>
                <button style={styles.cancelBtn} onClick={() => setConfirmStart(false)}>Cancel</button>
                <button
                  style={{ ...styles.saveBtn, opacity: startPlayoffsMutation.isPending ? 0.6 : 1 }}
                  onClick={() => startPlayoffsMutation.mutate()}
                  disabled={startPlayoffsMutation.isPending}
                >
                  {startPlayoffsMutation.isPending ? 'Starting...' : 'Confirm Start'}
                </button>
              </div>
              {startPlayoffsMutation.isError && (
                <p style={styles.errMsg}>{(startPlayoffsMutation.error as any)?.error ?? 'Failed'}</p>
              )}
            </div>
          )}
        </div>
      )}
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
  nav: { position: 'sticky' as const, top: 0, zIndex: 100, background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid #222', padding: '8px 20px', minHeight: 52, boxSizing: 'border-box' as const, display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  body: { padding: 24, display: 'flex', flexDirection: 'column', gap: 32, maxWidth: 720 },
  empty: { color: '#555', padding: 40, textAlign: 'center' },
  section: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  sectionTitle: { color: '#fff', fontSize: 15, fontWeight: 700, margin: '0 0 16px' },
  fieldGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 },
  label: { color: '#888', fontSize: 12, fontWeight: 600 },
  input: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none', width: '100%', boxSizing: 'border-box' as const },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, justifyContent: 'flex-end' },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  savedMsg: { color: '#4caf50', fontSize: 14 },
  errMsg: { color: '#ff5252', fontSize: 14, marginBottom: 8 },
  hint: { color: '#666', fontSize: 14, margin: '0 0 16px' },
  // Seed table
  seedTable: { border: '1px solid #242424', borderRadius: 8, overflow: 'hidden', marginBottom: 20 },
  seedHeader: { display: 'flex', alignItems: 'center', background: '#1a1a1a', padding: '7px 12px', gap: 8, borderBottom: '1px solid #2a2a2a' },
  seedCol: { width: 20, color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  seedStat: { width: 42, textAlign: 'right' as const, color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  seedReorder: { width: 52, display: 'flex', gap: 4, justifyContent: 'flex-end' as const },
  seedRow: { display: 'flex', alignItems: 'center', padding: '10px 12px', gap: 8, borderBottom: '1px solid #1a1a1a' },
  seedNum: { width: 20, color: '#c8102e', fontSize: 12, fontWeight: 700 },
  seedName: { flex: 1, color: '#fff', fontSize: 14, fontWeight: 600 },
  seedCutline: { background: '#111', borderBottom: '1px solid #2a2a2a', padding: '5px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' as const },
  cutlineLabel: { color: '#333', fontSize: 12 },
  arrowBtn: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 3, color: '#888', fontSize: 10, padding: '2px 5px', cursor: 'pointer', lineHeight: 1 },
  // Bracket display
  bracketBlock: { background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
  roundLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, margin: '0 0 8px' },
  matchupRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #1a1a1a', flexWrap: 'wrap' as const },
  mTeam: { flex: 1, color: '#aaa', fontSize: 14, fontWeight: 600 },
  mWinner: { color: '#fff' },
  mScore: { color: '#888', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  mEvent: { width: '100%', color: '#444', fontSize: 12, paddingLeft: 0, marginTop: 2 },
  advanceBlock: { marginTop: 16 },
  scheduleGrid: { display: 'flex', flexDirection: 'column' as const, gap: 0, border: '1px solid #242424', borderRadius: 8, overflow: 'hidden' },
  scheduleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid #1a1a1a' },
  scheduleLabel: { color: '#666', fontSize: 14 },
  scheduleVal: { color: '#ccc', fontSize: 14, fontWeight: 600, textAlign: 'right' as const, maxWidth: '60%' },
  // Confirm / danger
  dangerOutlineBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 6, color: '#ff5252', fontSize: 14, padding: '8px 16px', cursor: 'pointer' },
  deleteBtn: { background: '#3a1a1a', border: '1px solid #ff525444', borderRadius: 6, color: '#ff5252', fontSize: 14, fontWeight: 700, padding: '10px 20px', cursor: 'pointer' },
  confirmBox: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: 16, marginTop: 8 },
  confirmText: { color: '#ccc', fontSize: 14, margin: '0 0 16px' },
  confirmRow: { display: 'flex', gap: 10 },
  cancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 14, padding: '8px 16px', cursor: 'pointer' },
};
