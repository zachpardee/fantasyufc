import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  ScrollView,
} from 'react-native';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, X, ChevronLeft } from 'lucide-react-native';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { MemberAvatar } from './MemberAvatar';
import { seasonByRegularEnd } from '@fantasy-ufc/shared';
import type { League } from '@fantasy-ufc/shared';

// Shared top nav bar for the league tab pages (League Home, Matchup, Current Event):
// back button · league name/meta · notifications bell · avatar dropdown.
export function LeagueNavBar({ leagueId }: { leagueId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { session } = useAuthStore();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const { data: league } = useQuery<League>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
    enabled: !!leagueId,
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
    enabled: !!league,
  });
  const myMember = members.find((m) => m.userId === session?.user?.id);

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

  if (!league) {
    return <View style={[s.navBar, { paddingTop: insets.top + 8 }]} />;
  }

  const isStaking = (league as any).leagueFormat === 'staking';
  const seasonLabel = (league as any).seasonEndsAt
    ? seasonByRegularEnd(new Date((league as any).seasonEndsAt))?.label
    : null;
  const metaLabel =
    seasonLabel ?? ((league as any).seasonYear ? `Season ${(league as any).seasonYear}` : null);

  return (
    <>
      <View style={[s.navBar, { paddingTop: insets.top + 8 }]}>
        <View style={s.navBarTop}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/league'))}
            style={s.backBtn}
            hitSlop={8}
          >
            <ChevronLeft size={24} color="#888" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={s.leagueName} numberOfLines={1}>
              {league.name}
            </Text>
            <Text style={s.leagueMeta} numberOfLines={1}>
              {metaLabel ? `${metaLabel} · ` : ''}
              {league.memberCount} / {league.maxTeams} teams
              {isStaking ? ' · Staking' : ''}
            </Text>
          </View>
          <TouchableOpacity style={s.bellBtn} onPress={openNotifs}>
            <Bell size={20} color="#ccc" />
            {(unreadCount?.count ?? 0) > 0 && (
              <View style={s.bellBadge}>
                <Text style={s.bellBadgeText}>
                  {unreadCount!.count > 9 ? '9+' : unreadCount!.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowUserMenu(true)} hitSlop={6}>
            <MemberAvatar
              name={myMember?.teamName ?? 'Me'}
              color={(myMember as any)?.avatarColor}
              avatarUrl={(myMember as any)?.avatarUrl}
              size={32}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── User menu dropdown ── */}
      <Modal
        visible={showUserMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowUserMenu(false)}
      >
        <Pressable style={s.menuBackdrop} onPress={() => setShowUserMenu(false)}>
          <View style={[s.userMenu, { top: insets.top + 44 }]}>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => {
                setShowUserMenu(false);
                router.push('/(app)/settings');
              }}
            >
              <Text style={s.menuItemText}>Settings</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => {
                setShowUserMenu(false);
                router.push(`/(app)/league/${leagueId}`);
              }}
            >
              <Text style={s.menuItemText}>League Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => {
                setShowUserMenu(false);
                router.push('/(app)');
              }}
            >
              <Text style={s.menuItemText}>User Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.menuItem}
              onPress={() => {
                setShowUserMenu(false);
                supabase.auth.signOut();
              }}
            >
              <Text style={[s.menuItemText, s.menuItemDanger]}>Log out</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* ── Notifications modal ── */}
      <Modal
        visible={showNotifs}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNotifs(false)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setShowNotifs(false)}>
          <Pressable style={s.notifSheet} onPress={(e) => e.stopPropagation()}>
            <View style={s.notifHeader}>
              <Text style={s.notifTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setShowNotifs(false)}>
                <X size={18} color="#888" />
              </TouchableOpacity>
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
                      {new Date(n.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  navBar: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
    backgroundColor: '#0d0d0d',
  },
  navBarTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { marginLeft: -6 },
  bellBtn: { position: 'relative', padding: 4 },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#c8102e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  leagueName: { color: '#fff', fontSize: 19, fontWeight: '800', marginBottom: 3 },
  leagueMeta: { color: '#555', fontSize: 12 },

  modalOverlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 24 },
  menuBackdrop: { flex: 1 },
  userMenu: {
    position: 'absolute',
    right: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minWidth: 170,
    paddingVertical: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  menuItem: { paddingHorizontal: 16, paddingVertical: 13 },
  menuItemText: { color: '#eee', fontSize: 15, fontWeight: '600' },
  menuItemDanger: { color: '#ff5252' },
  notifSheet: {
    backgroundColor: '#141414',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  notifTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  notifEmpty: { color: '#555', fontSize: 13, textAlign: 'center', paddingVertical: 32 },
  notifItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  notifItemUnread: { backgroundColor: '#1a0808' },
  notifItemTitle: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  notifItemBody: { color: '#888', fontSize: 12, marginTop: 3, lineHeight: 16 },
  notifItemTime: { color: '#444', fontSize: 10, marginTop: 5 },
});
