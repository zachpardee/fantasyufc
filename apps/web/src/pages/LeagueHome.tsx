import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { LoadingScreen } from '../components/LoadingScreen';
import { useIsMobile } from '../hooks/useIsMobile';
import type { League, LeagueMember, Matchup } from '@fantasy-ufc/shared';

export function LeagueHomePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [copyMsg, setCopyMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; teamName: string }[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<(LeagueMember & { username: string; displayName?: string })[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const { data: unreadCount, refetch: refetchUnread } = useQuery<{ count: number }>({
    queryKey: ['notif-unread'],
    queryFn: () => apiClient.get('/notifications/unread-count'),
    refetchInterval: 60_000,
  });

  const { data: notifications = [], refetch: refetchNotifs } = useQuery<import('@fantasy-ufc/shared').Notification[]>({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/notifications'),
    enabled: showNotifs,
  });

  const { data: currentEvent } = useQuery<{ id: string; name: string; venue: string; location: string; scheduledAt: string; status: string } | null>({
    queryKey: ['current-event', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/picks/current-event`) as any; }
      catch { return null; }
    },
    enabled: !!league && (league.status === 'active' || league.status === 'playoffs'),
  });

  const { data: matchup } = useQuery<(Matchup & { homeTeamName: string; awayTeamName: string; eventName: string; eventStatus: string }) | null>({
    queryKey: ['matchup-current', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/matchups/current`) as any; }
      catch { return null; }
    },
    enabled: !!league && (league.status === 'active' || league.status === 'playoffs'),
    refetchInterval: (query) => (query.state.data as any)?.eventStatus === 'live' ? 30_000 : false,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all', {}),
    onSuccess: () => { refetchUnread(); refetchNotifs(); },
  });

  function openNotifs() {
    setShowNotifs((v) => {
      if (!v) {
        refetchNotifs();
        if ((unreadCount?.count ?? 0) > 0) markAllReadMutation.mutate();
      }
      return !v;
    });
  }

  const renameMutation = useMutation({
    mutationFn: (name: string) => apiClient.patch(`/leagues/${leagueId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      setEditingName(false);
    },
  });

  const renameTeamMutation = useMutation({
    mutationFn: (teamName: string) => apiClient.patch(`/leagues/${leagueId}/members/me`, { teamName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] });
      setEditingTeamName(false);
    },
  });

  const startDraftMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/start`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      navigate(`/league/${leagueId}/draft`);
    },
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteLeagueMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      navigate('/');
    },
  });

  const membersRef = useRef(members);
  useEffect(() => { membersRef.current = members; }, [members]);

  // Track presence: who's on this league page right now
  // Only re-run when leagueId/session change — not on every members refetch,
  // which would create ghost presences from rapid channel reconnects.
  useEffect(() => {
    if (!leagueId || !session) return;

    const channel = supabase.channel(`league-presence:${leagueId}`, {
      config: { presence: { key: session.user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string; teamName: string }>();
        const seen = new Map<string, { userId: string; teamName: string }>();
        Object.values(state).flatMap((s) => s).forEach((u) => seen.set(u.userId, u));
        setOnlineUsers(Array.from(seen.values()));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const myMember = membersRef.current.find((m) => m.userId === session.user.id);
          const teamName = myMember?.teamName ?? session.user.email ?? 'Unknown';
          await channel.track({ userId: session.user.id, teamName });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [leagueId, session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!league) return <LoadingScreen />;

  const isCommissioner = session?.user.id === league.commissionerId;
  const canStartDraft = isCommissioner && league.status === 'setup' && (league.memberCount ?? 0) >= 2;
  const myMember = members.find((m) => m.userId === session?.user.id);

  const champion = members.find((m) => m.isChampion);
  const showChampionBanner = league.status === 'completed' && !!champion && !!league.completedAt
    && Date.now() - new Date(league.completedAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  function copyInviteCode() {
    navigator.clipboard.writeText(league!.inviteCode);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  const navLinks = [
    { label: 'My Roster', path: 'roster', icon: '👊', show: league.status !== 'setup' },
    { label: 'Picks', path: 'picks', icon: '🎯', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Matchup', path: 'matchup', icon: '⚔️', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Standings', path: 'standings', icon: '📊', show: league.status !== 'setup' },
    { label: 'Trades', path: 'trades', icon: '🤝', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Draft', path: 'draft', icon: '📋', show: league.status === 'drafting' },
    { label: 'Schedule', path: 'schedule', icon: '📅', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Playoffs', path: 'playoffs', icon: '🏆', show: league.status === 'playoffs' || (league.status === 'active' && isCommissioner) },
    { label: 'Rules', path: 'rules', icon: '📋', show: true },
    { label: 'Fighters', path: '/fighters', icon: '🥊', external: true, show: true },
    { label: 'Commissioner', path: 'commissioner', icon: '⚙️', show: isCommissioner },
  ];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logoLink}>
          <img src="/logo.jpg" alt="FFL" style={styles.logo} />
        </Link>
        <span style={{ flex: 1 }} />
        <div style={styles.bellWrap}>
          <button style={styles.bellBtn} onClick={openNotifs} title="Notifications">
            🔔
            {(unreadCount?.count ?? 0) > 0 && (
              <span style={styles.bellBadge}>{unreadCount!.count}</span>
            )}
          </button>
          {showNotifs && (
            <div style={styles.notifPanel}>
              <div style={styles.notifHeader}>
                <span style={styles.notifTitle}>Notifications</span>
                <button style={styles.notifClose} onClick={() => setShowNotifs(false)}>✕</button>
              </div>
              {notifications.length === 0
                ? <div style={styles.notifEmpty}>No notifications yet</div>
                : notifications.map((n) => (
                  <div key={n.id} style={{ ...styles.notifItem, ...(!n.isRead ? styles.notifUnread : {}) }}>
                    <div style={styles.notifItemTitle}>{n.title}</div>
                    <div style={styles.notifItemBody}>{n.body}</div>
                    <div style={styles.notifItemTime}>{new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
        <span style={statusStyle(league.status)}>{league.status.toUpperCase()}</span>
        {onlineUsers.length > 0 && (
          <div style={styles.onlineRow}>
            {onlineUsers.map((u) => {
              const memberId = members.find((m) => m.userId === u.userId)?.id;
              return (
                <div
                  key={u.userId}
                  style={{
                    ...styles.onlineAvatar,
                    background: u.userId === session?.user.id ? '#1a3a1a' : '#1a1a3a',
                    borderColor: u.userId === session?.user.id ? '#4caf50' : '#5555ff',
                    cursor: memberId ? 'pointer' : 'default',
                  }}
                  title={u.teamName}
                  onClick={() => memberId && navigate(`/league/${leagueId}/team/${memberId}`)}
                >
                  {u.teamName.charAt(0).toUpperCase()}
                </div>
              );
            })}
            <span style={styles.onlineCount}>{onlineUsers.length} online</span>
          </div>
        )}
      </nav>

      {/* League name header */}
      <div style={styles.leagueHeader}>
        {editingName ? (
          <form
            style={styles.nameForm}
            onSubmit={(e) => { e.preventDefault(); renameMutation.mutate(nameInput.trim()); }}
          >
            <input
              style={styles.nameInput}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              autoFocus
              maxLength={100}
            />
            <button type="submit" style={styles.nameSaveBtn} disabled={renameMutation.isPending || !nameInput.trim()}>Save</button>
            <button type="button" style={styles.nameCancelBtn} onClick={() => setEditingName(false)}>Cancel</button>
          </form>
        ) : (
          <div style={styles.leagueNameRow}>
            <span style={styles.leagueName}>{league.name}</span>
            {isCommissioner && (
              <button
                style={styles.editNameBtn}
                onClick={() => { setNameInput(league.name); setEditingName(true); }}
              >✎</button>
            )}
          </div>
        )}
        <div style={styles.leagueMeta}>
          <span>Season {league.seasonYear}</span>
          <span style={styles.metaDot}>·</span>
          <span>{league.memberCount} / {league.maxTeams} teams</span>
          <span style={styles.metaDot}>·</span>
          <span>{league.rosterSize}-man roster</span>
          {league.status === 'setup' && (
            <>
              <span style={styles.metaDot}>·</span>
              <span style={styles.inviteInline}>Code: <strong>{league.inviteCode}</strong></span>
            </>
          )}
        </div>
        {myMember && (
          <div style={styles.myTeamRow}>
            {editingTeamName ? (
              <form
                style={styles.teamNameForm}
                onSubmit={(e) => { e.preventDefault(); renameTeamMutation.mutate(teamNameInput.trim()); }}
              >
                <input
                  style={styles.teamNameInput}
                  value={teamNameInput}
                  onChange={(e) => setTeamNameInput(e.target.value)}
                  autoFocus
                  maxLength={100}
                />
                <button type="submit" style={styles.nameSaveBtn} disabled={renameTeamMutation.isPending || !teamNameInput.trim()}>Save</button>
                <button type="button" style={styles.nameCancelBtn} onClick={() => setEditingTeamName(false)}>Cancel</button>
              </form>
            ) : (
              <>
                <span style={styles.myTeamName}>{myMember.teamName}</span>
                <button
                  style={styles.editNameBtn}
                  onClick={() => { setTeamNameInput(myMember.teamName); setEditingTeamName(true); }}
                >✎</button>
                <span style={styles.myTeamDot}>·</span>
                <span style={styles.myTeamPts}>{(+myMember.totalPoints).toFixed(0)} pts</span>
                <span style={styles.myTeamDot}>·</span>
                <span style={styles.myTeamRecord}>{myMember.wins}–{myMember.losses}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Current matchup banner */}
      {matchup && (() => {
        const home = +matchup.homeScore;
        const away = +matchup.awayScore;
        const isLive = matchup.eventStatus === 'live';
        const diff = Math.abs(home - away);
        const leading = home > away ? matchup.homeTeamName : away > home ? matchup.awayTeamName : null;
        return (
          <div style={styles.matchupBanner}>
            <div style={styles.matchupEventRow}>
              <span style={styles.matchupEventName}>{matchup.eventName ?? 'Current Event'}</span>
              {isLive && <span style={styles.livePip}>LIVE</span>}
            </div>
            <div style={styles.matchupScoreRow}>
              <div style={styles.matchupTeam}>
                <div style={styles.matchupAvatar}>{matchup.homeTeamName?.charAt(0).toUpperCase()}</div>
                <div style={styles.matchupTeamName}>{matchup.homeTeamName}</div>
                <div style={{ ...styles.matchupScore, color: home > away ? '#fff' : '#666' }}>{home.toFixed(0)}</div>
              </div>
              <div style={styles.matchupVs}>
                {leading
                  ? <span style={styles.leadLabel}>{leading} leads by {diff.toFixed(0)}</span>
                  : <span style={styles.tiedLabel}>TIED</span>}
              </div>
              <div style={{ ...styles.matchupTeam, alignItems: 'flex-end' }}>
                <div style={styles.matchupAvatar}>{matchup.awayTeamName?.charAt(0).toUpperCase()}</div>
                <div style={styles.matchupTeamName}>{matchup.awayTeamName}</div>
                <div style={{ ...styles.matchupScore, color: away > home ? '#fff' : '#666' }}>{away.toFixed(0)}</div>
              </div>
            </div>
            <Link to={`/league/${leagueId}/matchup`} style={styles.detailsBtn}>Matchup Details →</Link>
          </div>
        );
      })()}

      {/* Champion banner */}
      {showChampionBanner && (
        <div style={styles.championBanner}>
          <span style={styles.championTrophy}>🏆</span>
          <div style={styles.championText}>
            <span style={styles.championLabel}>League Champion</span>
            <span style={styles.championName}>{champion!.teamName}</span>
          </div>
        </div>
      )}

      {/* Setup / pre-draft lobby */}
      {league.status === 'setup' && (
        <div style={styles.lobbyCard}>
          <div style={styles.lobbyHeader}>
            <div>
              <p style={styles.lobbyTitle}>Waiting for players</p>
              <p style={styles.lobbyMeta}>{league.memberCount} / {league.maxTeams} teams joined</p>
            </div>
            <div style={styles.inviteSection}>
              <p style={styles.inviteLabel}>Invite code</p>
              <div style={styles.inviteRow}>
                <span style={styles.inviteCode}>{league.inviteCode}</span>
                <button style={styles.copyBtn} onClick={copyInviteCode}>
                  {copyMsg || 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div style={styles.memberGrid}>
            {members.map((m) => (
              <div key={m.id} style={styles.memberCard}>
                <span style={styles.memberTeam}>{m.teamName}</span>
                <span style={styles.memberUser}>@{m.username}</span>
                {m.userId === league.commissionerId && (
                  <span style={styles.commBadge}>Commissioner</span>
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, league.maxTeams - members.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ ...styles.memberCard, ...styles.memberCardEmpty }}>
                <span style={styles.memberEmpty}>Open slot</span>
              </div>
            ))}
          </div>

          {isCommissioner && (
            <div style={styles.commActions}>
              {(league.memberCount ?? 0) < 2 && (
                <p style={styles.draftHint}>Need at least 2 teams to start the draft</p>
              )}
              <button
                style={{ ...styles.startDraftBtn, ...(!canStartDraft ? styles.startDraftDisabled : {}) }}
                onClick={() => startDraftMutation.mutate()}
                disabled={!canStartDraft || startDraftMutation.isPending}
              >
                {startDraftMutation.isPending ? 'Starting...' : `Start Draft (${league.memberCount} teams)`}
              </button>
              {startDraftMutation.isError && (
                <p style={styles.error}>{(startDraftMutation.error as any)?.error ?? 'Failed to start draft'}</p>
              )}
              <div style={styles.deleteDivider} />
              {!confirmDelete ? (
                <button style={styles.deleteLeagueBtn} onClick={() => setConfirmDelete(true)}>Delete League</button>
              ) : (
                <div style={styles.deleteConfirm}>
                  <p style={styles.deleteConfirmText}>Permanently delete this league?</p>
                  <div style={styles.deleteConfirmRow}>
                    <button style={styles.deleteCancelBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
                    <button
                      style={styles.deleteConfirmBtn}
                      onClick={() => deleteLeagueMutation.mutate()}
                      disabled={deleteLeagueMutation.isPending}
                    >
                      {deleteLeagueMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                  </div>
                  {deleteLeagueMutation.isError && (
                    <p style={styles.error}>{(deleteLeagueMutation.error as any)?.error ?? 'Failed to delete'}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {!isCommissioner && (
            <p style={styles.waitingMsg}>Waiting for the commissioner to start the draft...</p>
          )}
        </div>
      )}

      {/* Drafting notice */}
      {league.status === 'drafting' && (
        <div style={styles.draftingBanner}>
          <span style={styles.draftingDot} />
          <span style={styles.draftingText}>Draft in progress</span>
          <Link to={`/league/${leagueId}/draft`} style={styles.draftingLink}>Enter Draft Room →</Link>
        </div>
      )}

      {/* Nav grid (shown when past setup) */}
      {league.status !== 'setup' && (
        <div style={{ ...styles.navGrid, ...(isMobile ? styles.navGridMobile : {}) }}>
          {navLinks.filter((l) => l.show).map((item) => (
            <Link
              key={item.label}
              to={item.external ? item.path : `/league/${leagueId}/${item.path}`}
              style={styles.navCard}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              <span style={styles.navLabel}>{item.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* Current event */}
      {currentEvent && (
        <div style={styles.eventCard}>
          <span style={styles.eventCardLabel}>{currentEvent.status === 'live' ? 'Live Event' : 'Next Event'}</span>
          <div style={styles.eventCardNameRow}>
            <span style={styles.eventCardName}>{currentEvent.name}</span>
            {currentEvent.status === 'live' && <span style={styles.eventLiveBadge}>LIVE</span>}
          </div>
          {(currentEvent.venue || currentEvent.location) && (
            <span style={styles.eventCardLocation}>
              {[currentEvent.venue, currentEvent.location].filter(Boolean).join(' · ')}
            </span>
          )}
          {currentEvent.scheduledAt && (
            <span style={styles.eventDate}>
              {new Date(currentEvent.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}
          <Link to={`/league/${leagueId}/picks`} style={styles.eventPicksLink}>Make Picks →</Link>
        </div>
      )}

      {/* Members roster (active leagues) */}
      {league.status === 'active' && members.length > 0 && (
        <div style={styles.memberSection}>
          <p style={styles.memberSectionTitle}>Teams</p>
          <div style={styles.teamsRow}>
            {members.map((m) => (
              <div key={m.id} style={styles.teamPill}>
                <span style={styles.teamPillName}>{m.teamName}</span>
                <span style={styles.teamPillRecord}>{m.wins}-{m.losses}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function statusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    setup: '#8888ff',
    drafting: '#ffd700',
    active: '#4caf50',
    playoffs: '#c8102e',
    completed: '#888',
  };
  return {
    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
    background: '#222', color: colors[status] ?? '#888',
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  loading: { color: '#888', padding: 40 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  logoLink: { display: 'flex', alignItems: 'center', textDecoration: 'none' },
  logo: { height: 36, width: 'auto', objectFit: 'contain' as const },
  leagueHeader: { padding: '20px 24px 4px', textAlign: 'center' },
  leagueName: { color: '#fff', fontWeight: 700, fontSize: 24, display: 'inline-flex', alignItems: 'center', gap: 8 },
  leagueNameRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 },
  leagueMeta: { color: '#555', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' as const, marginBottom: 4 },
  metaDot: { color: '#333' },
  inviteInline: { color: '#888' },
  myTeamRow: { marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  myTeamName: { color: '#888', fontSize: 13, fontWeight: 600 },
  myTeamDot: { color: '#444', fontSize: 13 },
  myTeamPts: { color: '#888', fontSize: 13 },
  myTeamRecord: { color: '#888', fontSize: 13 },
  teamNameForm: { display: 'flex', alignItems: 'center', gap: 6 },
  teamNameInput: { background: '#222', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '3px 8px', outline: 'none', width: 160 },
  onlineRow: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 },
  onlineAvatar: { width: 28, height: 28, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 },
  onlineCount: { color: '#555', fontSize: 11, whiteSpace: 'nowrap' },
  editNameBtn: { background: 'none', border: 'none', color: '#555', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  nameForm: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  nameInput: { background: '#222', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 16, fontWeight: 700, padding: '4px 10px', outline: 'none', flex: 1, maxWidth: 320 },
  nameSaveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
  nameCancelBtn: { background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer' },
  matchupBanner: {
    background: '#1a1a1a', borderBottom: '1px solid #c8102e33',
    padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12,
  },
  matchupEventRow: { display: 'flex', alignItems: 'center', gap: 8 },
  matchupEventName: { color: '#555', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  livePip: { background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5 },
  matchupScoreRow: { display: 'flex', alignItems: 'center' },
  matchupTeam: { flex: 1, display: 'flex', flexDirection: 'column', gap: 3 },
  matchupAvatar: { width: 28, height: 28, borderRadius: '50%', background: '#1a1a3a', border: '2px solid #5555ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' },
  matchupTeamName: { color: '#888', fontSize: 11, fontWeight: 600 },
  matchupScore: { fontSize: 34, fontWeight: 800, lineHeight: 1 },
  matchupVs: { flex: 1, textAlign: 'center' as const },
  leadLabel: { color: '#888', fontSize: 11 },
  tiedLabel: { color: '#ffd700', fontSize: 11, fontWeight: 700 },
  detailsBtn: { alignSelf: 'center' as const, color: '#c8102e', textDecoration: 'none', fontSize: 13, fontWeight: 600 },
  lobbyCard: { margin: 24, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 28 },
  lobbyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  lobbyTitle: { color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 4 },
  lobbyMeta: { color: '#666', fontSize: 13, margin: 0 },
  inviteSection: { textAlign: 'right' },
  inviteLabel: { color: '#666', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' },
  inviteRow: { display: 'flex', alignItems: 'center', gap: 10 },
  inviteCode: { color: '#fff', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 2 },
  copyBtn: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 6, color: '#ccc', padding: '5px 12px', cursor: 'pointer', fontSize: 12 },
  memberGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 24 },
  memberCard: { background: '#111', border: '1px solid #333', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  memberCardEmpty: { borderStyle: 'dashed', opacity: 0.4 },
  memberTeam: { color: '#fff', fontSize: 14, fontWeight: 600 },
  memberUser: { color: '#666', fontSize: 12 },
  memberEmpty: { color: '#555', fontSize: 13 },
  commBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700, marginTop: 4 },
  commActions: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' },
  draftHint: { color: '#888', fontSize: 13, margin: 0 },
  startDraftBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  startDraftDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  deleteDivider: { width: '100%', height: 1, background: '#2a2a2a', margin: '4px 0' },
  deleteLeagueBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 6, color: '#ff5252', fontSize: 13, padding: '8px 16px', cursor: 'pointer' },
  deleteConfirm: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: '12px 16px', width: '100%', boxSizing: 'border-box' as const },
  deleteConfirmText: { color: '#ccc', fontSize: 13, margin: '0 0 10px' },
  deleteConfirmRow: { display: 'flex', gap: 8 },
  deleteCancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 13, padding: '7px 14px', cursor: 'pointer' },
  deleteConfirmBtn: { background: '#3a1a1a', border: '1px solid #ff525444', borderRadius: 6, color: '#ff5252', fontSize: 13, fontWeight: 700, padding: '7px 14px', cursor: 'pointer' },
  waitingMsg: { color: '#666', fontSize: 14, margin: 0, fontStyle: 'italic' },
  error: { color: '#ff6b6b', fontSize: 13, margin: 0 },
  draftingBanner: {
    background: '#1a2a1a', borderBottom: '1px solid #4caf5044',
    padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12,
  },
  draftingDot: { width: 8, height: 8, borderRadius: '50%', background: '#ffd700' },
  draftingText: { color: '#ffd700', fontWeight: 700, fontSize: 14, flex: 1 },
  draftingLink: { color: '#4caf50', textDecoration: 'none', fontSize: 13, fontWeight: 700 },
  navGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 24 },
  navGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: 16 },
  navCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: 24, textDecoration: 'none', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 12,
  },
  navIcon: { fontSize: 32 },
  navLabel: { color: '#fff', fontWeight: 600, fontSize: 14 },
  memberSection: { padding: '0 24px 20px' },
  memberSectionTitle: { color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' },
  teamsRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  teamPill: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 20, padding: '6px 14px', display: 'flex', gap: 10, alignItems: 'center' },
  teamPillName: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  teamPillRecord: { color: '#555', fontSize: 12 },
  eventCard: { margin: '0 24px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center' },
  eventCardNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  eventCardLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  eventCardName: { color: '#fff', fontSize: 17, fontWeight: 700 },
  eventCardLocation: { color: '#555', fontSize: 12 },
  eventDate: { color: '#888', fontSize: 13, fontWeight: 600, marginTop: 2 },
  eventLiveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 3 },
  eventPicksLink: { color: '#c8102e', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginTop: 8 },
  bellWrap: { position: 'relative' as const },
  bellBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '2px 4px', position: 'relative' as const, lineHeight: 1 },
  bellBadge: { position: 'absolute' as const, top: -4, right: -4, background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 800, borderRadius: 8, padding: '1px 4px', minWidth: 14, textAlign: 'center' as const },
  notifPanel: { position: 'absolute' as const, top: 36, right: 0, width: 320, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 100, maxHeight: 400, overflowY: 'auto' as const },
  notifHeader: { padding: '12px 16px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  notifTitle: { color: '#fff', fontWeight: 700, fontSize: 13 },
  notifClose: { background: 'none', border: 'none', color: '#555', fontSize: 14, cursor: 'pointer' },
  notifEmpty: { color: '#555', fontSize: 13, padding: '24px 16px', textAlign: 'center' as const, fontStyle: 'italic' },
  notifItem: { padding: '12px 16px', borderBottom: '1px solid #1f1f1f' },
  notifUnread: { background: '#1f1010' },
  notifItemTitle: { color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 2 },
  notifItemBody: { color: '#888', fontSize: 12, marginBottom: 4 },
  notifItemTime: { color: '#444', fontSize: 11 },
  championBanner: {
    background: 'linear-gradient(135deg, #1a0a0a 0%, #2a1010 50%, #1a0a0a 100%)',
    border: '1px solid #c8102e66', borderLeft: '4px solid #c8102e',
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20,
  },
  championTrophy: { fontSize: 40, lineHeight: 1, flexShrink: 0 },
  championText: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  championLabel: { color: '#c8102e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1 },
  championName: { color: '#fff', fontSize: 22, fontWeight: 800 },
};
