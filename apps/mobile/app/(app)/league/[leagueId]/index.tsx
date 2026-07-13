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
  Animated,
  Modal,
  RefreshControl,
} from 'react-native';
import { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'lucide-react-native';
import { apiClient } from '../../../../src/api/client';
import { hasUfcBelt, hasBmfBelt } from '../../../../src/lib/belts';
import { useAuthStore } from '../../../../src/store/auth.store';
import { useLeagueStore } from '../../../../src/store/league.store';
import { MemberAvatar } from '../../../../src/components/MemberAvatar';
import { LeagueNavBar } from '../../../../src/components/LeagueNavBar';
import { useRefresh } from '../../../../src/hooks/useRefresh';
import type { League } from '@fantasy-ufc/shared';

function LiveDot() {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
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

function fmtTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function LeagueHomeScreen({ leagueIdProp }: { leagueIdProp?: string }) {
  const params = useLocalSearchParams<{ leagueId: string }>();
  const leagueId = leagueIdProp ?? params.leagueId;
  const router = useRouter();
  const qc = useQueryClient();
  const { refreshing, onRefresh } = useRefresh();
  const { session } = useAuthStore();
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [copyMsg, setCopyMsg] = useState('');
  const [chatInput, setChatInput] = useState('');
  const setCurrentLeagueId = useLeagueStore((st) => st.setCurrentLeagueId);
  useEffect(() => {
    if (leagueId) setCurrentLeagueId(leagueId);
  }, [leagueId, setCurrentLeagueId]);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    enabled: !!league,
  });

  const myMember = members.find((m) => m.userId === session?.user?.id);

  const { data: standings = [] } = useQuery<any[]>({
    queryKey: ['standings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/standings`),
    enabled: !!league,
  });

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ['messages', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/messages`),
    enabled: !!league,
    refetchInterval: 15_000,
  });
  const sendMessageMutation = useMutation({
    mutationFn: (body: string) => apiClient.post(`/leagues/${leagueId}/messages`, { body }),
    onSuccess: () => {
      setChatInput('');
      qc.invalidateQueries({ queryKey: ['messages', leagueId] });
    },
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

  // All matchups in the league — used to show the other pairings in the same event
  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
    enabled: !!matchup,
  });

  // The matchups for the current event, the logged-in user's pairing first
  const eventMatchups = useMemo(() => {
    if (!matchup) return [];
    const inEvent = allMatchups.filter((m) => m.eventId === matchup.eventId);
    if (inEvent.length === 0) return [matchup];
    return [
      ...inEvent.filter((m) => m.id === matchup.id),
      ...inEvent.filter((m) => m.id !== matchup.id),
    ];
  }, [allMatchups, matchup]);

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
  const isSetup = league.status === 'setup';
  const isActive = league.status === 'active' || league.status === 'playoffs';
  const champion = members.find((m) => m.isChampion);
  const isLive = matchup?.eventStatus === 'live' || currentEvent?.status === 'live';

  const sortedStandings = [...standings].sort(
    (a, b) =>
      (b.wins ?? 0) - (a.wins ?? 0) ||
      (isStaking
        ? +(b.stakingBalance ?? 0) - +(a.stakingBalance ?? 0)
        : +(b.totalPoints ?? 0) - +(a.totalPoints ?? 0)),
  );

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

  const ufc = (mem: any) => hasUfcBelt(mem, members, league);
  const bmf = (mem: any) => hasBmfBelt(mem, league);

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

        {/* ── Matchups banner (a full scoreboard per matchup in the current event) ── */}
        {isActive && eventMatchups.length > 0 && (
          <View style={s.bannerWrap}>
            <View style={s.bannerTopRow}>
              {isLive ? (
                <View style={s.livePill}>
                  <LiveDot />
                  <Text style={s.livePipText}>LIVE</Text>
                </View>
              ) : (
                <Text style={s.bannerLabel}>CURRENT EVENT</Text>
              )}
              {currentEvent && (
                <Text style={s.bannerEvent} numberOfLines={1}>
                  {currentEvent.name}
                </Text>
              )}
            </View>
            {eventMatchups.map((m) => {
              const mine =
                !!myMember && (m.homeTeamId === myMember.id || m.awayTeamId === myMember.id);
              const flip = mine && myMember!.id === m.awayTeamId;
              const leftId = flip ? m.awayTeamId : m.homeTeamId;
              const rightId = flip ? m.homeTeamId : m.awayTeamId;
              const leftName = flip ? m.awayTeamName : m.homeTeamName;
              const rightName = flip ? m.homeTeamName : m.awayTeamName;
              const leftScore = +(flip ? m.awayScore : m.homeScore) || 0;
              const rightScore = +(flip ? m.homeScore : m.awayScore) || 0;
              const leftMember = members.find((mm) => mm.id === leftId);
              const rightMember = members.find((mm) => mm.id === rightId);
              const leftColor = (leftMember as any)?.avatarColor ?? '#5555ff';
              const rightColor = (rightMember as any)?.avatarColor ?? '#5555ff';
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[s.matchupCard, mine && s.matchupCardMine]}
                  activeOpacity={0.85}
                  onPress={() =>
                    router.push(`/(app)/league/${leagueId}/matchup?m=${m.id}` as never)
                  }
                >
                  <View style={[s.matchupEdge, { left: 0, backgroundColor: leftColor }]} />
                  <View style={[s.matchupEdge, { right: 0, backgroundColor: rightColor }]} />
                  <View style={s.matchupScores}>
                    <View style={s.teamSide}>
                      <MemberAvatar
                        name={leftName}
                        color={leftColor}
                        avatarUrl={(leftMember as any)?.avatarUrl}
                        size={30}
                        ufcBelt={ufc(leftMember)}
                        bmfBelt={bmf(leftMember)}
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
                    </View>
                    <Text style={s.vs}>VS</Text>
                    <View style={s.teamSide}>
                      <MemberAvatar
                        name={rightName}
                        color={rightColor}
                        avatarUrl={(rightMember as any)?.avatarUrl}
                        size={30}
                        ufcBelt={ufc(rightMember)}
                        bmfBelt={bmf(rightMember)}
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
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Standings ── */}
        {!isSetup && sortedStandings.length > 0 && (
          <View style={s.standSection}>
            <Text style={s.standTitle}>Standings</Text>
            <View style={s.standHeadRow}>
              <Text style={s.standRank}> </Text>
              <Text style={[s.standTeam, s.standColLabel]}>Team</Text>
              <Text style={[s.standRec, s.standColLabel]}>W-L-T</Text>
              <Text style={[s.standPts, s.standColLabel]}>
                {isStaking ? 'Season P&L' : 'Season'}
              </Text>
            </View>
            {sortedStandings.map((entry, i) => {
              const isMe = entry.userId === session?.user?.id;
              const pts = isStaking
                ? fmtMatchupScore(+(entry.stakingBalance ?? 0), true)
                : (+(entry.totalPoints ?? 0)).toFixed(1);
              return (
                <TouchableOpacity
                  key={entry.id}
                  style={[s.standRow, isMe && s.standRowMine]}
                  activeOpacity={0.8}
                  onPress={() => router.push(`/(app)/league/${leagueId}/team/${entry.id}` as never)}
                >
                  <Text style={s.standRank}>{i + 1}</Text>
                  <Text style={[s.standTeam, isMe && s.standTeamMine]} numberOfLines={1}>
                    {entry.teamName}
                    {isMe ? '  (You)' : ''}
                  </Text>
                  <Text style={s.standRec}>
                    {entry.wins}-{entry.losses}
                    {entry.ties ? `-${entry.ties}` : ''}
                  </Text>
                  <Text style={s.standPts}>{pts}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── League chat ── */}
        {!isSetup && (
          <View style={s.chatSection}>
            <Text style={s.chatTitle}>League Chat</Text>
            {messages.length === 0 ? (
              <Text style={s.chatEmpty}>No messages yet — say something!</Text>
            ) : (
              messages.map((m) => {
                const isMe = m.memberId === myMember?.id;
                return (
                  <View key={m.id} style={s.chatMsg}>
                    <MemberAvatar
                      name={m.teamName ?? m.displayName ?? '?'}
                      color={m.avatarColor}
                      size={26}
                    />
                    <View style={s.chatMsgBody}>
                      <View style={s.chatMsgHead}>
                        <Text style={s.chatMsgName} numberOfLines={1}>
                          {m.teamName ?? m.displayName}
                          {isMe ? ' (You)' : ''}
                        </Text>
                        <Text style={s.chatMsgTime}>{fmtTime(m.createdAt)}</Text>
                      </View>
                      <Text style={s.chatMsgText}>{m.body}</Text>
                    </View>
                  </View>
                );
              })
            )}
            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                placeholder="Say something..."
                placeholderTextColor="#555"
                value={chatInput}
                onChangeText={setChatInput}
                multiline
              />
              <TouchableOpacity
                style={[
                  s.chatSend,
                  (!chatInput.trim() || sendMessageMutation.isPending) && s.chatSendDisabled,
                ]}
                onPress={() => chatInput.trim() && sendMessageMutation.mutate(chatInput.trim())}
                disabled={!chatInput.trim() || sendMessageMutation.isPending}
              >
                <Text style={s.chatSendText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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
                    onPress={() => router.push(`/(app)/league/${leagueId}/team/${m.id}` as never)}
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
                      ufcBelt={ufc(m)}
                      bmfBelt={bmf(m)}
                    />
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

  // Matchups banner (stacked scoreboards)
  bannerWrap: { marginBottom: 4 },
  bannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 4,
    marginBottom: 10,
  },
  bannerLabel: { color: '#666', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  bannerEvent: { color: '#bbb', fontSize: 12, fontWeight: '600', flex: 1 },
  matchupCardMine: { borderColor: '#c8102e55' },

  // Standings
  standSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    overflow: 'hidden',
  },
  standTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  standHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  standColLabel: {
    color: '#555',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // League chat
  chatSection: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#242424',
    padding: 14,
  },
  chatTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 12 },
  chatEmpty: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  chatMsg: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'flex-start' },
  chatMsgBody: { flex: 1 },
  chatMsgHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 1 },
  chatMsgName: { color: '#ccc', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  chatMsgTime: { color: '#555', fontSize: 10 },
  chatMsgText: { color: '#bbb', fontSize: 13, lineHeight: 18 },
  chatInputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 4 },
  chatInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    color: '#fff',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
  },
  chatSend: {
    backgroundColor: '#c8102e',
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  chatSendDisabled: { opacity: 0.5 },
  chatSendText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  standRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  standRowMine: { backgroundColor: '#c8102e10' },
  standRank: { width: 24, color: '#666', fontSize: 13, fontWeight: '700' },
  standTeam: { flex: 1, color: '#ddd', fontSize: 14, fontWeight: '600' },
  standTeamMine: { color: '#fff' },
  standRec: {
    color: '#888',
    fontSize: 13,
    width: 70,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  standPts: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    width: 64,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // Top nav bar
  navBarMembers: { flexDirection: 'row', gap: 10, paddingTop: 26, paddingRight: 8 },
  teamsSection: { paddingHorizontal: 16, marginTop: 8, marginBottom: 4 },
  teamsSectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  navBarAvatar: { position: 'relative' },
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
  livePipText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },

  // Matchup scoreboard
  matchupCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#16161d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26262e',
    paddingTop: 22,
    paddingBottom: 10,
    paddingHorizontal: 16,
    overflow: 'hidden',
  },
  matchupEdge: { position: 'absolute', top: 0, bottom: 0, width: 4, opacity: 0.9 },
  matchupScores: { flexDirection: 'row', alignItems: 'center' },
  teamSide: { flex: 1, alignItems: 'center', gap: 3 },
  teamSideName: {
    color: '#888',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    maxWidth: 120,
  },
  teamSideScore: {
    fontSize: 26,
    fontWeight: '800',
    color: '#666',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  scoreLeading: { color: '#fff' },
  scoreTrailing: { color: '#555' },
  vs: {
    color: '#333',
    fontWeight: '700',
    paddingHorizontal: 10,
    fontSize: 12,
    alignSelf: 'center',
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#c8102e',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },

  // Fight card

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
