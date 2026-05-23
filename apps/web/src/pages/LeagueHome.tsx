import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import type { League, LeagueMember, Matchup } from '@fantasy-ufc/shared';

export function LeagueHomePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const [copyMsg, setCopyMsg] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; teamName: string }[]>([]);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<(LeagueMember & { username: string; displayName?: string })[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const { data: currentEvent } = useQuery<{ id: string; name: string; venue: string; location: string; scheduledAt: string; status: string } | null>({
    queryKey: ['current-event', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/picks/current-event`) as any; }
      catch { return null; }
    },
    enabled: !!league && league.status === 'active',
  });

  const { data: matchup } = useQuery<(Matchup & { homeTeamName: string; awayTeamName: string; eventName: string; eventStatus: string }) | null>({
    queryKey: ['matchup-current', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/matchups/current`) as any; }
      catch { return null; }
    },
    enabled: !!league && league.status === 'active',
  });

  const renameMutation = useMutation({
    mutationFn: (name: string) => apiClient.patch(`/leagues/${leagueId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      setEditingName(false);
    },
  });

  const startDraftMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/draft/start`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      navigate(`/league/${leagueId}/draft`);
    },
  });

  // Track presence: who's on this league page right now
  useEffect(() => {
    if (!leagueId || !session) return;
    const myMember = members.find((m) => m.userId === session.user.id);
    const teamName = myMember?.teamName ?? session.user.email ?? 'Unknown';

    const channel = supabase.channel(`league-presence:${leagueId}`, {
      config: { presence: { key: session.user.id } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string; teamName: string }>();
        const users = Object.values(state).flatMap((s) => s);
        setOnlineUsers(users);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: session.user.id, teamName });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [leagueId, session, members]);

  if (!league) return <div style={styles.loading}>Loading...</div>;

  const isCommissioner = session?.user.id === league.commissionerId;
  const canStartDraft = isCommissioner && league.status === 'setup' && (league.memberCount ?? 0) >= 2;

  function copyInviteCode() {
    navigator.clipboard.writeText(league!.inviteCode);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  const navLinks = [
    { label: 'My Roster', path: 'roster', icon: '👊', show: league.status !== 'setup' },
    { label: 'Picks', path: 'picks', icon: '🎯', show: league.status === 'active' },
    { label: 'Matchup', path: 'matchup', icon: '⚔️', show: league.status === 'active' },
    { label: 'Standings', path: 'standings', icon: '📊', show: league.status !== 'setup' },
    { label: 'Trades', path: 'trades', icon: '🤝', show: league.status === 'active' },
    { label: 'Draft', path: 'draft', icon: '📋', show: league.status === 'drafting' || league.status === 'active' },
    { label: 'Schedule', path: 'schedule', icon: '📅', show: league.status === 'active' },
    { label: 'Rules', path: 'rules', icon: '📋', show: true },
    { label: 'Fighters', path: '/fighters', icon: '🥊', external: true, show: true },
  ];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.back}>← Home</Link>
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
          <span style={styles.leagueName}>
            {league.name}
            {isCommissioner && (
              <button
                style={styles.editNameBtn}
                onClick={() => { setNameInput(league.name); setEditingName(true); }}
              >✎</button>
            )}
          </span>
        )}
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
        <div style={styles.navGrid}>
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

      <div style={styles.meta}>
        <span>{league.memberCount} / {league.maxTeams} teams</span>
        <span>Roster: {league.rosterSize}</span>
        <span>Season {league.seasonYear}</span>
        {league.status === 'setup' && <span style={styles.metaCode}>Code: {league.inviteCode}</span>}
      </div>
    </div>
  );
}

function statusStyle(status: string): React.CSSProperties {
  const colors: Record<string, string> = {
    setup: '#8888ff',
    drafting: '#ffd700',
    active: '#4caf50',
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
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  leagueName: { color: '#fff', fontWeight: 700, fontSize: 22, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
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
  detailsBtn: { alignSelf: 'flex-end' as const, color: '#c8102e', textDecoration: 'none', fontSize: 13, fontWeight: 600 },
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
  waitingMsg: { color: '#666', fontSize: 14, margin: 0, fontStyle: 'italic' },
  error: { color: '#ff6b6b', fontSize: 13, margin: 0 },
  draftingBanner: {
    background: '#1a2a1a', borderBottom: '1px solid #4caf5044',
    padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12,
  },
  draftingDot: { width: 8, height: 8, borderRadius: '50%', background: '#ffd700' },
  draftingText: { color: '#ffd700', fontWeight: 700, fontSize: 14, flex: 1 },
  draftingLink: { color: '#4caf50', textDecoration: 'none', fontSize: 13, fontWeight: 700 },
  navGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, padding: 24 },
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
  meta: { padding: '0 24px 24px', display: 'flex', gap: 24, color: '#555', fontSize: 13, flexWrap: 'wrap' },
  metaCode: { color: '#888', fontFamily: 'monospace', fontWeight: 700 },
  eventCard: { margin: '0 24px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center' },
  eventCardNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  eventCardLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  eventCardName: { color: '#fff', fontSize: 17, fontWeight: 700 },
  eventCardLocation: { color: '#555', fontSize: 12 },
  eventDate: { color: '#888', fontSize: 13, fontWeight: 600, marginTop: 2 },
  eventLiveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 3 },
  eventPicksLink: { color: '#c8102e', textDecoration: 'none', fontSize: 13, fontWeight: 600, marginTop: 8 },
};
