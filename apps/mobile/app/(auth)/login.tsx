import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/api/supabase';

const HOW_TO_STEPS = [
  { n: '1', title: 'Join a league', text: 'Create your own or join friends with an invite code.' },
  {
    n: '2',
    title: 'Make your picks',
    text: "Each UFC event, pick the fight winners and how they'll win. (Staking leagues bet a weekly budget on fights instead.)",
  },
  {
    n: '3',
    title: 'Go head-to-head',
    text: 'Your score faces a different league member every event — most points takes the win.',
  },
  {
    n: '4',
    title: 'Win the season',
    text: 'Rack up wins, reach the playoffs, and claim the title.',
  },
];

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showHowTo, setShowHowTo] = useState(true);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) Alert.alert('Login failed', error.message);
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'Type your email address above, then tap Forgot Password.');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      Alert.alert('Check your email', 'Password reset instructions have been sent.');
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Fantasy UFC</Text>
      <Text style={styles.subtitle}>Sign in to your account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Signing in...' : 'Sign In'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
        <Text style={styles.forgotText}>Forgot password?</Text>
      </TouchableOpacity>

      <Link href="/(auth)/register" style={styles.link}>
        <Text style={styles.linkText}>Don't have an account? Sign up</Text>
      </Link>

      <View style={styles.howTo}>
        <TouchableOpacity
          style={styles.howToHeader}
          onPress={() => setShowHowTo((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.howToTitle}>🥊 How to Play</Text>
          <Text style={styles.howToChevron}>{showHowTo ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showHowTo && (
          <View style={styles.howToBody}>
            {HOW_TO_STEPS.map((s) => (
              <View key={s.n} style={styles.step}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{s.n}</Text>
                </View>
                <View style={styles.stepTextWrap}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepText}>{s.text}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingTop: 64, paddingBottom: 40 },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#c8102e',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: '#999', textAlign: 'center', marginBottom: 40 },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#c8102e',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  forgotBtn: { alignSelf: 'center', marginBottom: 20 },
  forgotText: { color: '#555', fontSize: 13 },
  link: { alignSelf: 'center' },
  linkText: { color: '#c8102e', fontSize: 14 },
  howTo: {
    marginTop: 32,
    backgroundColor: '#141414',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#262626',
    overflow: 'hidden',
  },
  howToHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  howToTitle: { color: '#fff', fontSize: 15, fontWeight: '700' },
  howToChevron: { color: '#c8102e', fontSize: 12 },
  howToBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#c8102e',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  stepTextWrap: { flex: 1 },
  stepTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 2 },
  stepText: { color: '#999', fontSize: 13, lineHeight: 19 },
});
