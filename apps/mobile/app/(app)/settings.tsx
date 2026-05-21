import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/client';
import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/auth.store';
import type { UserProfile } from '@fantasy-ufc/shared';

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuthStore();

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me'),
    enabled: !!session,
  });

  const updateProfile = useMutation({
    mutationFn: (name: string) =>
      apiClient.patch('/auth/me', { displayName: name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      setEditingName(false);
    },
  });

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const startEditName = () => {
    setDisplayName(profile?.displayName ?? '');
    setEditingName(true);
  };

  const submitName = () => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    updateProfile.mutate(trimmed);
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(profile?.displayName ?? profile?.email ?? '?')[0].toUpperCase()}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          {editingName ? (
            <View style={styles.nameEdit}>
              <TextInput
                style={styles.nameInput}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Display name"
                placeholderTextColor="#555"
                autoFocus
                onSubmitEditing={submitName}
                returnKeyType="done"
              />
              <View style={styles.nameActions}>
                <TouchableOpacity onPress={() => setEditingName(false)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, updateProfile.isPending && styles.disabledBtn]}
                  onPress={submitName}
                  disabled={updateProfile.isPending}
                >
                  <Text style={styles.saveText}>
                    {updateProfile.isPending ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity onPress={startEditName}>
              <Text style={styles.displayName}>{profile?.displayName ?? 'Set display name'}</Text>
              <Text style={styles.tapToEdit}>Tap to edit</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.email}>{profile?.email}</Text>
        </View>
      </View>

      <SectionHeader title="ACCOUNT" />

      <SettingsRow label="Display Name" value={profile?.displayName ?? '—'} onPress={startEditName} />

      <SectionHeader title="NOTIFICATIONS" />

      <SettingsRow label="Fight Results" value="On" />
      <SettingsRow label="Trade Offers" value="On" />
      <SettingsRow label="Waiver Awards" value="On" />
      <SettingsRow label="Draft Picks" value="On" />

      <SectionHeader title="ABOUT" />

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Version</Text>
        <Text style={styles.infoValue}>1.0.0</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>User ID</Text>
        <Text style={styles.infoValue} numberOfLines={1}>{session?.user.id?.slice(0, 8)}…</Text>
      </View>

      <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingsRow({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  const inner = (
    <View style={styles.settingsRow}>
      <Text style={styles.settingsLabel}>{label}</Text>
      <View style={styles.settingsRight}>
        {value !== undefined && <Text style={styles.settingsValue}>{value}</Text>}
        {onPress && <Text style={styles.chevron}>›</Text>}
      </View>
    </View>
  );

  if (onPress) {
    return <TouchableOpacity onPress={onPress}>{inner}</TouchableOpacity>;
  }
  return inner;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  profileSection: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    padding: 24, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#c8102e', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
  profileInfo: { flex: 1 },
  displayName: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 2 },
  tapToEdit: { color: '#555', fontSize: 12, marginBottom: 4 },
  email: { color: '#666', fontSize: 13 },

  nameEdit: { marginBottom: 4 },
  nameInput: {
    color: '#fff', fontSize: 18, fontWeight: '700',
    borderBottomWidth: 1, borderBottomColor: '#c8102e', paddingVertical: 4, marginBottom: 8,
  },
  nameActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cancelText: { color: '#666', fontSize: 13 },
  saveBtn: { backgroundColor: '#c8102e', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 5 },
  disabledBtn: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  sectionHeader: {
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 16,
    backgroundColor: '#050505',
  },
  sectionTitle: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  settingsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  settingsLabel: { color: '#ddd', fontSize: 15 },
  settingsRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsValue: { color: '#666', fontSize: 14 },
  chevron: { color: '#444', fontSize: 20, lineHeight: 22 },

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#111',
  },
  infoLabel: { color: '#666', fontSize: 14 },
  infoValue: { color: '#444', fontSize: 13, maxWidth: 160 },

  signOutBtn: {
    margin: 24, padding: 16, borderRadius: 10,
    backgroundColor: '#1a0000', borderWidth: 1, borderColor: '#c8102e44',
    alignItems: 'center',
  },
  signOutText: { color: '#c8102e', fontSize: 16, fontWeight: '700' },
});
