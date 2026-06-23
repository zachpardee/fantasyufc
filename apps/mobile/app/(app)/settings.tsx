import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { apiClient } from '../../src/api/client';
import { supabase } from '../../src/api/supabase';
import { useAuthStore } from '../../src/store/auth.store';
import { MemberAvatar } from '../../src/components/MemberAvatar';
import type { UserProfile } from '@fantasy-ufc/shared';

const AVATAR_COLORS = [
  '#c8102e',
  '#1565c0',
  '#2e7d32',
  '#6a1b9a',
  '#e65100',
  '#00838f',
  '#4a148c',
  '#880e4f',
];

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuthStore();

  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me'),
    enabled: !!session,
  });

  const updateProfile = useMutation({
    mutationFn: (
      patch: Partial<{ displayName: string; notificationPrefs: any; avatarColor: string }>,
    ) => apiClient.patch('/auth/me', patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });

  const notifPrefs = (profile as any)?.notificationPrefs ?? {};

  function toggleNotif(key: string, value: boolean) {
    updateProfile.mutate({
      notificationPrefs: { ...notifPrefs, [key]: value },
    });
  }

  const startEditName = () => {
    setDisplayName(profile?.displayName ?? '');
    setEditingName(true);
  };

  const submitName = () => {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    updateProfile.mutate(
      { displayName: trimmed },
      {
        onSuccess: () => setEditingName(false),
      },
    );
  };

  async function submitPassword() {
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordLoading(false);
    if (error) {
      setPasswordError(error.message);
      return;
    }
    setNewPassword('');
    setConfirmPassword('');
    setEditingPassword(false);
    Alert.alert('Password Updated', 'Your password has been changed.');
  }

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
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

  if (isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );
  }

  const email = session?.user?.email ?? '';
  const avatarColor = (profile as any)?.avatarColor ?? '#c8102e';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={s.container} keyboardShouldPersistTaps="handled">
        {/* Profile header */}
        <View style={s.profileSection}>
          <MemberAvatar
            name={profile?.displayName ?? profile?.username ?? email}
            color={avatarColor}
            avatarUrl={(profile as any)?.avatarUrl}
            size={64}
          />
          <View style={s.profileInfo}>
            {editingName ? (
              <>
                <TextInput
                  style={s.nameInput}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="Display name"
                  placeholderTextColor="#555"
                  autoFocus
                  onSubmitEditing={submitName}
                  returnKeyType="done"
                />
                <View style={s.nameActions}>
                  <TouchableOpacity onPress={() => setEditingName(false)}>
                    <Text style={s.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.saveBtn, updateProfile.isPending && s.disabledBtn]}
                    onPress={submitName}
                    disabled={updateProfile.isPending}
                  >
                    <Text style={s.saveText}>{updateProfile.isPending ? 'Saving...' : 'Save'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity onPress={startEditName}>
                <Text style={s.displayName}>
                  {profile?.displayName ?? profile?.username ?? 'Set display name'}
                </Text>
                <Text style={s.tapToEdit}>Tap to edit name</Text>
              </TouchableOpacity>
            )}
            <Text style={s.email}>{email}</Text>
          </View>
        </View>

        {/* Avatar color */}
        <SectionHeader title="AVATAR COLOR" />
        <View style={s.colorPicker}>
          {AVATAR_COLORS.map((color) => (
            <TouchableOpacity
              key={color}
              style={[
                s.colorSwatch,
                { backgroundColor: color },
                avatarColor === color && s.colorSwatchSelected,
              ]}
              onPress={() => updateProfile.mutate({ avatarColor: color } as any)}
            />
          ))}
        </View>

        {/* Password */}
        <SectionHeader title="SECURITY" />
        {editingPassword ? (
          <View style={s.passwordForm}>
            <TextInput
              style={s.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              placeholderTextColor="#555"
              secureTextEntry
              autoFocus
            />
            <TextInput
              style={[s.input, { marginTop: 10 }]}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm password"
              placeholderTextColor="#555"
              secureTextEntry
            />
            {!!passwordError && <Text style={s.errorText}>{passwordError}</Text>}
            <View style={s.nameActions}>
              <TouchableOpacity
                onPress={() => {
                  setEditingPassword(false);
                  setPasswordError('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, passwordLoading && s.disabledBtn]}
                onPress={submitPassword}
                disabled={passwordLoading}
              >
                <Text style={s.saveText}>
                  {passwordLoading ? 'Updating...' : 'Update Password'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <SettingsRow label="Change Password" onPress={() => setEditingPassword(true)} />
        )}

        {/* Notifications */}
        <SectionHeader title="NOTIFICATIONS" />
        <NotifRow
          label="Fight Results"
          value={notifPrefs.fightResults ?? true}
          onToggle={(v) => toggleNotif('fightResults', v)}
        />
        <NotifRow
          label="Event Starting"
          value={notifPrefs.eventStarting ?? true}
          onToggle={(v) => toggleNotif('eventStarting', v)}
        />
        <NotifRow
          label="League Updates"
          value={notifPrefs.leagueUpdates ?? true}
          onToggle={(v) => toggleNotif('leagueUpdates', v)}
        />

        {/* About */}
        <SectionHeader title="ABOUT" />
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>Version</Text>
          <Text style={s.infoValue}>1.0.0</Text>
        </View>
        <View style={s.infoRow}>
          <Text style={s.infoLabel}>User ID</Text>
          <Text style={s.infoValue} numberOfLines={1}>
            {session?.user.id?.slice(0, 8)}…
          </Text>
        </View>

        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
    </View>
  );
}

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  const inner = (
    <View style={s.settingsRow}>
      <Text style={s.settingsLabel}>{label}</Text>
      <View style={s.settingsRight}>
        {value !== undefined && <Text style={s.settingsValue}>{value}</Text>}
        {onPress && <Text style={s.chevron}>›</Text>}
      </View>
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress}>{inner}</TouchableOpacity> : inner;
}

function NotifRow({
  label,
  value,
  onToggle,
}: {
  label: string;
  value: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <View style={s.settingsRow}>
      <Text style={s.settingsLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#333', true: '#c8102e' }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  profileInfo: { flex: 1 },
  displayName: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 2 },
  tapToEdit: { color: '#555', fontSize: 12, marginBottom: 4 },
  email: { color: '#444', fontSize: 13, marginTop: 4 },

  nameInput: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    borderBottomWidth: 1,
    borderBottomColor: '#c8102e',
    paddingVertical: 4,
    marginBottom: 8,
  },
  nameActions: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 4 },
  cancelText: { color: '#666', fontSize: 13 },
  saveBtn: {
    backgroundColor: '#c8102e',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabledBtn: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  colorPicker: { flexDirection: 'row', gap: 12, padding: 16, flexWrap: 'wrap' },
  colorSwatch: { width: 36, height: 36, borderRadius: 18 },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#fff' },

  passwordForm: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#111' },
  input: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    color: '#fff',
    fontSize: 15,
    padding: 13,
  },
  errorText: { color: '#ff5252', fontSize: 13, marginTop: 8 },

  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
    backgroundColor: '#050505',
  },
  sectionTitle: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1 },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  settingsLabel: { color: '#ddd', fontSize: 15 },
  settingsRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsValue: { color: '#666', fontSize: 14 },
  chevron: { color: '#444', fontSize: 20, lineHeight: 22 },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#111',
  },
  infoLabel: { color: '#666', fontSize: 14 },
  infoValue: { color: '#444', fontSize: 13, maxWidth: 160 },

  signOutBtn: {
    margin: 24,
    marginTop: 32,
    padding: 16,
    borderRadius: 10,
    backgroundColor: '#1a0000',
    borderWidth: 1,
    borderColor: '#c8102e44',
    alignItems: 'center',
  },
  signOutText: { color: '#c8102e', fontSize: 16, fontWeight: '700' },
});
