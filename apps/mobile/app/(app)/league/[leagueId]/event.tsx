import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Alert,
  TextInput,
  Share,
  Modal,
  Image,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Target,
  Swords,
  BarChart3,
  Calendar,
  Trophy,
  Eye,
  ClipboardList,
  Gavel,
  X,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';
import { useLeagueStore } from '../../../../src/store/league.store';
import { MemberAvatar } from '../../../../src/components/MemberAvatar';
import { LeagueNavBar } from '../../../../src/components/LeagueNavBar';
import { PicksColumns, StakingColumns } from '../../../../src/components/MatchupPickColumns';
import { useRefresh } from '../../../../src/hooks/useRefresh';
import type { League } from '@fantasy-ufc/shared';

// Scoreboard score size scales down on narrow phones (capped at 28 so the banner never grows).
const SCREEN_W = Dimensions.get('window').width;
const BANNER_SCORE_SIZE = SCREEN_W < 350 ? 23 : SCREEN_W < 380 ? 26 : 28;

function FightPhoto({ uri }: { uri?: string | null }) {
  if (uri) return <Image source={{ uri }} style={s.fcPhoto} resizeMode="cover" />;
  return <View style={[s.fcPhoto, s.fcPhotoFallback]} />;
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
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

export default function LeagueEventScreen({ leagueIdProp }: { leagueIdProp?: string }) {
  const params = useLocalSearchParams<{ leagueId: string }>();
  const leagueId = leagueIdProp ?? params.leagueId;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = useRefresh();
  const qc = useQueryClient();
  const { session } = useAuthStore();
  const setCurrentLeagueId = useLeagueStore((st) => st.setCurrentLeagueId);
  useEffect(() => {
    if (leagueId) setCurrentLeagueId(leagueId);
  }, [leagueId, setCurrentLeagueId]);
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [showFightCard, setShowFightCard] = useState(false);

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

  // Full event fight card for the title-tap modal.
  const { data: fightCardData } = useQuery<{ fights: any[] }>({
    queryKey: ['fight-card', leagueId, matchupEventId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}`),
    enabled: showFightCard && !!matchupEventId,
  });
  const isStakingLeague = (league as any)?.leagueFormat === 'staking';
  const matchupIsLive = matchup?.eventStatus === 'live';
  const liveInterval = matchupIsLive ? 30_000 : (false as const);

  const { data: homePicks } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayPicks } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/picks/${matchupEventId}?memberId=${matchupAwayId}`),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupAwayId,
    refetchInterval: liveInterval,
  });
  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () =>
      apiClient.get(
        `/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupHomeId}`,
      ),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () =>
      apiClient.get(
        `/leagues/${leagueId}/picks/${matchupEventId}/champion?memberId=${matchupAwayId}`,
      ),
    enabled: !isStakingLeague && !!matchupEventId && !!matchupAwayId,
    refetchInterval: liveInterval,
  });
  const { data: homeStaking } = useQuery<any>({
    queryKey: ['matchup-staking-home', leagueId, matchupEventId, matchupHomeId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupHomeId}`),
    enabled: isStakingLeague && !!matchupEventId && !!matchupHomeId,
    refetchInterval: liveInterval,
  });
  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, matchupEventId, matchupAwayId],
    queryFn: () =>
      apiClient.get(`/leagues/${leagueId}/staking/${matchupEventId}?memberId=${matchupAwayId}`),
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
    mutationFn: (name: string) =>
      apiClient.patch(`/leagues/${leagueId}/members/me`, { teamName: name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['league-members', leagueId] });
      setEditingTeamName(false);
    },
  });

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
    ? (myStakingData?.singles?.length ?? 0) + (myStakingData?.parlays?.length ?? 0) > 0
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
    {
      label: isStaking ? 'Bets' : 'Picks',
      icon: Target,
      route: `/(app)/league/${leagueId}/picks`,
      show: isActive,
    },
    { label: 'Matchup', icon: Swords, route: `/(app)/league/${leagueId}/matchup`, show: isActive },
    {
      label: 'Standings',
      icon: BarChart3,
      route: `/(app)/league/${leagueId}/standings`,
      show: league.status !== 'setup',
    },
    {
      label: 'Schedule',
      icon: Calendar,
      route: `/(app)/league/${leagueId}/schedule`,
      show: isActive,
    },
    {
      label: 'Playoffs',
      icon: Trophy,
      route: `/(app)/league/${leagueId}/playoffs`,
      show: isActive,
    },
    {
      label: 'Compare',
      icon: Eye,
      route: `/(app)/league/${leagueId}/picks-comparison`,
      show: isActive,
    },
    { label: 'Rules', icon: ClipboardList, route: `/(app)/league/${leagueId}/rules`, show: true },
    {
      label: 'Manage',
      icon: Gavel,
      route: `/(app)/league/${leagueId}/commissioner`,
      show: isCommissioner,
    },
  ].filter((n) => n.show);

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c8102e" />
        }
      >
        <LeagueNavBar leagueId={leagueId} />

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
            <Text style={s.setupSub}>
              {league.memberCount} / {league.maxTeams} teams joined
            </Text>
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
                    {
                      text: 'Start',
                      onPress: () =>
                        apiClient
                          .post(`/leagues/${leagueId}/activate`, {})
                          .then(() => qc.invalidateQueries({ queryKey: ['league', leagueId] })),
                    },
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

        {/* ── Current matchup banner (event title + scoreboard) ── */}
        {currentEvent &&
          (() => {
            const dm = matchup;
            // Always show the logged-in user on the left.
            const flip = !!dm && !!myMember && myMember.id === dm.awayTeamId;
            const leftName = dm ? (flip ? dm.awayTeamName : dm.homeTeamName) : '';
            const rightName = dm ? (flip ? dm.homeTeamName : dm.awayTeamName) : '';
            const leftScore = dm ? +(flip ? dm.awayScore : dm.homeScore) : 0;
            const rightScore = dm ? +(flip ? dm.homeScore : dm.awayScore) : 0;
            const leftMember = members.find(
              (m) => m.id === (dm ? (flip ? dm.awayTeamId : dm.homeTeamId) : null),
            );
            const rightMember = members.find(
              (m) => m.id === (dm ? (flip ? dm.homeTeamId : dm.awayTeamId) : null),
            );
            const leftColor = (leftMember as any)?.avatarColor ?? '#5555ff';
            const rightColor = (rightMember as any)?.avatarColor ?? '#5555ff';
            const showScores = !!dm && isActive;
            const venueLine = [currentEvent.venue, currentEvent.location]
              .filter(Boolean)
              .join(' · ');
            const dateLine = currentEvent.prelimsAt ?? currentEvent.scheduledAt;
            return (
              <View style={[s.eventBanner, isLive && s.eventCardLive]}>
                <View style={[s.matchupEdge, { left: 0, backgroundColor: leftColor }]} />
                <View style={[s.matchupEdge, { right: 0, backgroundColor: rightColor }]} />

                <Text style={s.bannerLabel}>CURRENT MATCHUP</Text>
                <TouchableOpacity activeOpacity={0.8} onPress={() => setShowFightCard(true)}>
                  <Text style={[s.bannerTitle, isLive && { color: '#fff' }]} numberOfLines={2}>
                    {currentEvent.name} ›
                  </Text>
                </TouchableOpacity>

                <View style={s.bannerRow}>
                  {showScores && (
                    <View style={s.bannerTeam}>
                      <MemberAvatar
                        name={leftName}
                        color={leftColor}
                        avatarUrl={(leftMember as any)?.avatarUrl}
                        size={38}
                      />
                      <Text style={s.teamSideName} numberOfLines={1}>
                        {leftName}
                      </Text>
                      <Text
                        style={[
                          s.teamSideScore,
                          leftScore >= rightScore ? s.scoreLeading : s.scoreTrailing,
                        ]}
                      >
                        {fmtMatchupScore(leftScore, isStaking)}
                      </Text>
                      {isStaking && <Text style={s.scoreUnit}>bankroll</Text>}
                    </View>
                  )}

                  <View style={s.bannerCenter}>
                    {!!venueLine && (
                      <Text style={s.bannerVenue} numberOfLines={2}>
                        {venueLine}
                      </Text>
                    )}
                    {!!dateLine && <Text style={s.bannerDate}>{fmtDate(dateLine)}</Text>}
                  </View>

                  {showScores && (
                    <View style={s.bannerTeam}>
                      <MemberAvatar
                        name={rightName}
                        color={rightColor}
                        avatarUrl={(rightMember as any)?.avatarUrl}
                        size={38}
                      />
                      <Text style={s.teamSideName} numberOfLines={1}>
                        {rightName}
                      </Text>
                      <Text
                        style={[
                          s.teamSideScore,
                          rightScore >= leftScore ? s.scoreLeading : s.scoreTrailing,
                        ]}
                      >
                        {fmtMatchupScore(rightScore, isStaking)}
                      </Text>
                      {isStaking && <Text style={s.scoreUnit}>bankroll</Text>}
                    </View>
                  )}
                </View>

                {isActive && (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/(app)/league/${leagueId}/picks?from=event` as never)
                    }
                  >
                    <Text style={s.bannerActionLink}>
                      {isStaking
                        ? hasSubmitted
                          ? 'Edit Bets →'
                          : 'Place Bets →'
                        : hasSubmitted
                          ? 'Edit Picks →'
                          : 'Make Picks →'}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() =>
                    router.push(`/(app)/league/${leagueId}/matchup?from=event` as never)
                  }
                >
                  <Text style={s.bannerActionLink}>Matchup Details →</Text>
                </TouchableOpacity>
              </View>
            );
          })()}

        {/* ── Fight card ── */}
        {matchup &&
          isActive &&
          (() => {
            const flip = !!myMember && myMember.id === matchup.awayTeamId;
            const leftPicks = flip ? awayPicks : homePicks;
            const rightPicks = flip ? homePicks : awayPicks;
            const leftChampion = flip ? awayChampion : homeChampion;
            const rightChampion = flip ? homeChampion : awayChampion;
            const leftStaking = flip ? awayStaking : homeStaking;
            const rightStaking = flip ? homeStaking : awayStaking;
            const locked = !!(homePicks?.locked || awayPicks?.locked);
            return (
              <>
                {/* Fight card — fighters with your pick/bet shown underneath */}
                <View style={s.fightCardSection}>
                  <View style={s.fightCardHeader}>
                    <Text style={s.fightCardLabel}>FIGHT CARD</Text>
                    {locked && (
                      <View style={s.lockedBadge}>
                        <Text style={s.lockedText}>LOCKED</Text>
                      </View>
                    )}
                  </View>
                  <PicksColumns
                    homePicks={
                      isStaking ? (stakingFightCard?.fights ?? []) : (leftPicks?.fights ?? [])
                    }
                    awayPicks={
                      isStaking ? (stakingFightCard?.fights ?? []) : (rightPicks?.fights ?? [])
                    }
                    homeChampion={isStaking ? null : leftChampion}
                    awayChampion={isStaking ? null : rightChampion}
                    locked={isStaking ? false : locked}
                    showPicks={!isStaking}
                    highlightMine
                    staking={isStaking}
                    homeSingles={isStaking ? (leftStaking?.singles ?? []) : []}
                    awaySingles={isStaking ? (rightStaking?.singles ?? []) : []}
                  />
                </View>

                {/* Parlays — separate banner (staking only) */}
                {isStaking && (
                  <View style={s.fightCardSection}>
                    <View style={s.fightCardHeader}>
                      <Text style={s.fightCardLabel}>PARLAYS</Text>
                    </View>
                    <StakingColumns homeStaking={leftStaking} awayStaking={rightStaking} />
                  </View>
                )}
              </>
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
                  onPress={() => router.push(`${item.route}?from=event` as never)}
                >
                  <item.icon size={22} color="#c8102e" style={s.navIcon} />
                  <Text style={s.navLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              {row.length < 3 &&
                Array.from({ length: 3 - row.length }).map((_, i) => (
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
              <Text style={s.inviteFooterCode}>
                {league.inviteCode} <Text style={s.inviteFooterCopy}>{copyMsg || 'Copy'}</Text>
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Teams strip (footer) ── */}
        {members.length > 0 && (
          <View style={s.teamsSection}>
            <Text style={s.teamsSectionTitle}>Teams</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.navBarMembers}
            >
              {members.map((m) => {
                const isMe = m.userId === session?.user?.id;
                return (
                  <TouchableOpacity
                    key={m.id}
                    onPress={() =>
                      router.push(`/(app)/league/${leagueId}/team/${m.id}?from=event` as never)
                    }
                    onLongPress={() => {
                      if (isMe) {
                        setTeamNameInput(m.teamName);
                        setEditingTeamName(true);
                      }
                    }}
                    style={s.navBarAvatar}
                  >
                    <MemberAvatar
                      name={m.teamName}
                      color={(m as any).avatarColor}
                      avatarUrl={(m as any).avatarUrl}
                      size={32}
                    />
                    {m.isChampion && (
                      <View style={s.navBarChampBadge}>
                        <Trophy size={10} color="#ffd700" />
                      </View>
                    )}
                    {isMe && (
                      <View
                        style={[
                          s.navBarMeDot,
                          { backgroundColor: (m as any).avatarColor ?? '#c8102e' },
                        ]}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}
      </ScrollView>

      {/* ── Event fight card modal ── */}
      <Modal
        visible={showFightCard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFightCard(false)}
      >
        <Pressable style={s.sheetOverlay} onPress={() => setShowFightCard(false)}>
          <Pressable style={s.fightSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <Text style={s.sheetTitle} numberOfLines={1}>
                {currentEvent?.name ?? 'Fight Card'}
              </Text>
              <TouchableOpacity onPress={() => setShowFightCard(false)} hitSlop={8}>
                <X size={18} color="#888" />
              </TouchableOpacity>
            </View>
            {currentEvent &&
              ([currentEvent.venue, currentEvent.location].filter(Boolean).length > 0 ||
                (currentEvent.prelimsAt ?? currentEvent.scheduledAt)) && (
                <Text style={s.sheetSubtitle} numberOfLines={1}>
                  {[
                    [currentEvent.venue, currentEvent.location].filter(Boolean).join(' · '),
                    (currentEvent.prelimsAt ?? currentEvent.scheduledAt)
                      ? fmtDate(currentEvent.prelimsAt ?? currentEvent.scheduledAt)
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              )}
            <ScrollView
              style={s.sheetBody}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            >
              {!matchupEventId ? (
                <Text style={s.sheetEmpty}>No event available</Text>
              ) : !fightCardData ? (
                <Text style={s.sheetEmpty}>Loading…</Text>
              ) : fightCardData.fights.length === 0 ? (
                <Text style={s.sheetEmpty}>No fight card available yet</Text>
              ) : (
                (['main', 'prelims', 'early_prelims'] as const).map((seg) => {
                  const segLabel: Record<string, string> = {
                    main: 'Main Card',
                    prelims: 'Prelims',
                    early_prelims: 'Early Prelims',
                  };
                  const fights = fightCardData.fights.filter((f: any) => f.cardSegment === seg);
                  if (!fights.length) return null;
                  return (
                    <View key={seg}>
                      <Text style={s.cardSegmentLabel}>{segLabel[seg]}</Text>
                      {fights.map((f: any) => {
                        const redOdds =
                          f.redFighterOdds != null
                            ? f.redFighterOdds > 0
                              ? `+${f.redFighterOdds}`
                              : `${f.redFighterOdds}`
                            : null;
                        const blueOdds =
                          f.blueFighterOdds != null
                            ? f.blueFighterOdds > 0
                              ? `+${f.blueFighterOdds}`
                              : `${f.blueFighterOdds}`
                            : null;
                        return (
                          <View key={f.id} style={s.fcRow}>
                            <View style={s.fcFighter}>
                              <FightPhoto uri={f.redImageUrl} />
                              <View style={s.fcInfo}>
                                <Text style={s.fcName} numberOfLines={2}>
                                  {f.redFirstName} {f.redLastName}
                                </Text>
                                {redOdds && <Text style={s.fcOdds}>{redOdds}</Text>}
                              </View>
                            </View>
                            <View style={s.fcCenter}>
                              <Text style={s.fcVs}>VS</Text>
                              <Text style={s.fcWeight} numberOfLines={1}>
                                {f.weightClassName}
                              </Text>
                            </View>
                            <View style={[s.fcFighter, s.fcFighterRight]}>
                              <FightPhoto uri={f.blueImageUrl} />
                              <View style={[s.fcInfo, { alignItems: 'flex-end' }]}>
                                <Text style={[s.fcName, { textAlign: 'right' }]} numberOfLines={2}>
                                  {f.blueFirstName} {f.blueLastName}
                                </Text>
                                {blueOdds && <Text style={s.fcOdds}>{blueOdds}</Text>}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Rename team modal ── */}
      <Modal
        visible={editingTeamName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingTeamName(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setEditingTeamName(false)}>
          <Pressable style={s.renameSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={s.renameLabel}>Team Name</Text>
            <TextInput
              style={s.renameInput}
              value={teamNameInput}
              onChangeText={setTeamNameInput}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() =>
                teamNameInput.trim() && renameTeamMutation.mutate(teamNameInput.trim())
              }
            />
            <View style={s.renameActions}>
              <TouchableOpacity onPress={() => setEditingTeamName(false)}>
                <Text style={s.renameCancel}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.renameSaveBtn}
                onPress={() =>
                  teamNameInput.trim() && renameTeamMutation.mutate(teamNameInput.trim())
                }
                disabled={!teamNameInput.trim() || renameTeamMutation.isPending}
              >
                <Text style={s.renameSave}>
                  {renameTeamMutation.isPending ? 'Saving…' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  // Top nav bar
  navBarMembers: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingRight: 8 },
  teamsSection: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  teamsSectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  navBarAvatar: { position: 'relative' },
  navBarChampBadge: { position: 'absolute', top: -3, right: -3 },
  navBarMeDot: {
    position: 'absolute',
    bottom: -3,
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#0d0d0d',
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 24 },

  // Event fight card sheet
  sheetOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
  fightSheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderColor: '#262626',
    maxHeight: '85%',
    paddingTop: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '800', flex: 1, marginRight: 8 },
  sheetSubtitle: { color: '#666', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  sheetBody: { paddingHorizontal: 12 },
  sheetEmpty: { color: '#555', fontSize: 14, textAlign: 'center', paddingVertical: 32 },
  cardSegmentLabel: {
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  fcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1c',
  },
  fcFighter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fcFighterRight: { flexDirection: 'row-reverse' },
  fcPhoto: { width: 40, height: 50, borderRadius: 5, backgroundColor: '#181818' },
  fcPhotoFallback: { backgroundColor: '#181818' },
  fcInfo: { flex: 1, gap: 2 },
  fcName: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  fcOdds: { color: '#777', fontSize: 11, fontWeight: '600' },
  fcCenter: { width: 56, alignItems: 'center', paddingHorizontal: 4 },
  fcVs: { color: '#444', fontSize: 11, fontWeight: '800' },
  fcWeight: {
    color: '#555',
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 2,
  },

  renameSheet: {
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262626',
    padding: 18,
  },
  renameLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  renameInput: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 18,
    marginTop: 16,
  },
  renameCancel: { color: '#777', fontSize: 14, fontWeight: '600' },
  renameSaveBtn: {
    backgroundColor: '#c8102e',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  renameSave: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Champion banner
  champBanner: {
    backgroundColor: '#1a1400',
    borderBottomWidth: 1,
    borderBottomColor: '#3a3000',
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  champBannerText: { color: '#ffd700', fontSize: 14, fontWeight: '700' },

  // My Team

  // Avatar

  // Setup
  setupCard: {
    margin: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    padding: 20,
    gap: 12,
  },
  setupTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  setupSub: { color: '#666', fontSize: 13 },
  inviteRow: { gap: 4 },
  inviteLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  inviteCodeBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  inviteCode: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 2 },
  inviteCopy: { color: '#c8102e', fontSize: 12, fontWeight: '600' },
  startBtn: {
    backgroundColor: '#c8102e',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  startBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  setupHint: { color: '#666', fontSize: 13, textAlign: 'center' },

  // Event card
  eventCardLive: { borderColor: '#c8102e', backgroundColor: '#1a0808' },

  // Matchup banner
  eventBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    paddingVertical: 14,
    paddingHorizontal: 14,
    overflow: 'hidden',
    alignItems: 'center',
  },
  matchupEdge: { position: 'absolute', top: 0, bottom: 0, width: 4, opacity: 0.9 },
  bannerLabel: { color: '#777', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  bannerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 12,
  },
  bannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  bannerTeam: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  bannerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  bannerVenue: { color: '#666', fontSize: 11, textAlign: 'center', lineHeight: 14 },
  bannerDate: { color: '#888', fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 3 },
  bannerActionLink: {
    color: '#c8102e',
    fontWeight: '700',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  teamSideName: {
    color: '#888',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  teamSideScore: {
    fontSize: BANNER_SCORE_SIZE,
    fontWeight: '800',
    color: '#666',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  scoreUnit: {
    color: '#555',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  scoreLeading: { color: '#fff' },
  scoreTrailing: { color: '#555' },

  // Fight card
  fightCardSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  fightCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  fightCardLabel: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  lockedBadge: {
    backgroundColor: '#222',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedText: { color: '#555', fontSize: 9, fontWeight: '700' },

  // Members

  // Nav
  nav: { padding: 16, paddingTop: 8, gap: 8 },
  navRow: { flexDirection: 'row', gap: 8 },
  navItem: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#141414',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242424',
  },
  navIcon: { marginBottom: 6 },
  navLabel: { color: '#ddd', fontSize: 11, fontWeight: '600' },

  // Invite footer
  inviteFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#111',
  },
  inviteFooterLabel: { color: '#444', fontSize: 12 },
  inviteFooterCode: { color: '#666', fontSize: 13, fontWeight: '600', letterSpacing: 1 },
  inviteFooterCopy: { color: '#c8102e', fontSize: 11, fontWeight: '600' },
});
