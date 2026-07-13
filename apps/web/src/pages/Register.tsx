import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';
import { apiClient } from '../api/client';

export function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) throw signUpError;

      if (data.session) {
        // Email confirmation is off — session available immediately
        await apiClient.post('/auth/register', { displayName });
        navigate('/');
      } else {
        // Email confirmation is on — store profile details and wait
        sessionStorage.setItem('pending_profile', JSON.stringify({ displayName }));
        setAwaitingConfirmation(true);
      }
    } catch (err: any) {
      setError(err.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h1 style={styles.title}>Check your email</h1>
          <p style={styles.body}>
            We sent a confirmation link to <strong style={{ color: '#fff' }}>{email}</strong>. Click
            it to activate your account — you'll be signed in automatically.
          </p>
          <p style={styles.hint}>
            Using Supabase? You can disable email confirmation in
            <br />
            <strong style={{ color: '#aaa' }}>
              Authentication → Settings → Email confirmations
            </strong>
          </p>
          <Link to="/login" style={styles.link}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo.jpg" alt="Fantasy Fighting League" style={styles.logo} />
        <h1 style={styles.title}>Create Account</h1>
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <input
            style={styles.input}
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={100}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>
        <Link to="/login" style={styles.link}>
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a0a0a',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: 12,
    padding: 40,
    width: '100%',
    maxWidth: 440,
    border: '1px solid #333',
  },
  logo: { width: 180, display: 'block', margin: '0 auto 8px' },
  title: { color: '#fff', fontSize: 28, marginBottom: 28, textAlign: 'center' },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  input: {
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 8,
    padding: '14px 16px',
    color: '#fff',
    fontSize: 15,
    outline: 'none',
  },
  button: {
    background: '#c8102e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '14px 16px',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
  },
  error: { color: '#ff6b6b', fontSize: 14, margin: 0 },
  body: { color: '#aaa', lineHeight: 1.6, marginBottom: 16 },
  hint: { color: '#666', fontSize: 14, lineHeight: 1.6, marginBottom: 24 },
  link: { display: 'block', textAlign: 'center', marginTop: 20, color: '#c8102e', fontSize: 14 },
};
