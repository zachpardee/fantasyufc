import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email address first, then click Forgot Password.'); return; }
    setResetLoading(true);
    setError('');
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setResetSent(true);
    setResetLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    navigate('/');
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo.jpg" alt="Fantasy Fighting League" style={styles.logo} />
        <form onSubmit={handleSubmit} style={styles.form}>
          <input style={styles.input} type="email" placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
          <input style={styles.input} type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)} required />
          {error && <p style={styles.error}>{error}</p>}
          {resetSent && <p style={styles.success}>Password reset email sent — check your inbox.</p>}
          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <button type="button" style={styles.forgotBtn} onClick={handleForgotPassword} disabled={resetLoading}>
            {resetLoading ? 'Sending...' : 'Forgot Password?'}
          </button>
        </form>
        <Link to="/register" style={styles.link}>Don't have an account? Sign up</Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a' },
  card: { background: '#1a1a1a', borderRadius: 12, padding: 40, width: '100%', maxWidth: 400, border: '1px solid #333' },
  logo: { width: 220, display: 'block', margin: '0 auto 24px' },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
  input: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 8, padding: '14px 16px', color: '#fff', fontSize: 15, outline: 'none' },
  button: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '14px 16px', fontSize: 16, fontWeight: 700, cursor: 'pointer' },
  error: { color: '#ff6b6b', fontSize: 14 },
  success: { color: '#4caf50', fontSize: 14 },
  forgotBtn: { background: 'none', border: 'none', color: '#888', fontSize: 13, cursor: 'pointer', padding: 0, textAlign: 'center' },
  link: { display: 'block', textAlign: 'center', marginTop: 20, color: '#c8102e', fontSize: 14 },
};
