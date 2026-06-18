import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Alert, TextInput, Share, Animated, Modal,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Target, Swords, BarChart3, Calendar, Trophy, Eye, ClipboardList, Gavel, Bell, X, ChevronLeft,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';
import { MemberAvatar } from '../../../../src/components/MemberAvatar';
import { PicksColumns, StakingColumns } from '../../../../src/components/MatchupPickColumns';
import { seasonByRegularEnd } from '@fantasy-ufc/shared';
import type { League, Matchup } from '@fantasy-ufc/shared';

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[s.liveDot, { opacity }]} />;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtMatchupScore(n: number, isStaking: boolean): string {
  if (isStaking) {
    return n < 0 ? `($${Math.abs(n).toFixed(0)})` : `$${n.toFixed(0)}`;
  }
  return n.toFixed(1);
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function LeagueHomeScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuthStore();
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    enabled: !!league,
  });

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
    enabled: !!league,
  });

  const { data: matchup } = useQuery<any>({
    queryKey: ['matchup', 'current', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/current`),
    enabled: !!league,
  });

  const matchupEventId = matchup?.eventId;
  const matchupHomeId = matchup?.homeTeamId;
  const matchupAwayId = matchup?.awayTeamId;
  const isStakingLeague = (league as any)?.leagueFormat === 'staking';
  const matchupIsLive = matchup?.eventStatus === 'live';
  const liveInterval = matchupIsLive ? 30_000 : (false as const);

  const { data: homePicks } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayPicks } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupAwayId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupAwayId,
    refetchInterval: liveInterval,
  });
  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupHomeId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupAwayId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupAwayId,
    refetchInterval: liveInterval,
  });
  const { data: homeStaking } = useQuery<any>({
    queryKey: ['matchup-staking-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupAwayId}`),
    enabled: isStakingLeague && !!matchupEventId && !!matchupAwayId,
    refetchInterval: liveInterval,
  });
  // Staking leagues still need the fight list (without picks) so users can see the card they're betting on
  const { data: stakingFightCard } = useQuery<any>({
    queryKey: ['staking-fightcard', leagueId, matchupEventId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}`),
    enabled: isStakingLeague && !!matchupEventId,
  });

  const renameTeamMutation = useMutation({
    mutationFn: (name: string) => apiClient.patch(`/leagues/${leagueId}/members/me`, { teamName: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] });
      setEditingTeamName(false);
    },
  });

  const { data: unreadCount } = useQuery<{ count: number }>({
    queryKey: ['notif-unread'],
    queryFn: () => apiClient.get('/notifications/unread-count'),
    refetchInterval: 60_000,
  });

  const { data: notifications = [], refetch: refetchNotifs } = useQuery<any[]>({
    queryKey: ['notifications'],
    queryFn: () => apiClient.get('/notifications'),
    enabled: showNotifs,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notif-unread'] });
      refetchNotifs();
    },
  });

  function openNotifs() {
    setShowNotifs(true);
    refetchNotifs();
    if ((unreadCount?.count ?? 0) > 0) markAllReadMutation.mutate();
  }

  if (!league) return null;

  const isStaking = (league as any).leagueFormat === 'staking';
  const isCommissioner =
    session?.user?.id === (league as any).commissionerId ||
    session?.user?.id === (league as any).commissionerUserId;
  const myMember = members.find((m) => m.userId === session?.user?.id);
  const isSetup = league.status === 'setup';
  const isActive = league.status === 'active' || league.status === 'playoffs';
  const champion = members.find((m) => m.isChampion);
  const isLive = matchup?.eventStatus === 'live' || currentEvent?.status === 'live';

  // Has the logged-in user already submitted picks / placed bets for this matchup's event?
  const myIsHome = !!myMember && !!matchup && myMember.id === matchup.homeTeamId;
  const myIsAway = !!myMember && !!matchup && myMember.id === matchup.awayTeamId;
  const myPicksData = myIsHome ? homePicks : myIsAway ? awayPicks : null;
  const myStakingData = myIsHome ? homeStaking : myIsAway ? awayStaking : null;
  const hasSubmitted = isStaking
    ? ((myStakingData?.singles?.length ?? 0) + (myStakingData?.parlays?.length ?? 0)) > 0
    : !!myPicksData?.fights?.some((f: any) => f.pickedFighterId);

  async function copyInviteCode() {
    const code = (league as any)?.inviteCode;
    if (!code) return;
    try {
      await Share.share({ message: `Join my Fantasy UFC league! Code: ${code}` });
    } catch {
      setCopyMsg(code);
      setTimeout(() => setCopyMsg(''), 3000);
    }
  }

  const navItems = [
    { label: isStaking ? 'Bets' : 'Picks', icon: Target, route: `/(app)/league/${leagueId}/picks`, show: isActive },
    { label: 'Matchup', icon: Swords, route: `/(app)/league/${leagueId}/matchup`, show: isActive },
    { label: 'Standings', icon: BarChart3, route: `/(app)/league/${leagueId}/standings`, show: league.status !== 'setup' },
    { label: 'Schedule', icon: Calendar, route: `/(app)/league/${leagueId}/schedule`, show: isActive },
    { label: 'Playoffs', icon: Trophy, route: `/(app)/league/${leagueId}/playoffs`, show: isActive },
    { label: 'Compare', icon: Eye, route: `/(app)/league/${leagueId}/picks-comparison`, show: isActive },
    { label: 'Rules', icon: ClipboardList, route: `/(app)/league/${leagueId}/rules`, show: true },
    { label: 'Manage', icon: Gavel, route: `/(app)/league/${leagueId}/commissioner`, show: isCommissioner },
  ].filter((n) => n.show);

  return (
    <>
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>

      {/* ── Top nav bar ── */}
      <View style={[s.navBar, { paddingTop: insets.top + 8 }]}>
        <View style={s.navBarTop}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <ChevronLeft size={24} color="#888" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.leagueName} numberOfLines={1}>{league.name}</Text>
            <Text style={s.leagueMeta} numberOfLines={1}>
              {(() => {
                const seasonLabel = (league as any).seasonEndsAt
                  ? seasonByRegularEnd(new Date((league as any).seasonEndsAt))?.label
                  : null;
                const label = seasonLabel ?? ((league as any).seasonYear ? `Season ${(league as any).seasonYear}` : null);
                return label ? `${label} · ` : '';
              })()}{league.memberCount} / {league.maxTeams} teams
              {isStaking ? ' · Staking' : ''}
            </Text>
          </View>
          <View style={[s.statusBadge, statusColor(league.status)]}>
            <Text style={s.statusText}>{league.status.toUpperCase()}</Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={openNotifs}>
            <Bell size={20} color="#ccc" />
            {(unreadCount?.count ?? 0) > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>{unreadCount!.count > 9 ? '9+' : unreadCount!.count}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {members.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.navBarMembers}>
            {members.map((m) => {
              const isMe = m.userId === session?.user?.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  onPress={() => router.push(`/(app)/league/${leagueId}/team/${m.id}` as never)}
                  onLongPress={() => { if (isMe) { setTeamNameInput(m.teamName); setEditingTeamName(true); } }}
                  style={s.navBarAvatar}
                >
                  <MemberAvatar name={m.teamName} color={(m as any).avatarColor} avatarUrl={(m as any).avatarUrl} size={32} />
                  {m.isChampion && <View style={s.navBarChampBadge}><Trophy size={10} color="#ffd700" /></View>}
                  {isMe && <View style={[s.navBarMeDot, { backgroundColor: (m as any).avatarColor ?? '#c8102e' }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Champion banner ── */}
      {league.status === 'completed' && champion && (
        <View style={s.champBanner}>
          <Trophy size={15} color="#ffd700" />
          <Text style={s.champBannerText}>Season Champion: {champion.teamName}</Text>
        </View>
      )}

      {/* ── Setup lobby ── */}
      {isSetup && (
        <View style={s.setupCard}>
          <Text style={s.setupTitle}>Waiting for players to join</Text>
          <Text style={s.setupSub}>{league.memberCount} / {league.maxTeams} teams joined</Text>
          <View style={s.inviteRow}>
            <Text style={s.inviteLabel}>Invite code</Text>
            <TouchableOpacity onPress={copyInviteCode} style={s.inviteCodeBtn}>
              <Text style={s.inviteCode}>{league.inviteCode}</Text>
              <Text style={s.inviteCopy}>{copyMsg || 'Tap to copy'}</Text>
            </TouchableOpacity>
          </View>
          {isCommissioner && (league.memberCount ?? 0) >= 2 && (
            <TouchableOpacity
              style={s.startBtn}
              onPress={() => {
                Alert.alert('Start Season', 'This will start the season for all members.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Start', onPress: () => apiClient.post(`/leagues/${leagueId}/activate`, {}).then(() => qc.invalidateQueries({ queryKey: ['league', leagueId] })) },
                ]);
              }}
            >
              <Text style={s.startBtnText}>Start Season →</Text>
            </TouchableOpacity>
          )}
          {isCommissioner && (league.memberCount ?? 0) < 2 && (
            <Text style={s.setupHint}>Need at least 2 teams to start the season</Text>
          )}
        </View>
      )}

      {/* ── Current matchup scoreboard ── */}
      {matchup && isActive && (() => {
        // Always show the logged-in user on the left
        const flip = !!myMember && myMember.id === matchup.awayTeamId;
        const leftName = flip ? matchup.awayTeamName : matchup.homeTeamName;
        const rightName = flip ? matchup.homeTeamName : matchup.awayTeamName;
        const leftScore = +(flip ? matchup.awayScore : matchup.homeScore);
        const rightScore = +(flip ? matchup.homeScore : matchup.awayScore);
        const leftMember = members.find((m) => m.id === (flip ? matchup.awayTeamId : matchup.homeTeamId));
        const rightMember = members.find((m) => m.id === (flip ? matchup.homeTeamId : matchup.awayTeamId));
        const leftColor = (leftMember as any)?.avatarColor ?? '#5555ff';
        const rightColor = (rightMember as any)?.avatarColor ?? '#5555ff';
        const leader = leftScore > rightScore ? leftName : rightScore > leftScore ? rightName : null;
        const diff = Math.abs(leftScore - rightScore);
        const hasScores = leftScore !== 0 || rightScore !== 0;
        return (
          <TouchableOpacity
            style={s.matchupCard}
            activeOpacity={0.85}
            onPress={() => router.push(`/(app)/league/${leagueId}/matchup` as never)}
          >
            <View style={[s.matchupEdge, { left: 0, backgroundColor: leftColor }]} />
            <View style={[s.matchupEdge, { right: 0, backgroundColor: rightColor }]} />
            <View style={s.matchupLabelRow}>
              {isLive ? (
                <View style={s.livePill}>
                  <LiveDot />
                  <Text style={s.livePipText}>LIVE</Text>
                </View>
              ) : (
                <Text style={s.matchupLabel}>CURRENT MATCHUP</Text>
              )}
            </View>
            <View style={s.matchupScores}>
              <View style={s.teamSide}>
                <MemberAvatar name={leftName} color={leftColor} avatarUrl={(leftMember as any)?.avatarUrl} size={36} />
                <Text style={s.teamSideName} numberOfLines={1}>{leftName}</Text>
                <Text style={[
                  s.teamSideScore,
                  leftScore >= rightScore ? s.scoreLeading : s.scoreTrailing,
                ]}>
                  {fmtMatchupScore(leftScore, isStaking)}
                </Text>
              </View>
              <Text style={s.vs}>VS</Text>
              <View style={s.teamSide}>
                <MemberAvatar name={rightName} color={rightColor} avatarUrl={(rightMember as any)?.avatarUrl} size={36} />
                <Text style={s.teamSideName} numberOfLines={1}>{rightName}</Text>
                <Text style={[
                  s.teamSideScore,
                  rightScore >= leftScore ? s.scoreLeading : s.scoreTrailing,
                ]}>
                  {fmtMatchupScore(rightScore, isStaking)}
                </Text>
              </View>
            </View>
            {hasScores && (
              <View style={s.leadChip}>
                <Text style={s.leadChipText}>
                  {leader
                    ? `${leader} leads by ${isStaking ? `$${diff.toFixed(0)}` : diff.toFixed(1)}`
                    : 'Tied'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })()}

      {/* ── Current event card ── */}
      {currentEvent && (
        <View style={[s.eventCard, isLive && s.eventCardLive]}>
          <View style={s.eventCardHeader}>
            {isLive && <View style={s.livePip}><Text style={s.livePipText}>LIVE</Text></View>}
            <Text style={[s.eventCardName, isLive && { color: '#fff' }]} numberOfLines={1}>
              {currentEvent.name}
            </Text>
          </View>
          {(currentEvent.venue || currentEvent.location) && (
            <Text style={s.eventCardMeta} numberOfLines={1}>
              {[currentEvent.venue, currentEvent.location].filter(Boolean).join(' · ')}
            </Text>
          )}
          {(currentEvent.prelimsAt ?? currentEvent.scheduledAt) && !isLive && (
            <Text style={s.eventCardDate}>
              {fmtDate(currentEvent.prelimsAt ?? currentEvent.scheduledAt)}
            </Text>
          )}
          {isActive && (
            <TouchableOpacity
              style={s.picksBtn}
              onPress={() => router.push(`/(app)/league/${leagueId}/picks` as never)}
            >
              <Text style={s.picksBtnText}>
                {isStaking
                  ? (hasSubmitted ? 'Edit Bets →' : 'Place Bets →')
                  : (hasSubmitted ? 'Edit Picks →' : 'Submit Picks →')}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Fight card ── */}
      {matchup && isActive && (() => {
        const flip = !!myMember && myMember.id === matchup.awayTeamId;
        const leftPicks = flip ? awayPicks : homePicks;
        const rightPicks = flip ? homePicks : awayPicks;
        const leftChampion = flip ? awayChampion : homeChampion;
        const rightChampion = flip ? homeChampion : awayChampion;
        const leftStaking = flip ? awayStaking : homeStaking;
        const rightStaking = flip ? homeStaking : awayStaking;
        const locked = !!(homePicks?.locked || awayPicks?.locked);
        return (
          <View style={s.fightCardSection}>
            <View style={s.fightCardHeader}>
              <Text style={s.fightCardLabel}>FIGHT CARD</Text>
              {locked && <View style={s.lockedBadge}><Text style={s.lockedText}>LOCKED</Text></View>}
            </View>
            {isStaking ? (
              <>
                <PicksColumns
                  homePicks={stakingFightCard?.fights ?? []}
                  awayPicks={stakingFightCard?.fights ?? []}
                  homeChampion={null}
                  awayChampion={null}
                  locked={false}
                  showPicks={false}
                />
                <StakingColumns homeStaking={leftStaking} awayStaking={rightStaking} />
              </>
            ) : (
              <PicksColumns
                homePicks={leftPicks?.fights ?? []}
                awayPicks={rightPicks?.fights ?? []}
                homeChampion={leftChampion}
                awayChampion={rightChampion}
                locked={locked}
              />
            )}
          </View>
        );
      })()}

      {/* ── Nav grid ── */}
      <View style={s.nav}>
        {chunk(navItems, 3).map((row, ri) => (
          <View key={ri} style={s.navRow}>
            {row.map((item) => (
              <TouchableOpacity
                key={item.label}
                style={s.navItem}
                onPress={() => router.push(item.route as never)}
              >
                <item.icon size={22} color="#c8102e" style={s.navIcon} />
                <Text style={s.navLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
              <View key={`empty-${i}`} style={[s.navItem, { opacity: 0 }]} />
            ))}
          </View>
        ))}
      </View>

      {/* ── Invite code (non-setup) ── */}
      {!isSetup && (
        <View style={s.inviteFooter}>
          <Text style={s.inviteFooterLabel}>Invite Code</Text>
          <TouchableOpacity onPress={copyInviteCode}>
            <Text style={s.inviteFooterCode}>{league.inviteCode}  <Text style={s.inviteFooterCopy}>{copyMsg || 'Copy'}</Text></Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>

    {/* ── Notifications modal ── */}
    <Modal visible={showNotifs} transparent animationType="fade" onRequestClose={() => setShowNotifs(false)}>
      <Pressable style={s.modalOverlay} onPress={() => setShowNotifs(false)}>
        <Pressable style={s.notifSheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.notifHeader}>
            <Text style={s.notifTitle}>Notifications</Text>
            <TouchableOpacity onPress={() => setShowNotifs(false)}><X size={18} color="#888" /></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {notifications.length === 0 ? (
              <Text style={s.notifEmpty}>No notifications yet</Text>
            ) : (
              notifications.map((n) => (
                <View key={n.id} style={[s.notifItem, !n.isRead && s.notifItemUnread]}>
                  <Text style={s.notifItemTitle}>{n.title}</Text>
                  {!!n.body && <Text style={s.notifItemBody}>{n.body}</Text>}
                  <Text style={s.notifItemTime}>
                    {new Date(n.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>

    {/* ── Rename team modal ── */}
    <Modal visible={editingTeamName} transparent animationType="fade" onRequestClose={() => setEditingTeamName(false)}>
      <Pressable style={s.modalOverlay} onPress={() => setEditingTeamName(false)}>
        <Pressable style={s.renameSheet} onPress={(e) => e.stopPropagation()}>
          <Text style={s.renameLabel}>Team Name</Text>
          <TextInput
            style={s.renameInput}
            value={teamNameInput}
            onChangeText={setTeamNameInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => teamNameInput.trim() && renameTeamMutation.mutate(teamNameInput.trim())}
          />
          <View style={s.renameActions}>
            <TouchableOpacity onPress={() => setEditingTeamName(false)}>
              <Text style={s.renameCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.renameSaveBtn}
              onPress={() => teamNameInput.trim() && renameTeamMutation.mutate(teamNameInput.trim())}
              disabled={!teamNameInput.trim() || renameTeamMutation.isPending}
            >
              <Text style={s.renameSave}>{renameTeamMutation.isPending ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
    </>
  );
}

function statusColor(status: string) {
  switch (status) {
    case 'active': return s.statusActive;
    case 'playoffs': return s.statusPlayoffs;
    case 'completed': return s.statusCompleted;
    default: return {};
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  // Top nav bar
  navBar: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a', backgroundColor: '#0d0d0d',
  },
  navBarTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { marginLeft: -6 },
  navBarMembers: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingRight: 8 },
  navBarAvatar: { position: 'relative' },
  navBarChampBadge: { position: 'absolute', top: -3, right: -3 },
  navBarMeDot: {
    position: 'absolute', bottom: -3, left: '50%', marginLeft: -3,
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1, borderColor: '#0d0d0d',
  },
  bellBtn: { position: 'relative', padding: 4 },
  bellBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16,
    borderRadius: 8, backgroundColor: '#c8102e', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },

  leagueName: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 3 },
  leagueMeta: { color: '#555', fontSize: 12 },
  statusBadge: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4 },
  statusActive: { backgroundColor: '#1a3a1a' },
  statusPlayoffs: { backgroundColor: '#1a1a3a' },
  statusCompleted: { backgroundColor: '#2a2a2a' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 24 },
  notifSheet: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#262626', overflow: 'hidden' },
  notifHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1f1f1f',
  },
  notifTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  notifEmpty: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 32 },
  notifItem: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  notifItemUnread: { backgroundColor: '#1a0808' },
  notifItemTitle: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  notifItemBody: { color: '#888', fontSize: 12, marginTop: 3, lineHeight: 16 },
  notifItemTime: { color: '#444', fontSize: 10, marginTop: 5 },

  renameSheet: { backgroundColor: '#141414', borderRadius: 14, borderWidth: 1, borderColor: '#262626', padding: 18 },
  renameLabel: { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  renameInput: {
    color: '#fff', fontSize: 16, fontWeight: '600',
    borderWidth: 1, borderColor: '#333', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 16 },
  renameCancel: { color: '#777', fontSize: 14, fontWeight: '600' },
  renameSaveBtn: { backgroundColor: '#c8102e', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9 },
  renameSave: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Champion banner
  champBanner: { backgroundColor: '#1a1400', borderBottomWidth: 1, borderBottomColor: '#3a3000', padding: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  champBannerText: { color: '#ffd700', fontSize: 14, fontWeight: '700' },

  // My Team
  myTeamCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 16, gap: 12,
  },
  myTeamLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  myTeamName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  editHint: { color: '#444', fontSize: 12 },
  myTeamRecord: { color: '#666', fontSize: 12, marginTop: 2 },
  myTeamRight: { alignItems: 'flex-end' },
  myTeamPtsLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  myTeamPts: { color: '#fff', fontSize: 20, fontWeight: '800' },
  teamNameEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  teamNameInput: {
    flex: 1, color: '#fff', fontSize: 15, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: '#c8102e', paddingVertical: 2,
  },
  cancelText: { color: '#555', fontSize: 12 },

  // Avatar
  avatar: { justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontWeight: '800' },

  // Setup
  setupCard: {
    margin: 16, backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#333', padding: 20, gap: 12,
  },
  setupTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  setupSub: { color: '#666', fontSize: 13 },
  inviteRow: { gap: 4 },
  inviteLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  inviteCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteCode: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  inviteCopy: { color: '#c8102e', fontSize: 12, fontWeight: '600' },
  startBtn: { backgroundColor: '#c8102e', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 4 },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  setupHint: { color: '#666', fontSize: 13, textAlign: 'center' },

  // Event card
  eventCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', padding: 16, gap: 6,
  },
  eventCardLive: { borderColor: '#c8102e', backgroundColor: '#1a0808' },
  eventCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventCardName: { color: '#ccc', fontSize: 15, fontWeight: '700', flex: 1 },
  eventCardMeta: { color: '#555', fontSize: 12 },
  eventCardDate: { color: '#666', fontSize: 12 },
  livePip: { backgroundColor: '#c8102e', borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  livePipText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  picksBtn: { marginTop: 4, backgroundColor: '#c8102e22', borderRadius: 6, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#c8102e44' },
  picksBtnText: { color: '#c8102e', fontWeight: '700', fontSize: 13 },

  // Matchup scoreboard
  matchupCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#16161d', borderRadius: 14,
    borderWidth: 1, borderColor: '#26262e',
    padding: 16, paddingHorizontal: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  matchupEdge: { position: 'absolute', top: 0, bottom: 0, width: 4, opacity: 0.9 },
  matchupLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  matchupLabel: { color: '#c8102e', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  matchupScores: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  teamSide: { flex: 1, alignItems: 'center', gap: 4 },
  teamSideName: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, maxWidth: 120 },
  teamSideScore: { fontSize: 32, fontWeight: '800', color: '#666', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  scoreLeading: { color: '#fff' },
  scoreTrailing: { color: '#555' },
  vs: { color: '#333', fontWeight: '700', paddingHorizontal: 10, fontSize: 12, alignSelf: 'center' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#c8102e', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  leadChip: {
    alignSelf: 'center', borderWidth: 1, borderColor: '#2e2e36',
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4,
  },
  leadChipText: { color: '#999', fontSize: 11, fontWeight: '700' },

  // Fight card
  fightCardSection: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#242424', overflow: 'hidden',
  },
  fightCardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  fightCardLabel: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  lockedBadge: { backgroundColor: '#222', borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  lockedText: { color: '#555', fontSize: 9, fontWeight: '700' },

  // Members
  membersSection: { marginBottom: 8 },
  sectionLabel: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 10, marginTop: 4 },
  membersRow: { paddingHorizontal: 16, gap: 16 },
  memberItem: { alignItems: 'center', gap: 4, position: 'relative' },
  memberChampBadge: { position: 'absolute', top: -4, right: -4 },
  memberTeamName: { color: '#888', fontSize: 10, fontWeight: '600', maxWidth: 56, textAlign: 'center' },
  memberRecord: { color: '#444', fontSize: 10 },

  // Nav
  nav: { padding: 16, paddingTop: 8, gap: 8 },
  navRow: { flexDirection: 'row', gap: 8 },
  navItem: {
    flex: 1, padding: 12, alignItems: 'center',
    backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#242424',
  },
  navIcon: { marginBottom: 6 },
  navLabel: { color: '#ddd', fontSize: 11, fontWeight: '600' },

  // Invite footer
  inviteFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#111',
  },
  inviteFooterLabel: { color: '#444', fontSize: 12 },
  inviteFooterCode: { color: '#666', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  inviteFooterCopy: { color: '#c8102e', fontSize: 11, fontWeight: '600' },
});
