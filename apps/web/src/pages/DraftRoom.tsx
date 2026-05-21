import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import type { DraftSession, DraftPick, DraftOrder } from '@fantasy-ufc/shared';

type ApiDraftState = {
  session: DraftSession;
  picks: DraftPick[];
  order: (DraftOrder & { teamName: string; username: string })[];
};

type AvailableFighter = {
  id: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  weightClassName?: string;
  averageFantasyPoints?: number;
  ranking?: number;
  isChampion: boolean;
};

export function DraftRoomPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const [timeLeft, setTimeLeft] = useState(0);

  const { data: draft, refetch, isError } = useQuery<ApiDraftState>({
    queryKey: ['draft', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft`),
    retry: false,
  });

  const { data: availableFighters = [], refetch: refetchFighters } = useQuery<AvailableFighter[]>({
    queryKey: ['draft-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft/available`),
    enabled: draft?.session.status === 'active' || draft?.session.status === 'paused',
  });

  const { data: league } = useQuery<{ commissionerId: string; status: string; memberCount: number }>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<{ id: string; userId: string }[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  // Real-time draft updates
  useEffect(() => {
    if (!leagueId) return;
    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('broadcast', { event: 'pick_made' }, () => { refetch(); refetchFighters(); })
      .on('broadcast', { event: 'auto_pick' }, () => { refetch(); refetchFighters(); })
      .on('broadcast', { event: 'draft_started' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leagueId, refetch, refetchFighters]);

  // Countdown timer
  useEffect(() => {
    if (!draft?.session.currentPickDeadline) return;
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor(
        (new Date(draft.session.currentPickDeadline!).getTime() - Date.now()) / 1000,
      )));
    }, 1000);
    return () => clearInterval(id);
  }, [draft?.session.currentPickDeadline]);

  const pickMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.post(`/leagues/${leagueId}/draft/pick`, { fighterId }),
    onSuccess: () => { refetch(); refetchFighters(); },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/pause`, {}),
    onSuccess: () => refetch(),
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/resume`, {}),
    onSuccess: () => refetch(),
  });

  // No draft started yet
  if (isError || !draft) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
          <span style={styles.navTitle}>Draft Room</span>
        </nav>
        <div style={styles.lobby}>
          <p style={styles.lobbyTitle}>Draft hasn't started yet</p>
          <p style={styles.lobbyMeta}>
            {league?.commissionerId === session?.user.id
              ? 'Go to the league home page to start the draft when everyone has joined.'
              : 'Waiting for the commissioner to start the draft.'}
          </p>
          <Link to={`/league/${leagueId}`} style={styles.lobbyLink}>← Back to League</Link>
        </div>
      </div>
    );
  }

  const { session: draftSession, picks, order } = draft;
  const isCompleted = draftSession.status === 'completed';
  const isPaused = draftSession.status === 'paused';
  const isCommissioner = league?.commissionerId === session?.user.id;

  // Find my league member ID
  const myMemberId = members.find((m) => m.userId === session?.user.id)?.id;

  const isMyTurn = draftSession.currentTeamId === myMemberId;
  const currentTeamEntry = order.find((o) => o.leagueMemberId === draftSession.currentTeamId);

  // Group picks by round
  const memberCount = order.length;
  const roundPicks = Array.from({ length: draftSession.totalRounds }, (_, r) =>
    picks.filter((p) => p.roundNumber === r + 1),
  );

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <div style={styles.draftMeta}>
          <span style={styles.roundLabel}>Round {draftSession.currentRound} / {draftSession.totalRounds}</span>
          <span style={styles.pickLabel}>Pick #{draftSession.currentPick}</span>
        </div>
        {!isCompleted && (
          <div style={{ ...styles.timer, ...(timeLeft <= 10 && !isPaused ? styles.timerUrgent : {}) }}>
            {isPaused ? '⏸' : `${timeLeft}s`}
          </div>
        )}
        <span style={statusBadgeStyle(draftSession.status)}>{draftSession.status.toUpperCase()}</span>
        {isCommissioner && !isCompleted && (
          <div style={styles.commControls}>
            {isPaused ? (
              <button style={styles.controlBtn} onClick={() => resumeMutation.mutate()} disabled={resumeMutation.isPending}>
                Resume
              </button>
            ) : (
              <button style={styles.controlBtn} onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
                Pause
              </button>
            )}
          </div>
        )}
      </nav>

      {isCompleted ? (
        <div style={styles.completeBanner}>
          <p style={styles.completeTitle}>Draft Complete!</p>
          <p style={styles.completeMeta}>All {memberCount * draftSession.totalRounds} picks have been made.</p>
          <Link to={`/league/${leagueId}/roster`} style={styles.completeLink}>View My Roster →</Link>
        </div>
      ) : (
        <div style={styles.turnBanner}>
          {isMyTurn
            ? <span style={styles.myTurnText}>Your pick!</span>
            : <span style={styles.waitingText}>On the clock: {currentTeamEntry?.teamName ?? '...'}</span>
          }
        </div>
      )}

      <div style={styles.layout}>
        {/* Draft board */}
        <div style={styles.board}>
          <p style={styles.panelTitle}>Draft Board</p>
          {order.length > 0 && (
            <div style={styles.boardHeader}>
              {order.map((o) => (
                <div key={o.leagueMemberId} style={{
                  ...styles.boardTeam,
                  ...(o.leagueMemberId === draftSession.currentTeamId && !isCompleted ? styles.boardTeamActive : {}),
                }}>
                  {o.teamName}
                </div>
              ))}
            </div>
          )}
          {roundPicks.map((rPicks, r) => (
            <div key={r} style={styles.round}>
              <div style={styles.roundHeader}>Round {r + 1}</div>
              <div style={styles.picksRow}>
                {order.map((o) => {
                  const pick = rPicks.find((p) => p.leagueMemberId === o.leagueMemberId);
                  return (
                    <div key={o.leagueMemberId} style={styles.pickSlot}>
                      {pick?.fighterId ? (
                        <>
                          <div style={styles.pickFighter}>
                            {(pick as any).firstName} {(pick as any).lastName}
                          </div>
                          {pick.autoPicked && <div style={styles.autoTag}>AUTO</div>}
                        </>
                      ) : (
                        <div style={styles.pickEmpty}>—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Available fighters sidebar */}
        {!isCompleted && (
          <div style={styles.sidebar}>
            <p style={styles.panelTitle}>
              Available Fighters
              <span style={styles.availCount}>{availableFighters.length}</span>
            </p>
            {pickMutation.isError && (
              <p style={styles.pickError}>{(pickMutation.error as any)?.error ?? 'Pick failed'}</p>
            )}
            <div style={styles.fighterList}>
              {availableFighters.map((f) => (
                <div
                  key={f.id}
                  style={{
                    ...styles.fighterRow,
                    ...(isMyTurn && !isPaused ? styles.fighterRowClickable : styles.fighterRowDisabled),
                  }}
                  onClick={() => isMyTurn && !isPaused && pickMutation.mutate(f.id)}
                >
                  <div style={styles.fighterLeft}>
                    {f.isChampion && <span style={styles.champ}>C</span>}
                    <div>
                      <div style={styles.fighterName}>{f.firstName} {f.lastName}</div>
                      {f.weightClassName && <div style={styles.fighterWC}>{f.weightClassName}</div>}
                    </div>
                  </div>
                  <div style={styles.fighterMeta}>
                    <span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span>
                    <span style={styles.pts}>{f.averageFantasyPoints?.toFixed(1) ?? '--'} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    active: '#4caf50', paused: '#ffd700', completed: '#888', pending: '#8888ff',
  };
  return { background: '#222', color: colors[status] ?? '#888', fontSize: 11, padding: '4px 10px', borderRadius: 4, fontWeight: 700 };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' },
  nav: {
    background: '#111', borderBottom: '1px solid #222',
    padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
  },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 13 },
  navTitle: { color: '#fff', fontWeight: 700 },
  draftMeta: { display: 'flex', flexDirection: 'column', gap: 2, flex: 1 },
  roundLabel: { color: '#888', fontSize: 11, fontWeight: 600 },
  pickLabel: { color: '#fff', fontSize: 18, fontWeight: 800 },
  timer: {
    background: '#333', borderRadius: '50%', width: 52, height: 52,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0,
  },
  timerUrgent: { background: '#c8102e' },
  commControls: { display: 'flex', gap: 8 },
  controlBtn: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 6, color: '#ccc', padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  turnBanner: {
    background: '#141414', borderBottom: '1px solid #2a2a2a',
    padding: '10px 20px', textAlign: 'center',
  },
  myTurnText: { color: '#4caf50', fontWeight: 800, fontSize: 16 },
  waitingText: { color: '#888', fontSize: 14 },
  completeBanner: {
    background: '#1a1a1a', borderBottom: '1px solid #333',
    padding: '32px 24px', textAlign: 'center',
  },
  completeTitle: { color: '#fff', fontSize: 22, fontWeight: 800, margin: '0 0 6px' },
  completeMeta: { color: '#888', fontSize: 14, margin: '0 0 16px' },
  completeLink: { color: '#c8102e', textDecoration: 'none', fontWeight: 700, fontSize: 14 },
  layout: { display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 },
  board: { flex: 1, overflow: 'auto', padding: 16 },
  panelTitle: { color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 },
  availCount: { background: '#333', color: '#aaa', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 },
  boardHeader: { display: 'flex', gap: 6, marginBottom: 8 },
  boardTeam: { flex: 1, color: '#555', fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '4px 2px', borderRadius: 4 },
  boardTeamActive: { background: '#1a2a1a', color: '#4caf50' },
  round: { marginBottom: 12 },
  roundHeader: { color: '#555', fontSize: 11, fontWeight: 700, marginBottom: 6 },
  picksRow: { display: 'flex', gap: 6 },
  pickSlot: {
    flex: 1, minWidth: 0, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
    padding: '8px 10px', position: 'relative',
  },
  pickFighter: { color: '#ddd', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  pickEmpty: { color: '#333', fontSize: 12, textAlign: 'center' },
  autoTag: { position: 'absolute', top: 3, right: 3, background: '#444', color: '#888', fontSize: 8, padding: '1px 3px', borderRadius: 2 },
  sidebar: { width: 320, background: '#111', borderLeft: '1px solid #222', overflow: 'auto', padding: 16, flexShrink: 0 },
  pickError: { color: '#ff6b6b', fontSize: 12, margin: '0 0 8px' },
  fighterList: { display: 'flex', flexDirection: 'column', gap: 3 },
  fighterRow: {
    background: '#1a1a1a', borderRadius: 6, padding: '10px 12px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    border: '1px solid #252525',
  },
  fighterRowClickable: { cursor: 'pointer' },
  fighterRowDisabled: { opacity: 0.5, cursor: 'default' },
  fighterLeft: { display: 'flex', alignItems: 'center', gap: 8 },
  champ: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3, flexShrink: 0 },
  fighterName: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  fighterWC: { color: '#555', fontSize: 11, marginTop: 1 },
  fighterMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 12 },
  pts: { color: '#666', fontSize: 11 },
  lobby: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48 },
  lobbyTitle: { color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px' },
  lobbyMeta: { color: '#888', fontSize: 14, margin: '0 0 24px', textAlign: 'center', maxWidth: 400 },
  lobbyLink: { color: '#c8102e', textDecoration: 'none', fontWeight: 600 },
};
