import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Pressable, Alert, TextInput, Share,
} from 'react-native';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import { useAuthStore } from '../../../../src/store/auth.store';
import type { League, Matchup } from '@fantasy-ufc/shared';

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fmtScore(n: number, isStaking: boolean): string {
  if (isStaking) {
    const abs = Math.abs(n);
    return n < 0 ? `-$${abs.toFixed(0)}` : `+$${abs.toFixed(0)}`;
  }
  return n.toFixed(1);
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

function MemberAvatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = (name ?? '?')[0].toUpperCase();
  const bg = color ?? '#5555ff';
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.38 }]}>{initials}</Text>
    </View>
  );
}

export default function LeagueHomeScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuthStore();
  const [editingTeamName, setEditingTeamName] = useState(false);
  const [teamNameInput, setTeamNameInput] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

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

  const renameTeamMutation = useMutation({
    mutationFn: (name: string) => apiClient.patch(`/leagues/${leagueId}/members/me`, { teamName: name }),
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
    { label: isStaking ? 'Bets' : 'Picks', icon: '🎯', route: `/(app)/league/${leagueId}/picks`, show: isActive },
    { label: 'Matchup', icon: '⚔️', route: `/(app)/league/${leagueId}/matchup`, show: isActive },
    { label: 'Standings', icon: '📊', route: `/(app)/league/${leagueId}/standings`, show: league.status !== 'setup' },
    { label: 'Schedule', icon: '📅', route: `/(app)/league/${leagueId}/schedule`, show: isActive },
    { label: 'Playoffs', icon: '🏆', route: `/(app)/league/${leagueId}/playoffs`, show: isActive },
    { label: 'Compare', icon: '👁', route: `/(app)/league/${leagueId}/picks-comparison`, show: isActive },
    { label: 'Rules', icon: '📋', route: `/(app)/league/${leagueId}/rules`, show: true },
    { label: 'Manage', icon: '⚙️', route: `/(app)/league/${leagueId}/commissioner`, show: isCommissioner },
  ].filter((n) => n.show);

  return (
    <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 32 }}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.leagueName} numberOfLines={1}>{league.name}</Text>
          <Text style={s.leagueMeta}>
            {(league as any).seasonYear ? `Season ${(league as any).seasonYear} · ` : ''}{league.memberCount} / {league.maxTeams} teams
            {isStaking ? ' · Staking' : ''}
          </Text>
        </View>
        <View style={[s.statusBadge, statusColor(league.status)]}>
          <Text style={s.statusText}>{league.status.toUpperCase()}</Text>
        </View>
      </View>

      {/* ── Champion banner ── */}
      {league.status === 'completed' && champion && (
        <View style={s.champBanner}>
          <Text style={s.champBannerText}>🏆 Season Champion: {champion.teamName}</Text>
        </View>
      )}

      {/* ── My Team card ── */}
      {myMember && (
        <View style={s.myTeamCard}>
          <View style={s.myTeamLeft}>
            <MemberAvatar name={myMember.teamName} color={(myMember as any).avatarColor} size={40} />
            <View style={{ flex: 1 }}>
              {editingTeamName ? (
                <View style={s.teamNameEditRow}>
                  <TextInput
                    style={s.teamNameInput}
                    value={teamNameInput}
                    onChangeText={setTeamNameInput}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => teamNameInput.trim() && renameTeamMutation.mutate(teamNameInput.trim())}
                  />
                  <TouchableOpacity onPress={() => setEditingTeamName(false)}>
                    <Text style={s.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setTeamNameInput(myMember.teamName); setEditingTeamName(true); }}>
                  <Text style={s.myTeamName}>{myMember.teamName} <Text style={s.editHint}>✎</Text></Text>
                </TouchableOpacity>
              )}
              <Text style={s.myTeamRecord}>
                {myMember.wins}–{myMember.losses}{myMember.ties > 0 ? `–${myMember.ties}` : ''}
              </Text>
            </View>
          </View>
          <View style={s.myTeamRight}>
            <Text style={s.myTeamPtsLabel}>{isStaking ? 'Bankroll' : 'Points'}</Text>
            <Text style={[
              s.myTeamPts,
              isStaking && { color: (+(myMember.stakingBalance ?? 0)) >= 0 ? '#4caf50' : '#ff5252' },
            ]}>
              {isStaking
                ? fmtScore(+(myMember.stakingBalance ?? 0), true)
                : (+(myMember.totalPoints ?? 0)).toFixed(1)}
            </Text>
          </View>
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
              <Text style={s.picksBtnText}>{isStaking ? 'Place Bets →' : 'Submit Picks →'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Current matchup card ── */}
      {matchup && isActive && (
        <TouchableOpacity
          style={s.matchupCard}
          onPress={() => router.push(`/(app)/league/${leagueId}/matchup` as never)}
        >
          <View style={s.matchupLabelRow}>
            <Text style={s.matchupLabel}>CURRENT MATCHUP</Text>
            {isLive && <View style={s.livePipSmall}><Text style={s.livePipText}>LIVE</Text></View>}
            <Text style={s.matchupEventName} numberOfLines={1}>{matchup.eventName}</Text>
          </View>
          <View style={s.matchupScores}>
            <View style={s.teamSide}>
              <Text style={s.teamSideName} numberOfLines={1}>{matchup.homeTeamName}</Text>
              <Text style={[
                s.teamSideScore,
                +matchup.homeScore > +matchup.awayScore && s.scoreLeading,
                +matchup.homeScore < +matchup.awayScore && s.scoreTrailing,
              ]}>
                {fmtMatchupScore(+matchup.homeScore, isStaking)}
              </Text>
            </View>
            <Text style={s.vs}>VS</Text>
            <View style={[s.teamSide, s.teamSideRight]}>
              <Text style={[s.teamSideName, { textAlign: 'right' }]} numberOfLines={1}>{matchup.awayTeamName}</Text>
              <Text style={[
                s.teamSideScore,
                { textAlign: 'right' },
                +matchup.awayScore > +matchup.homeScore && s.scoreLeading,
                +matchup.awayScore < +matchup.homeScore && s.scoreTrailing,
              ]}>
                {fmtMatchupScore(+matchup.awayScore, isStaking)}
              </Text>
            </View>
          </View>
          <Text style={s.matchupTap}>Tap for details →</Text>
        </TouchableOpacity>
      )}

      {/* ── Members row ── */}
      {members.length > 0 && (
        <View style={s.membersSection}>
          <Text style={s.sectionLabel}>MEMBERS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.membersRow}>
            {members.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={s.memberItem}
                onPress={() => router.push(`/(app)/league/${leagueId}/team/${m.id}` as never)}
              >
                <MemberAvatar name={m.teamName} color={(m as any).avatarColor} size={44} />
                {m.isChampion && <Text style={s.memberChampBadge}>🏆</Text>}
                <Text style={s.memberTeamName} numberOfLines={1}>{m.teamName}</Text>
                <Text style={s.memberRecord}>{m.wins}–{m.losses}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
                <Text style={s.navIcon}>{item.icon}</Text>
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

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 20, paddingBottom: 14, gap: 12,
  },
  leagueName: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  leagueMeta: { color: '#555', fontSize: 12 },
  statusBadge: { backgroundColor: '#333', borderRadius: 6, paddingHorizontal: 9, paddingVertical: 4, marginTop: 2 },
  statusActive: { backgroundColor: '#1a3a1a' },
  statusPlayoffs: { backgroundColor: '#1a1a3a' },
  statusCompleted: { backgroundColor: '#2a2a2a' },
  statusText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },

  // Champion banner
  champBanner: { backgroundColor: '#1a1400', borderBottomWidth: 1, borderBottomColor: '#3a3000', padding: 14, alignItems: 'center' },
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
  livePipSmall: { backgroundColor: '#c8102e', borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  livePipText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  picksBtn: { marginTop: 4, backgroundColor: '#c8102e22', borderRadius: 6, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#c8102e44' },
  picksBtnText: { color: '#c8102e', fontWeight: '700', fontSize: 13 },

  // Matchup card
  matchupCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#141414', borderRadius: 12,
    borderWidth: 1, borderColor: '#c8102e33', padding: 16,
  },
  matchupLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  matchupLabel: { color: '#c8102e', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  matchupEventName: { flex: 1, color: '#444', fontSize: 11, textAlign: 'right' },
  matchupScores: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  teamSide: { flex: 1 },
  teamSideRight: { alignItems: 'flex-end' },
  teamSideName: { color: '#888', fontSize: 12, marginBottom: 4 },
  teamSideScore: { fontSize: 30, fontWeight: '800', color: '#666' },
  scoreLeading: { color: '#fff' },
  scoreTrailing: { color: '#333' },
  vs: { color: '#333', fontWeight: '700', paddingHorizontal: 14, fontSize: 12 },
  matchupTap: { color: '#333', fontSize: 11, textAlign: 'right' },

  // Members
  membersSection: { marginBottom: 8 },
  sectionLabel: { color: '#444', fontSize: 10, fontWeight: '700', letterSpacing: 1, paddingHorizontal: 16, marginBottom: 10, marginTop: 4 },
  membersRow: { paddingHorizontal: 16, gap: 16 },
  memberItem: { alignItems: 'center', gap: 4, position: 'relative' },
  memberChampBadge: { position: 'absolute', top: -4, right: -4, fontSize: 12 },
  memberTeamName: { color: '#888', fontSize: 10, fontWeight: '600', maxWidth: 56, textAlign: 'center' },
  memberRecord: { color: '#444', fontSize: 10 },

  // Nav
  nav: { padding: 16, paddingTop: 8, gap: 8 },
  navRow: { flexDirection: 'row', gap: 8 },
  navItem: {
    flex: 1, padding: 12, alignItems: 'center',
    backgroundColor: '#141414', borderRadius: 10, borderWidth: 1, borderColor: '#242424',
  },
  navIcon: { fontSize: 22, marginBottom: 5 },
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
