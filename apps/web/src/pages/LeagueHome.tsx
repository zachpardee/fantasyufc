import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { SkeletonLeagueHeader, SkeletonFightRow } from '../components/LoadingScreen';
import { FighterPhoto } from '../components/FighterPhoto';
import { useIsMobile } from '../hooks/useIsMobile';
import type { League, LeagueMember, Matchup } from '@fantasy-ufc/shared';
import { BeltHalo, MemberSheet, hasBelt, hasBmfBelt } from '../components/MemberSheet';
import { MatchupFightList, MatchupPickPanel, StakingBetsSection, FighterModal, LiveFightCard, type PhotoClickHandler } from '../components/MatchupComponents';

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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTeamName, setSettingsTeamName] = useState('');
  const [settingsColor, setSettingsColor] = useState('#5555ff');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showFightCard, setShowFightCard] = useState(false);
  const [msgInput, setMsgInput] = useState('');
  const [viewedMatchupIdx, setViewedMatchupIdx] = useState<number | null>(null);
  const msgEndRef = useRef<HTMLDivElement>(null);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<(LeagueMember & { username: string; displayName?: string })[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    refetchInterval: 30_000,
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

  const { data: currentEvent } = useQuery<{ id: string; name: string; venue: string; location: string; scheduledAt: string; prelimsAt?: string; status: string } | null>({
    queryKey: ['current-event', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/picks/current-event`) as any; }
      catch { return null; }
    },
    enabled: !!league && (league.status === 'active' || league.status === 'playoffs'),
  });


  const { data: matchup, refetch: refetchMatchup } = useQuery<(Matchup & { homeTeamName: string; awayTeamName: string; eventName: string; eventStatus: string }) | null>({
    queryKey: ['matchup-current', leagueId],
    queryFn: async () => {
      try { return await apiClient.get(`/leagues/${leagueId}/matchups/current`) as any; }
      catch { return null; }
    },
    enabled: !!league && (league.status === 'active' || league.status === 'playoffs'),
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.eventStatus;
      if (status === 'live') return 30_000;
      if (status === 'scheduled') return 60_000;
      return false;
    },
  });

  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
    enabled: !!league && (league.status === 'active' || league.status === 'playoffs'),
  });

  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string; fighterId?: string } | null>(null);
  const openPhoto: PhotoClickHandler = (url, name, fighterId) => setEnlargedPhoto({ url, name, fighterId });

  // Build the user's matchup list (sorted newest-first) and compute the viewed matchup
  const myMemberId = members.find((m) => m.userId === session?.user.id)?.id;
  const myMatchups = (allMatchups as any[])
    .filter((m: any) => myMemberId && (m.homeTeamId === myMemberId || m.awayTeamId === myMemberId))
    .sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const currentMatchupIdx = matchup ? myMatchups.findIndex((m: any) => m.id === matchup.id) : -1;
  const effectiveIdx = viewedMatchupIdx ?? Math.max(0, currentMatchupIdx);
  const effectiveMatchup: typeof matchup = myMatchups[effectiveIdx] ?? matchup ?? null;

  const matchupEventId = effectiveMatchup?.eventId;
  const matchupHomeId = effectiveMatchup?.homeTeamId;
  const matchupAwayId = effectiveMatchup?.awayTeamId;
  const fightCardEventId = matchupEventId ?? currentEvent?.id;
  const eventIsLive = effectiveMatchup?.eventStatus === 'live' || effectiveMatchup?.eventStatus === 'completed';

  const leagueIsStaking = (league as any)?.leagueFormat === 'staking';

  // Only live-poll when showing the actual live matchup
  const liveRefetchInterval = (viewedMatchupIdx === null && matchup?.eventStatus === 'live') ? 30_000 : false as const;

  const { data: fightCardData } = useQuery<{ fights: any[] }>({
    queryKey: ['fight-card', leagueId, fightCardEventId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${fightCardEventId}`),
    enabled: showFightCard && !!fightCardEventId,
  });

  const { data: homePicks } = useQuery<any>({
    queryKey: ['home-picks', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: !!matchupEventId && !!matchupHomeId && !leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });
  const { data: awayPicks } = useQuery<any>({
    queryKey: ['away-picks', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupAwayId}`),
    enabled: !!matchupEventId && !!matchupAwayId && !leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });
  const { data: homeChampion } = useQuery<any>({
    queryKey: ['home-champion', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupHomeId}`),
    enabled: !!matchupEventId && !!matchupHomeId && !leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });
  const { data: awayChampion } = useQuery<any>({
    queryKey: ['away-champion', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupAwayId}`),
    enabled: !!matchupEventId && !!matchupAwayId && !leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });
  const { data: homeStaking } = useQuery<any>({
    queryKey: ['home-staking', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: !!matchupEventId && !!matchupHomeId && leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });
  const { data: awayStaking } = useQuery<any>({
    queryKey: ['away-staking', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupAwayId}`),
    enabled: !!matchupEventId && !!matchupAwayId && leagueIsStaking,
    refetchInterval: liveRefetchInterval,
  });

  // Reset to current matchup when the underlying current matchup changes (e.g. event goes live)
  useEffect(() => { setViewedMatchupIdx(null); }, [matchup?.id]);

  // Real-time score sync: subscribe to matchup DB updates just like the Matchup page does
  useEffect(() => {
    if (!matchup?.id) return;
    const channel = supabase.channel(`home-matchup:${matchup.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchups', filter: `id=eq.${matchup.id}` }, () => refetchMatchup())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, refetchMatchup]);

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all', {}),
    onSuccess: () => { refetchUnread(); refetchNotifs(); },
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<any[]>({
    queryKey: ['league-messages', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/messages`),
    refetchInterval: 30_000,
    enabled: !!leagueId,
  });

  const sendMessageMutation = useMutation({
    mutationFn: (body: string) => apiClient.post(`/leagues/${leagueId}/messages`, { body }),
    onSuccess: () => { refetchMessages(); setMsgInput(''); },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => apiClient.delete(`/leagues/${leagueId}/messages/${messageId}`),
    onSuccess: () => refetchMessages(),
  });

  const prevMsgCount = useRef(0);
  useEffect(() => {
    const prev = prevMsgCount.current;
    prevMsgCount.current = messages.length;
    // Only scroll when a new message arrives, not on initial load
    if (prev > 0 && messages.length > prev) {
      msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

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

  const saveSettingsMutation = useMutation({
    mutationFn: (data: { teamName: string; avatarColor: string }) =>
      apiClient.patch(`/leagues/${leagueId}/members/me`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] });
      setShowSettings(false);
      setConfirmLeave(false);
    },
  });

  const leagueMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}/members/me`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leagues'] });
      navigate('/');
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/activate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
    },
  });

  const [confirmNewSeason, setConfirmNewSeason] = useState(false);
  const newSeasonMutation = useMutation({
    mutationFn: () => apiClient.post(`/leagues/${leagueId}/new-season`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league', leagueId] });
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] });
      setConfirmNewSeason(false);
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

  if (!league) return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh' }}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logoLink}><img src="/logo.jpg" alt="FFL" style={styles.logo} /></Link>
        <Link to="/" style={styles.homeBtn}>🏠 Home</Link>
      </nav>
      <SkeletonLeagueHeader />
      <div style={{ padding: '0 24px' }}>
        {[0, 1, 2, 3, 4].map((i) => <SkeletonFightRow key={i} />)}
      </div>
    </div>
  );

  const isCommissioner = session?.user.id === league.commissionerId;
  const canActivate = isCommissioner && league.status === 'setup' && (league.memberCount ?? 0) >= 2;
  const myMember = members.find((m) => m.userId === session?.user.id);
  const isStaking = (league as any).leagueFormat === 'staking';

  function fmtScore(n: number) {
    if (!isStaking) return n.toFixed(0);
    const abs = Math.abs(n);
    const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
    return (n < 0 ? '-$' : '+$') + s;
  }

  function calcPicksScore(picks: any[], championPts: number, dbFallback: number | null): number {
    if (dbFallback !== null) return dbFallback;
    const scored = picks.filter((p) => p.isCorrect !== null);
    if (scored.length === 0) return 0;
    const correct = scored.filter((p) => p.isCorrect === true);
    const pts = picks.reduce((s: number, p: any) => s + (+(p.pointsEarned ?? 0)), 0);
    const sweep = correct.length === 6 ? 20 : correct.length === 5 ? 10 : correct.length === 4 ? 5 : 0;
    return pts + sweep + championPts;
  }

  const champion = members.find((m) => m.isChampion);
  const showChampionBanner = league.status === 'completed' && !!champion && !!league.completedAt
    && Date.now() - new Date(league.completedAt).getTime() < 7 * 24 * 60 * 60 * 1000;

  function copyInviteCode() {
    navigator.clipboard.writeText(league!.inviteCode);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  const navLinks: { label: string; path?: string; icon: string; external?: boolean; show: boolean; onClick?: () => void }[] = [
    { label: isStaking ? 'Bets' : 'Picks', path: isStaking ? 'staking' : 'picks', icon: '🎯', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Matchup', path: 'matchup', icon: '⚔️', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Standings', path: 'standings', icon: '📊', show: league.status !== 'setup' },
    { label: 'Schedule', path: 'schedule', icon: '📅', show: league.status === 'active' || league.status === 'playoffs' },
    { label: 'Playoffs', path: 'playoffs', icon: '🏆', show: league.status === 'playoffs' || league.status === 'active' },
    { label: 'Rules', path: 'rules', icon: '📋', show: true },
    { label: 'Fighters', path: '/fighters', icon: '🥊', external: true, show: true },
    { label: 'Commissioner', path: 'commissioner', icon: '⚙️', show: isCommissioner },
    { label: 'Settings', icon: '⚙', show: !!myMember, onClick: () => { setSettingsTeamName(myMember!.teamName); setSettingsColor((myMember as any).avatarColor ?? '#5555ff'); setShowSettings(true); } },
  ];

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to="/" style={styles.logoLink}>
          <img src="/logo.jpg" alt="FFL" style={styles.logo} />
        </Link>
        <Link to="/" style={styles.homeBtn}>🏠 Home</Link>
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
              const member = members.find((m) => m.userId === u.userId);
              return (
                <div key={u.userId} style={{ position: 'relative', display: 'inline-flex' }}>
                  <div
                    style={{
                      ...styles.onlineAvatar,
                      background: u.userId === session?.user.id ? '#1a3a1a' : '#1a1a3a',
                      borderColor: u.userId === session?.user.id ? '#4caf50' : '#5555ff',
                      cursor: member ? 'pointer' : 'default',
                    }}
                    title={u.teamName}
                    onClick={() => member && setSelectedMember(member)}
                  >
                    {u.teamName.charAt(0).toUpperCase()}
                  </div>
                  {member && hasBelt(member, members, league) && <BeltHalo size={28} />}
                  {member && hasBmfBelt(member, league) && <BeltHalo size={28} variant="bmf" position={hasBelt(member, members, league) ? 'bottom' : 'top'} />}
                </div>
              );
            })}
            <span style={styles.onlineCount}>{onlineUsers.length} online</span>
          </div>
        )}
      </nav>

      {/* League name header */}
      <div style={styles.leagueHeader}>
        {/* Left avatars */}
        <div style={styles.avatarGroup}>
          {members.filter((_, i) => i % 2 === 0).map((m) => {
            const color = (m as any).avatarColor ?? '#5555ff';
            return (
              <div key={m.id} style={{ position: 'relative', display: 'inline-flex' }}>
                <div style={{ ...styles.memberAvatar, background: color + '33', borderColor: color }} title={m.teamName} onClick={() => setSelectedMember(m)}>
                  {m.teamName.charAt(0).toUpperCase()}
                </div>
                {hasBelt(m, members, league) && <BeltHalo size={32} />}
                {hasBmfBelt(m, league) && <BeltHalo size={32} variant="bmf" position={hasBelt(m, members, league) ? 'bottom' : 'top'} />}
              </div>
            );
          })}
        </div>

        {/* Center: name + meta + my team */}
        <div style={styles.leagueHeaderCenter}>
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
                <button style={styles.editNameBtn} onClick={() => { setNameInput(league.name); setEditingName(true); }}>✎</button>
              )}
            </div>
          )}
          <div style={styles.leagueMeta}>
            <span>Season {league.seasonYear}</span>
            <span style={styles.metaDot}>·</span>
            <span>{league.memberCount} / {league.maxTeams} teams</span>
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
                  <span style={styles.myTeamPts}>
                    {isStaking
                      ? fmtScore(+((myMember as any).stakingBalance ?? 0))
                      : `${(+myMember.totalPoints).toFixed(0)} pts`}
                  </span>
                  <span style={styles.myTeamDot}>·</span>
                  <span style={styles.myTeamRecord}>{myMember.wins}–{myMember.losses}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right avatars */}
        <div style={styles.avatarGroup}>
          {members.filter((_, i) => i % 2 === 1).map((m) => {
            const color = (m as any).avatarColor ?? '#5555ff';
            return (
              <div key={m.id} style={{ position: 'relative', display: 'inline-flex' }}>
                <div style={{ ...styles.memberAvatar, background: color + '33', borderColor: color }} title={m.teamName} onClick={() => setSelectedMember(m)}>
                  {m.teamName.charAt(0).toUpperCase()}
                </div>
                {hasBelt(m, members, league) && <BeltHalo size={32} />}
                {hasBmfBelt(m, league) && <BeltHalo size={32} variant="bmf" position={hasBelt(m, members, league) ? 'bottom' : 'top'} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Current matchup + event card */}
      {(effectiveMatchup || currentEvent) && (() => {
        const home = !isStaking && effectiveMatchup
          ? calcPicksScore(
              homePicks?.fights ?? [],
              homeChampion?.pointsEarned ? +homeChampion.pointsEarned : 0,
              homePicks != null ? null : +effectiveMatchup.homeScore,
            )
          : effectiveMatchup ? +effectiveMatchup.homeScore : 0;
        const away = !isStaking && effectiveMatchup
          ? calcPicksScore(
              awayPicks?.fights ?? [],
              awayChampion?.pointsEarned ? +awayChampion.pointsEarned : 0,
              awayPicks != null ? null : +effectiveMatchup.awayScore,
            )
          : effectiveMatchup ? +effectiveMatchup.awayScore : 0;
        const isLive = effectiveMatchup?.eventStatus === 'live' || (viewedMatchupIdx === null && currentEvent?.status === 'live');
        const diff = effectiveMatchup ? Math.abs(home - away) : 0;
        const leading = effectiveMatchup ? (home > away ? effectiveMatchup.homeTeamName : away > home ? effectiveMatchup.awayTeamName : null) : null;
        const eventName = effectiveMatchup?.eventName ?? currentEvent?.name ?? 'Current Event';

        const hasPrev = myMatchups.length > 1 && effectiveIdx < myMatchups.length - 1;
        const hasNext = myMatchups.length > 1 && effectiveIdx > 0;
        const isViewingCurrent = viewedMatchupIdx === null || currentMatchupIdx === -1 || effectiveIdx === currentMatchupIdx;
        const bannerLabel =
          isViewingCurrent ? 'CURRENT MATCHUP'
          : effectiveIdx < currentMatchupIdx ? 'UPCOMING MATCHUP'
          : 'VIEWING PREVIOUS MATCHUP';

        return (
          <>
            <div style={{ ...styles.matchupBanner, position: 'relative', ...(isMobile ? { margin: '0 12px 16px', padding: '12px 40px' } : { paddingLeft: 56, paddingRight: 56 }) }}>
              {/* Previous matchup arrow (left) */}
              <button
                onClick={() => setViewedMatchupIdx(Math.min(effectiveIdx + 1, myMatchups.length - 1))}
                disabled={!hasPrev}
                style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', background: hasPrev ? '#1a1a1a' : 'none', border: 'none', borderRadius: 8, cursor: hasPrev ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: isMobile ? '6px 8px' : '8px 12px', color: hasPrev ? '#bbb' : '#2a2a2a' }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>‹</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2, textAlign: 'center' }}>Prev</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2, textAlign: 'center' }}>Matchup</span>
              </button>

              {/* Next matchup arrow (right) */}
              <button
                onClick={() => setViewedMatchupIdx(Math.max(effectiveIdx - 1, 0))}
                disabled={!hasNext}
                style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', background: hasNext ? '#1a1a1a' : 'none', border: 'none', borderRadius: 8, cursor: hasNext ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: isMobile ? '6px 8px' : '8px 12px', color: hasNext ? '#bbb' : '#2a2a2a' }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>›</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2, textAlign: 'center' }}>Next</span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, lineHeight: 1.2, textAlign: 'center' }}>Matchup</span>
              </button>

              <div style={styles.matchupLabelRow}>
                <span style={styles.matchupLabel}>{bannerLabel}</span>
                {isLive && <span style={styles.livePip}>LIVE</span>}
              </div>
              {(() => {
                const homeMember = members.find(m => m.teamName === effectiveMatchup?.homeTeamName);
                const awayMember = members.find(m => m.teamName === effectiveMatchup?.awayTeamName);
                const homeColor = (homeMember as any)?.avatarColor ?? '#5555ff';
                const awayColor = (awayMember as any)?.avatarColor ?? '#5555ff';
                const avatarSize = isMobile ? 32 : 50;
                const scoreFontSize = isMobile ? (isStaking ? 22 : 28) : 34;
                const beltGap = Math.ceil(avatarSize * 0.45) + 6;
                const baseGap = isMobile ? 6 : 12;
                const homeHasBeltOrBmf = !!(homeMember && (hasBelt(homeMember, members, league) || hasBmfBelt(homeMember, league)));
                const awayHasBeltOrBmf = !!(awayMember && (hasBelt(awayMember, members, league) || hasBmfBelt(awayMember, league)));
                const homeTeamGap = homeHasBeltOrBmf ? beltGap : baseGap;
                const awayTeamGap = awayHasBeltOrBmf ? beltGap : baseGap;
                return (
                  <div style={{ ...styles.matchupScoreRow, overflow: 'hidden' }}>
                    <div style={{ ...styles.matchupTeam, gap: homeTeamGap, overflow: 'hidden', justifyContent: 'center' }}>
                      {effectiveMatchup && (
                        <>
                          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                            <div style={{ ...styles.matchupAvatar, width: avatarSize, height: avatarSize, fontSize: isMobile ? 13 : 20, background: homeColor + '33', borderColor: homeColor, cursor: homeMember ? 'pointer' : 'default' }} onClick={() => homeMember && setSelectedMember(homeMember)}>{effectiveMatchup.homeTeamName?.charAt(0).toUpperCase()}</div>
                            {homeMember && hasBelt(homeMember, members, league) && <BeltHalo size={avatarSize} />}
                            {homeMember && hasBmfBelt(homeMember, league) && <BeltHalo size={avatarSize} variant="bmf" position={hasBelt(homeMember, members, league) ? 'bottom' : 'top'} />}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ ...styles.matchupTeamName, fontSize: isMobile ? 10 : 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{effectiveMatchup.homeTeamName}</div>
                            <div style={{ ...styles.matchupScore, fontSize: scoreFontSize, whiteSpace: 'nowrap' as const, color: home > away ? '#fff' : '#666' }}>{fmtScore(home)}</div>
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ ...styles.matchupCenter, flex: isMobile ? '0 0 32px' : 1 }}>
                      {isMobile ? (
                        <span style={{ color: '#333', fontSize: 11, fontWeight: 700 }}>VS</span>
                      ) : (
                        <>
                          <span style={styles.matchupEventTitle} onClick={() => setShowFightCard(true)} title="View fight card">{eventName} ›</span>
                          {viewedMatchupIdx === null && currentEvent && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                              {(currentEvent.venue || currentEvent.location) && (
                                <span style={styles.eventCardLocation}>
                                  {[currentEvent.venue, currentEvent.location].filter(Boolean).join(' · ')}
                                </span>
                              )}
                              {(currentEvent.prelimsAt ?? currentEvent.scheduledAt) && (
                                <span style={styles.eventDate}>
                                  {(() => {
                                    const d = new Date(currentEvent.prelimsAt ?? currentEvent.scheduledAt);
                                    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                                  })()}
                                </span>
                              )}
                            </div>
                          )}
                          {viewedMatchupIdx !== null && (effectiveMatchup as any)?.scheduledAt && (
                            <span style={styles.eventDate}>
                              {new Date((effectiveMatchup as any).scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <div style={{ ...styles.matchupTeam, gap: awayTeamGap, justifyContent: 'center', overflow: 'hidden' }}>
                      {effectiveMatchup && (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}>
                            <div style={{ ...styles.matchupTeamName, fontSize: isMobile ? 10 : 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{effectiveMatchup.awayTeamName}</div>
                            <div style={{ ...styles.matchupScore, fontSize: scoreFontSize, whiteSpace: 'nowrap' as const, color: away > home ? '#fff' : '#666' }}>{fmtScore(away)}</div>
                          </div>
                          <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                            <div style={{ ...styles.matchupAvatar, width: avatarSize, height: avatarSize, fontSize: isMobile ? 13 : 20, background: awayColor + '33', borderColor: awayColor, cursor: awayMember ? 'pointer' : 'default' }} onClick={() => awayMember && setSelectedMember(awayMember)}>{effectiveMatchup.awayTeamName?.charAt(0).toUpperCase()}</div>
                            {awayMember && hasBelt(awayMember, members, league) && <BeltHalo size={avatarSize} />}
                            {awayMember && hasBmfBelt(awayMember, league) && <BeltHalo size={avatarSize} variant="bmf" position={hasBelt(awayMember, members, league) ? 'bottom' : 'top'} />}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
              {isViewingCurrent && <Link to={`/league/${leagueId}/${isStaking ? 'staking' : 'picks'}`} style={styles.eventPicksLink}>{isStaking ? 'Place Bets →' : 'Make Picks →'}</Link>}
              {effectiveMatchup && <Link to={`/league/${leagueId}/matchup`} style={styles.matchupDetailsLink}>Matchup Details →</Link>}
            </div>
            {effectiveMatchup && (
              <div style={styles.matchupSubRow}>
                {leading
                  ? <span style={styles.matchupLeadLabel}>{leading} leads by {fmtScore(diff)}</span>
                  : <span style={styles.matchupTiedLabel}>TIED</span>}
              </div>
            )}
          </>
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

      {/* New Season (commissioner, completed league) */}
      {isCommissioner && league.status === 'completed' && (
        <div style={styles.newSeasonCard}>
          {!confirmNewSeason ? (
            <>
              <div style={styles.newSeasonText}>
                <span style={styles.newSeasonTitle}>Start a new season?</span>
                <span style={styles.newSeasonSub}>Resets all stats, rosters, and matchups. Same teams, new draft.</span>
              </div>
              <button style={styles.newSeasonBtn} onClick={() => setConfirmNewSeason(true)}>
                New Season →
              </button>
            </>
          ) : (
            <>
              <div style={styles.newSeasonText}>
                <span style={styles.newSeasonTitle}>Start Season {(league.seasonYear ?? 0) + 1}?</span>
                <span style={styles.newSeasonSub}>All stats, picks, and rosters will be permanently cleared.</span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={styles.newSeasonCancelBtn} onClick={() => setConfirmNewSeason(false)}>Cancel</button>
                <button
                  style={{ ...styles.newSeasonConfirmBtn, opacity: newSeasonMutation.isPending ? 0.6 : 1 }}
                  onClick={() => newSeasonMutation.mutate()}
                  disabled={newSeasonMutation.isPending}
                >
                  {newSeasonMutation.isPending ? 'Resetting...' : 'Yes, New Season'}
                </button>
              </div>
            </>
          )}
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
                <p style={styles.draftHint}>Need at least 2 teams to start the season</p>
              )}
              <button
                style={{ ...styles.startDraftBtn, ...(!canActivate ? styles.startDraftDisabled : {}) }}
                onClick={() => activateMutation.mutate()}
                disabled={!canActivate || activateMutation.isPending}
              >
                {activateMutation.isPending ? 'Starting...' : `Start Season (${league.memberCount} teams)`}
              </button>
              {activateMutation.isError && (
                <p style={styles.error}>{(activateMutation.error as any)?.error ?? 'Failed to start season'}</p>
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
            <p style={styles.waitingMsg}>Waiting for the commissioner to start the season...</p>
          )}
        </div>
      )}

      {/* Live fight card */}
      {matchup?.eventStatus === 'live' && (
        <div style={{ padding: isMobile ? '0 12px' : '0 24px', marginBottom: 4 }}>
          <LiveFightCard />
        </div>
      )}

      {/* Picks / bets section above nav */}
      {effectiveMatchup && (league.status === 'active' || league.status === 'playoffs') && (() => {
        const isMeHome = !!myMember && myMember.id === effectiveMatchup.homeTeamId;
        const isMeAway = !!myMember && myMember.id === effectiveMatchup.awayTeamId;
        const fights: any[] = homePicks?.fights ?? homeStaking?.fights ?? awayStaking?.fights ?? [];
        return (
          <div style={{ padding: isMobile ? '0 12px 8px' : '0 24px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0 10px' }}>
              <span style={{ color: '#444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                {isStaking ? 'BETS' : 'PICKS'}
              </span>
              {homePicks?.locked && <span style={{ background: '#222', color: '#555', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }}>LOCKED</span>}
            </div>
            {isStaking ? (
              <StakingBetsSection
                fights={fights}
                homeStaking={homeStaking}
                awayStaking={awayStaking}
                homeTeamName={effectiveMatchup.homeTeamName}
                awayTeamName={effectiveMatchup.awayTeamName}
                isMeHome={isMeHome}
                isMeAway={isMeAway}
                isEventLive={eventIsLive}
                leagueId={leagueId}
                onPhotoClick={openPhoto}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: 'flex-start' }}>
                {isMobile && <MatchupFightList fights={fights} onPhotoClick={openPhoto} isEventLive={effectiveMatchup?.eventStatus === 'live'} />}
                <MatchupPickPanel
                  teamName={isMeHome ? effectiveMatchup.homeTeamName : isMeAway ? effectiveMatchup.awayTeamName : effectiveMatchup.homeTeamName}
                  fights={isMeHome ? (homePicks?.fights ?? []) : isMeAway ? (awayPicks?.fights ?? []) : (homePicks?.fights ?? [])}
                  champion={isMeHome ? homeChampion : isMeAway ? awayChampion : homeChampion}
                  isLocked={!(isMeHome || isMeAway) && !eventIsLive}
                  isOwn={isMeHome || isMeAway}
                  leagueId={leagueId}
                  locked={homePicks?.locked}
                />
                {!isMobile && <MatchupFightList fights={fights} onPhotoClick={openPhoto} isEventLive={effectiveMatchup?.eventStatus === 'live'} />}
                <MatchupPickPanel
                  teamName={isMeHome ? effectiveMatchup.awayTeamName : isMeAway ? effectiveMatchup.homeTeamName : effectiveMatchup.awayTeamName}
                  fights={isMeHome ? (awayPicks?.fights ?? []) : isMeAway ? (homePicks?.fights ?? []) : (awayPicks?.fights ?? [])}
                  champion={isMeHome ? awayChampion : isMeAway ? homeChampion : awayChampion}
                  isLocked={!eventIsLive}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* Nav grid (shown when past setup) */}
      {league.status !== 'setup' && (
        <div style={{ ...styles.navGrid, ...(isMobile ? styles.navGridMobile : {}) }}>
          {navLinks.filter((l) => l.show).map((item) => (
            item.onClick ? (
              <button key={item.label} style={styles.navCardBtn} onClick={item.onClick}>
                <span style={styles.navIcon}>{item.icon}</span>
                <span style={styles.navLabel}>{item.label}</span>
              </button>
            ) : (
              <Link
                key={item.label}
                to={item.external ? item.path! : `/league/${leagueId}/${item.path}`}
                style={styles.navCard}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                <span style={styles.navLabel}>{item.label}</span>
              </Link>
            )
          ))}
        </div>
      )}

{/* Message board */}
      {league.status !== 'setup' && (
        <div style={styles.msgBoard}>
          <p style={styles.msgBoardTitle}>League Chat</p>
          <div style={styles.msgList}>
            {messages.length === 0 && (
              <p style={styles.msgEmpty}>No messages yet. Say something!</p>
            )}
            {messages.map((msg) => {
              const isMe = msg.memberId === myMember?.id;
              const color = msg.avatarColor ?? '#5555ff';
              const ago = (() => {
                const diff = Date.now() - new Date(msg.createdAt).getTime();
                const m = Math.floor(diff / 60000);
                if (m < 1) return 'just now';
                if (m < 60) return `${m}m ago`;
                const h = Math.floor(m / 60);
                if (h < 24) return `${h}h ago`;
                return `${Math.floor(h / 24)}d ago`;
              })();
              return (
                <div key={msg.id} style={{ ...styles.msgRow, ...(isMe ? styles.msgRowMe : {}) }}>
                  <div style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                    <div
                      style={{ ...styles.msgAvatar, background: color + '33', borderColor: color, cursor: 'pointer' }}
                      onClick={() => { const m = members.find((m) => m.id === msg.memberId); if (m) setSelectedMember(m); }}
                    >
                      {msg.teamName?.charAt(0).toUpperCase()}
                    </div>
                    {(() => { const m = members.find((mm) => mm.id === msg.memberId); return <>{m && hasBelt(m, members, league) && <BeltHalo size={28} />}{m && hasBmfBelt(m, league) && <BeltHalo size={28} variant="bmf" position={hasBelt(m, members, league) ? 'bottom' : 'top'} />}</>; })()}
                  </div>
                  <div style={styles.msgContent}>
                    <div style={styles.msgMeta}>
                      <span style={styles.msgTeam}>{msg.teamName}</span>
                      <span style={styles.msgTime}>{ago}</span>
                      {isMe && (
                        <button
                          style={styles.msgDelete}
                          onClick={() => deleteMessageMutation.mutate(msg.id)}
                          title="Delete"
                        >✕</button>
                      )}
                    </div>
                    <div style={styles.msgBody}>{msg.body}</div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>
          <form
            style={styles.msgForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (msgInput.trim()) sendMessageMutation.mutate(msgInput.trim());
            }}
          >
            <input
              style={styles.msgInput}
              placeholder="Say something..."
              value={msgInput}
              onChange={(e) => setMsgInput(e.target.value)}
              maxLength={1000}
              disabled={sendMessageMutation.isPending}
            />
            <button
              type="submit"
              style={{ ...styles.msgSendBtn, opacity: !msgInput.trim() || sendMessageMutation.isPending ? 0.4 : 1 }}
              disabled={!msgInput.trim() || sendMessageMutation.isPending}
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Settings modal */}
      {showSettings && (
        <div style={styles.modalOverlay} onClick={() => { setShowSettings(false); setConfirmLeave(false); }}>
          <div style={styles.modalSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>Team Settings</span>
              <button style={styles.modalClose} onClick={() => { setShowSettings(false); setConfirmLeave(false); }}>✕</button>
            </div>

            <div style={styles.modalBody}>
              <div style={styles.settingsSection}>
                <label style={styles.settingsLabel}>Team Name</label>
                <input
                  style={styles.settingsInput}
                  value={settingsTeamName}
                  onChange={(e) => setSettingsTeamName(e.target.value)}
                  maxLength={100}
                  autoFocus
                />
              </div>

              <div style={styles.settingsSection}>
                <label style={styles.settingsLabel}>Avatar Color</label>
                <div style={styles.colorSwatches}>
                  {['#5555ff','#c8102e','#4caf50','#ff8c42','#ffd700','#00bcd4','#e040fb','#ffffff'].map((c) => (
                    <button
                      key={c}
                      style={{
                        ...styles.colorSwatch,
                        background: c,
                        outline: settingsColor === c ? `3px solid ${c}` : 'none',
                        outlineOffset: 3,
                        opacity: settingsColor === c ? 1 : 0.5,
                      }}
                      onClick={() => setSettingsColor(c)}
                    />
                  ))}
                </div>
              </div>

              <button
                style={{ ...styles.saveSettingsBtn, opacity: saveSettingsMutation.isPending ? 0.6 : 1 }}
                disabled={saveSettingsMutation.isPending || !settingsTeamName.trim()}
                onClick={() => saveSettingsMutation.mutate({ teamName: settingsTeamName.trim(), avatarColor: settingsColor })}
              >
                {saveSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>

              <div style={styles.settingsDivider} />

              {!confirmLeave ? (
                <button style={styles.leaveBtn} onClick={() => setConfirmLeave(true)}>
                  Leave League
                </button>
              ) : (
                <div style={styles.leaveConfirm}>
                  <p style={styles.leaveConfirmText}>Are you sure you want to leave this league?</p>
                  <div style={styles.leaveConfirmRow}>
                    <button style={styles.leaveCancelBtn} onClick={() => setConfirmLeave(false)}>Cancel</button>
                    <button
                      style={styles.leaveConfirmBtn}
                      onClick={() => leagueMutation.mutate()}
                      disabled={leagueMutation.isPending}
                    >
                      {leagueMutation.isPending ? 'Leaving...' : 'Yes, Leave'}
                    </button>
                  </div>
                  {leagueMutation.isError && (
                    <p style={styles.error}>{(leagueMutation.error as any)?.error ?? 'Failed to leave'}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Member profile sheet */}
      {selectedMember && (
        <MemberSheet
          member={selectedMember}
          members={members}
          league={league}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {/* Fight card sheet */}
      {showFightCard && (
        <div style={styles.sheetOverlay} onClick={() => setShowFightCard(false)}>
          <div style={styles.bottomSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>{effectiveMatchup?.eventName ?? currentEvent?.name ?? 'Fight Card'}</span>
              <button style={styles.modalClose} onClick={() => setShowFightCard(false)}>✕</button>
            </div>
            {viewedMatchupIdx === null && currentEvent && (
              <div style={styles.sheetSubtitle}>
                {[currentEvent.venue, currentEvent.location].filter(Boolean).join(' · ')}
                {(currentEvent.prelimsAt ?? currentEvent.scheduledAt) && (
                  <> · {(() => {
                    const d = new Date(currentEvent.prelimsAt ?? currentEvent.scheduledAt!);
                    return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                  })()}</>
                )}
              </div>
            )}
            <div style={styles.sheetBody}>
              {!fightCardEventId ? (
                <div style={{ color: '#555', textAlign: 'center', padding: '32px 0' }}>No event available</div>
              ) : !fightCardData ? (
                <div style={{ paddingTop: 8 }}>{[0, 1, 2, 3, 4, 5].map((i) => <SkeletonFightRow key={i} />)}</div>
              ) : fightCardData.fights.length === 0 ? (
                <div style={{ color: '#555', textAlign: 'center', padding: '32px 0' }}>No fight card available yet</div>
              ) : (() => {
                const segments = ['main', 'prelims', 'early_prelims'] as const;
                const segmentLabel: Record<string, string> = { main: 'Main Card', prelims: 'Prelims', early_prelims: 'Early Prelims' };
                return segments.map((seg) => {
                  const fights = fightCardData.fights.filter((f: any) => f.cardSegment === seg);
                  if (!fights.length) return null;
                  return (
                    <div key={seg}>
                      <div style={styles.cardSegmentLabel}>{segmentLabel[seg]}</div>
                      {fights.map((f: any) => {
                        const redOdds = f.redFighterOdds != null ? (f.redFighterOdds > 0 ? `+${f.redFighterOdds}` : `${f.redFighterOdds}`) : null;
                        const blueOdds = f.blueFighterOdds != null ? (f.blueFighterOdds > 0 ? `+${f.blueFighterOdds}` : `${f.blueFighterOdds}`) : null;
                        return (
                          <div key={f.id} style={styles.fightRow}>
                            <div style={styles.fightRowFighter}>
                              <FighterPhoto imageUrl={f.redImageUrl} name={`${f.redFirstName} ${f.redLastName}`} style={styles.fightRowImg} />
                              <div style={styles.fightRowInfo}>
                                <span style={styles.fightRowName}>{f.redFirstName} {f.redLastName}</span>
                                {redOdds && <span style={styles.fightRowOdds}>{redOdds}</span>}
                              </div>
                            </div>
                            <div style={styles.fightRowCenter}>
                              <span style={styles.fightRowVs}>VS</span>
                              <span style={styles.fightRowWeight}>{f.weightClassName}</span>
                            </div>
                            <div style={{ ...styles.fightRowFighter, flexDirection: 'row-reverse', textAlign: 'right' as const }}>
                              <FighterPhoto imageUrl={f.blueImageUrl} name={`${f.blueFirstName} ${f.blueLastName}`} style={styles.fightRowImg} />
                              <div style={{ ...styles.fightRowInfo, alignItems: 'flex-end' }}>
                                <span style={styles.fightRowName}>{f.blueFirstName} {f.blueLastName}</span>
                                {blueOdds && <span style={styles.fightRowOdds}>{blueOdds}</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
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

      {enlargedPhoto && (
        <FighterModal
          photo={enlargedPhoto.url}
          name={enlargedPhoto.name}
          fighterId={enlargedPhoto.fighterId}
          onClose={() => setEnlargedPhoto(null)}
        />
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
    fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
    background: '#222', color: colors[status] ?? '#888',
  };
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  loading: { color: '#888', padding: 40 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  logoLink: { display: 'flex', alignItems: 'center', textDecoration: 'none' },
  homeBtn: { color: '#aaa', textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 },
  logo: { height: 48, width: 'auto', objectFit: 'contain' as const },
  leagueHeader: { padding: '20px 24px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 },
  leagueHeaderCenter: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 },
  avatarGroup: { display: 'flex', gap: 10, alignItems: 'center' },
  memberAvatar: { width: 32, height: 32, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 },
  settingsBtn: { background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  modalOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalSheet: { background: '#141414', border: '1px solid #242424', borderRadius: 16, width: '90%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto' as const, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' },
  modalTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  modalClose: { background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' },
  modalBody: { padding: '20px 24px 40px', display: 'flex', flexDirection: 'column' as const, gap: 20 },
  settingsSection: { display: 'flex', flexDirection: 'column' as const, gap: 8 },
  settingsLabel: { color: '#666', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  settingsInput: { background: '#111', border: '1px solid #333', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, padding: '10px 14px', outline: 'none' },
  colorSwatches: { display: 'flex', gap: 10, flexWrap: 'wrap' as const },
  colorSwatch: { width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', flexShrink: 0 },
  saveSettingsBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  settingsDivider: { height: 1, background: '#2a2a2a' },
  leaveBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 8, color: '#ff5252', fontSize: 14, padding: '11px', cursor: 'pointer', fontWeight: 600 },
  leaveConfirm: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: '16px' },
  leaveConfirmText: { color: '#ccc', fontSize: 14, margin: '0 0 12px' },
  leaveConfirmRow: { display: 'flex', gap: 8 },
  leaveCancelBtn: { flex: 1, background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 14, padding: '9px', cursor: 'pointer' },
  leaveConfirmBtn: { flex: 1, background: '#3a1a1a', border: '1px solid #ff525444', borderRadius: 6, color: '#ff5252', fontSize: 14, fontWeight: 700, padding: '9px', cursor: 'pointer' },
  leagueName: { color: '#fff', fontWeight: 700, fontSize: 24, display: 'inline-flex', alignItems: 'center', gap: 8 },
  leagueNameRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 },
  leagueMeta: { color: '#555', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' as const, marginBottom: 4 },
  metaDot: { color: '#333' },
  inviteInline: { color: '#888' },
  myTeamRow: { marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 },
  myTeamName: { color: '#888', fontSize: 14, fontWeight: 600 },
  myTeamDot: { color: '#444', fontSize: 14 },
  myTeamPts: { color: '#888', fontSize: 14 },
  myTeamRecord: { color: '#888', fontSize: 14 },
  teamNameForm: { display: 'flex', alignItems: 'center', gap: 6 },
  teamNameInput: { background: '#222', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 600, padding: '3px 8px', outline: 'none', width: 160 },
  onlineRow: { display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 },
  onlineAvatar: { width: 28, height: 28, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 },
  onlineCount: { color: '#555', fontSize: 12, whiteSpace: 'nowrap' },
  editNameBtn: { background: 'none', border: 'none', color: '#555', fontSize: 14, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 },
  nameForm: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 },
  nameInput: { background: '#222', border: '1px solid #444', borderRadius: 6, color: '#fff', fontSize: 16, fontWeight: 700, padding: '4px 10px', outline: 'none', flex: 1, maxWidth: 320 },
  nameSaveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  nameCancelBtn: { background: 'transparent', color: '#888', border: '1px solid #444', borderRadius: 6, padding: '5px 12px', fontSize: 14, cursor: 'pointer' },
  matchupBanner: {
    margin: '0 24px 16px', background: '#1a1a1a', border: '1px solid #2a2a2a',
    borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 5, textAlign: 'center',
  },
  matchupLabelRow: { display: 'flex', alignItems: 'center', gap: 6 },
  matchupLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  livePip: { background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: 0.5 },
  matchupEventTitle: { color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  matchupScoreRow: { display: 'flex', alignItems: 'center', width: '100%' },
  matchupTeam: { flex: 1, display: 'flex', flexDirection: 'row' as const, alignItems: 'center', gap: 12 },
  matchupCenter: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 1 },
  matchupAvatar: { width: 50, height: 50, borderRadius: '50%', background: '#1a1a3a', border: '2px solid #5555ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff', flexShrink: 0 },
  matchupTeamName: { color: '#888', fontSize: 12, fontWeight: 600 },
  matchupScore: { fontSize: 34, fontWeight: 700, lineHeight: 1 },
  matchupLeadLabel: { color: '#aaa', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' as const },
  matchupTiedLabel: { color: '#ffd700', fontSize: 12, fontWeight: 700 },
  matchupSubRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 24px 0' },
  matchupDetailsLink: { color: '#c8102e', textDecoration: 'none', fontSize: 14, fontWeight: 600 },
  lobbyCard: { margin: 24, background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: 28, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  lobbyHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  lobbyTitle: { color: '#fff', fontSize: 18, fontWeight: 700, margin: 0, marginBottom: 4 },
  lobbyMeta: { color: '#666', fontSize: 14, margin: 0 },
  inviteSection: { textAlign: 'right' },
  inviteLabel: { color: '#666', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 6px' },
  inviteRow: { display: 'flex', alignItems: 'center', gap: 10 },
  inviteCode: { color: '#fff', fontFamily: 'monospace', fontSize: 20, fontWeight: 700, letterSpacing: 2 },
  copyBtn: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 6, color: '#ccc', padding: '5px 12px', cursor: 'pointer', fontSize: 12 },
  memberGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 24 },
  memberCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  memberCardEmpty: { borderStyle: 'dashed', opacity: 0.4 },
  memberTeam: { color: '#fff', fontSize: 14, fontWeight: 600 },
  memberUser: { color: '#666', fontSize: 12 },
  memberEmpty: { color: '#555', fontSize: 14 },
  commBadge: { color: '#c8102e', fontSize: 10, fontWeight: 700, marginTop: 4 },
  commActions: { display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' },
  draftHint: { color: '#888', fontSize: 14, margin: 0 },
  startDraftBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  startDraftDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  deleteDivider: { width: '100%', height: 1, background: '#2a2a2a', margin: '4px 0' },
  deleteLeagueBtn: { background: 'transparent', border: '1px solid #3a1a1a', borderRadius: 6, color: '#ff5252', fontSize: 14, padding: '8px 16px', cursor: 'pointer' },
  deleteConfirm: { background: '#1a1010', border: '1px solid #3a1a1a', borderRadius: 8, padding: '12px 16px', width: '100%', boxSizing: 'border-box' as const },
  memberSheetBody: { padding: '24px 24px 36px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 },
  memberSheetAvatar: { width: 72, height: 72, borderRadius: '50%', border: '3px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 8 },
  memberSheetName: { color: '#fff', fontSize: 20, fontWeight: 700 },
  memberSheetUser: { color: '#555', fontSize: 14 },
  memberSheetStats: { display: 'flex', alignItems: 'center', gap: 0, marginTop: 20, background: '#111', border: '1px solid #222', borderRadius: 12, overflow: 'hidden', width: '100%' },
  memberSheetStat: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4, padding: '16px 0' },
  memberSheetStatVal: { color: '#fff', fontSize: 20, fontWeight: 700 },
  memberSheetStatLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  memberSheetStatDivider: { width: 1, height: 40, background: '#222', flexShrink: 0 },
  memberSheetStreak: { fontSize: 14, fontWeight: 700, marginTop: 4 },
  memberSheetRank: { color: '#555', fontSize: 12, marginTop: 2 },
  memberSheetBragRow: { marginTop: 16, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6 },
  memberSheetBragUfc: { background: '#2a2000', border: '1px solid #ffd70066', borderRadius: 8, color: '#ffd700', fontSize: 14, fontWeight: 700, padding: '8px 18px' },
  memberSheetBragBmf: { background: '#0f0f0f', border: '1px solid #c8a00066', borderRadius: 8, color: '#c8a000', fontSize: 14, fontWeight: 700, padding: '8px 18px', letterSpacing: 0.5 },
  memberSheetBragBoth: { background: '#1a1000', border: '1px solid #ffd70066', borderRadius: 8, color: '#ffd700', fontSize: 14, fontWeight: 700, padding: '8px 18px', textAlign: 'center' as const },
  msgBoard: { margin: '0 24px 24px', background: '#141414', border: '1px solid #242424', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  msgBoardTitle: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '14px 16px 10px', borderBottom: '1px solid #1a1a1a', margin: 0 },
  msgList: { maxHeight: 320, overflowY: 'auto' as const, padding: '8px 0', display: 'flex', flexDirection: 'column' as const, gap: 2 },
  msgEmpty: { color: '#444', fontSize: 14, fontStyle: 'italic', textAlign: 'center' as const, padding: '24px 16px', margin: 0 },
  msgRow: { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 14px', borderRadius: 6 },
  msgRowMe: { background: '#0f0f1a' },
  msgAvatar: { width: 28, height: 28, borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', marginTop: 1 },
  msgContent: { flex: 1, minWidth: 0 },
  msgMeta: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 },
  msgTeam: { color: '#888', fontSize: 12, fontWeight: 700 },
  msgTime: { color: '#444', fontSize: 12 },
  msgDelete: { background: 'none', border: 'none', color: '#333', fontSize: 12, cursor: 'pointer', padding: '0 2px', lineHeight: 1, marginLeft: 'auto' as const },
  msgBody: { color: '#ccc', fontSize: 14, wordBreak: 'break-word' as const, lineHeight: 1.4 },
  msgForm: { display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid #1a1a1a' },
  msgInput: { flex: 1, background: '#0f0f0f', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 14, padding: '9px 12px', outline: 'none' },
  msgSendBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0 },
  deleteConfirmText: { color: '#ccc', fontSize: 14, margin: '0 0 10px' },
  deleteConfirmRow: { display: 'flex', gap: 8 },
  deleteCancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 14, padding: '7px 14px', cursor: 'pointer' },
  deleteConfirmBtn: { background: '#3a1a1a', border: '1px solid #ff525444', borderRadius: 6, color: '#ff5252', fontSize: 14, fontWeight: 700, padding: '7px 14px', cursor: 'pointer' },
  waitingMsg: { color: '#666', fontSize: 14, margin: 0, fontStyle: 'italic' },
  error: { color: '#ff6b6b', fontSize: 14, margin: 0 },
  draftingBanner: {
    background: '#1a2a1a', borderBottom: '1px solid #4caf5044',
    padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12,
  },
  draftingDot: { width: 8, height: 8, borderRadius: '50%', background: '#ffd700' },
  draftingText: { color: '#ffd700', fontWeight: 700, fontSize: 14, flex: 1 },
  draftingLink: { color: '#4caf50', textDecoration: 'none', fontSize: 14, fontWeight: 700 },
  navGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 24 },
  navGridMobile: { gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, padding: 16 },
  navCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: 24, textDecoration: 'none', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 12,
  },
  navCardBtn: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: 24, cursor: 'pointer', display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', gap: 12,
  },
  navIcon: { fontSize: 32 },
  navLabel: { color: '#fff', fontWeight: 600, fontSize: 14 },
  memberSection: { padding: '0 24px 20px' },
  memberSectionTitle: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' },
  teamsRow: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  teamPill: { background: '#141414', border: '1px solid #242424', borderRadius: 20, padding: '6px 14px', display: 'flex', gap: 10, alignItems: 'center' },
  teamPillName: { color: '#ddd', fontSize: 14, fontWeight: 600 },
  teamPillRecord: { color: '#555', fontSize: 12 },
  eventCard: { margin: '0 24px 16px', background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  eventCardNameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  eventCardLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  eventCardName: { color: '#fff', fontSize: 16, fontWeight: 700 },
  eventCardLocation: { color: '#555', fontSize: 12 },
  eventDate: { color: '#888', fontSize: 14, fontWeight: 600 },
  eventLiveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3 },
  eventPicksLink: { color: '#c8102e', textDecoration: 'none', fontSize: 14, fontWeight: 600, marginTop: 8 },
  bellWrap: { position: 'relative' as const },
  bellBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', padding: '2px 4px', position: 'relative' as const, lineHeight: 1 },
  bellBadge: { position: 'absolute' as const, top: -4, right: -4, background: '#c8102e', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 8, padding: '1px 4px', minWidth: 14, textAlign: 'center' as const },
  notifPanel: { position: 'absolute' as const, top: 36, right: 0, width: 320, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 100, maxHeight: 400, overflowY: 'auto' as const },
  notifHeader: { padding: '12px 16px', borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  notifTitle: { color: '#fff', fontWeight: 700, fontSize: 14 },
  notifClose: { background: 'none', border: 'none', color: '#555', fontSize: 14, cursor: 'pointer' },
  notifEmpty: { color: '#555', fontSize: 14, padding: '24px 16px', textAlign: 'center' as const, fontStyle: 'italic' },
  notifItem: { padding: '12px 16px', borderBottom: '1px solid #1f1f1f' },
  notifUnread: { background: '#1f1010' },
  notifItemTitle: { color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 2 },
  notifItemBody: { color: '#888', fontSize: 12, marginBottom: 4 },
  notifItemTime: { color: '#444', fontSize: 12 },
  sheetOverlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  bottomSheet: { background: '#141414', border: '1px solid #242424', borderRadius: 16, width: '90%', maxWidth: 560, maxHeight: '70vh', display: 'flex', flexDirection: 'column' as const, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' },
  sheetHandle: { display: 'none' },
  sheetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 4px' },
  sheetTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  sheetSubtitle: { color: '#555', fontSize: 12, padding: '0 20px 12px' },
  sheetBody: { overflowY: 'auto' as const, flex: 1, padding: '0 20px 32px', display: 'flex', flexDirection: 'column' as const, gap: 4 },
  cardSegmentLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1, padding: '16px 0 8px' },
  fightRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid #1f1f1f' },
  fightRowFighter: { flex: 1, display: 'flex', alignItems: 'center', gap: 8 },
  fightRowImg: { width: 36, height: 44, objectFit: 'cover' as const, objectPosition: 'top center', borderRadius: 4, background: '#111', flexShrink: 0 },
  fightRowInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  fightRowName: { color: '#ddd', fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
  fightRowOdds: { color: '#555', fontSize: 12 },
  fightRowCenter: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, flexShrink: 0, minWidth: 64, padding: '0 8px' },
  fightRowVs: { color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  fightRowWeight: { color: '#444', fontSize: 10, textAlign: 'center' as const, lineHeight: 1.3 },
  newSeasonCard: { margin: '0 24px 16px', background: '#111', border: '1px solid #2a2a2a', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  newSeasonText: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  newSeasonTitle: { color: '#fff', fontSize: 14, fontWeight: 700 },
  newSeasonSub: { color: '#555', fontSize: 12 },
  newSeasonBtn: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, color: '#c8102e', fontSize: 14, fontWeight: 700, padding: '9px 18px', cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  newSeasonCancelBtn: { background: '#2a2a2a', border: 'none', borderRadius: 6, color: '#aaa', fontSize: 14, padding: '8px 14px', cursor: 'pointer' },
  newSeasonConfirmBtn: { background: '#c8102e', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, padding: '8px 14px', cursor: 'pointer' },
  championBanner: {
    background: 'linear-gradient(135deg, #1a0a0a 0%, #2a1010 50%, #1a0a0a 100%)',
    border: '1px solid #c8102e66', borderLeft: '4px solid #c8102e',
    padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20,
  },
  championTrophy: { fontSize: 40, lineHeight: 1, flexShrink: 0 },
  championText: { display: 'flex', flexDirection: 'column' as const, gap: 3 },
  championLabel: { color: '#c8102e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 1 },
  championName: { color: '#fff', fontSize: 20, fontWeight: 700 },
};
