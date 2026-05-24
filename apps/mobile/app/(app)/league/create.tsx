import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../src/api/client';

type Tab = 'create' | 'join';

export default function CreateLeagueScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('create');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [maxTeams, setMaxTeams] = useState(10);
  const [rosterSize, setRosterSize] = useState(10);
  const [starterSlots, setStarterSlots] = useState(5);

  const [inviteCode, setInviteCode] = useState('');
  const [joinTeamName, setJoinTeamName] = useState('');

  async function handleCreate() {
    if (!name.trim()) { setErr('League name is required'); return; }
    setLoading(true);
    setErr('');
    try {
      const league = await apiClient.post<any, any>('/leagues', {
        name: name.trim(),
        teamName: teamName.trim() || 'My Team',
        maxTeams,
        rosterSize,
        starterSlots,
        draftPickTimeSeconds: 90,
      });
      router.replace(`/(app)/league/${league.id}`);
    } catch (e: any) {
      setErr(e?.error ?? 'Failed to create league');
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!inviteCode.trim()) { setErr('Invite code is required'); return; }
    if (!joinTeamName.trim()) { setErr('Team name is required'); return; }
    setLoading(true);
    setErr('');
    try {
      const league = await apiClient.post<any, any>('/leagues/join', {
        inviteCode: inviteCode.trim().toUpperCase(),
        teamName: joinTeamName.trim(),
      });
      router.replace(`/(app)/league/${league.id}`);
    } catch (e: any) {
      setErr(e?.error ?? 'Failed to join league');
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === 'create' && styles.tabActive]}
            onPress={() => { setTab('create'); setErr(''); }}
          >
            <Text style={[styles.tabText, tab === 'create' && styles.tabTextActive]}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === 'join' && styles.tabActive]}
            onPress={() => { setTab('join'); setErr(''); }}
          >
            <Text style={[styles.tabText, tab === 'join' && styles.tabTextActive]}>Join</Text>
          </TouchableOpacity>
        </View>

        {tab === 'create' ? (
          <View style={styles.form}>
            <Field label="League Name">
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="My Fantasy League"
                placeholderTextColor="#555"
                maxLength={100}
              />
            </Field>

            <Field label="Your Team Name">
              <TextInput
                style={styles.input}
                value={teamName}
                onChangeText={setTeamName}
                placeholder="My Team"
                placeholderTextColor="#555"
                maxLength={100}
              />
            </Field>

            <Field label="Max Teams">
              <View style={styles.optionRow}>
                {[4, 6, 8, 10, 12].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.optBtn, maxTeams === n && styles.optBtnActive]}
                    onPress={() => setMaxTeams(n)}
                  >
                    <Text style={[styles.optText, maxTeams === n && styles.optTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Roster Size">
              <View style={styles.optionRow}>
                {[6, 8, 10, 12, 15].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.optBtn, rosterSize === n && styles.optBtnActive]}
                    onPress={() => setRosterSize(n)}
                  >
                    <Text style={[styles.optText, rosterSize === n && styles.optTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Starter Slots">
              <View style={styles.optionRow}>
                {[3, 4, 5, 6, 7].map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[styles.optBtn, starterSlots === n && styles.optBtnActive]}
                    onPress={() => setStarterSlots(n)}
                  >
                    <Text style={[styles.optText, starterSlots === n && styles.optTextActive]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            {!!err && <Text style={styles.errMsg}>{err}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleCreate}
              disabled={loading}
            >
              <Text style={styles.submitText}>{loading ? 'Creating...' : 'Create League'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.form}>
            <Field label="Invite Code">
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. A1B2C3D4"
                placeholderTextColor="#555"
                autoCapitalize="characters"
                maxLength={20}
              />
            </Field>

            <Field label="Your Team Name">
              <TextInput
                style={styles.input}
                value={joinTeamName}
                onChangeText={setJoinTeamName}
                placeholder="My Team"
                placeholderTextColor="#555"
                maxLength={100}
              />
            </Field>

            {!!err && <Text style={styles.errMsg}>{err}</Text>}

            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleJoin}
              disabled={loading}
            >
              <Text style={styles.submitText}>{loading ? 'Joining...' : 'Join League'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: 20 },
  label: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },

  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222',
  },
  tab: {
    flex: 1, paddingVertical: 14, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: '#c8102e' },
  tabText: { color: '#666', fontSize: 15, fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  form: { padding: 20 },

  input: {
    backgroundColor: '#111', borderWidth: 1, borderColor: '#333', borderRadius: 8,
    color: '#fff', fontSize: 15, padding: 13,
  },

  optionRow: { flexDirection: 'row', gap: 8 },
  optBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 7, borderWidth: 1,
    borderColor: '#333', backgroundColor: '#111', alignItems: 'center',
  },
  optBtnActive: { borderColor: '#c8102e', backgroundColor: '#1a0a0a' },
  optText: { color: '#888', fontWeight: '600', fontSize: 14 },
  optTextActive: { color: '#fff' },

  errMsg: { color: '#ff5252', fontSize: 13, marginBottom: 12 },

  submitBtn: {
    backgroundColor: '#c8102e', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
