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
  const [showHowTo, setShowHowTo] = useState(true);

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
      <div style={styles.stack}>
        <div style={styles.howTo}>
          <button type="button" style={styles.howToHeader} onClick={() => setShowHowTo((v) => !v)}>
            <span style={styles.howToTitle}>🥊 How to Play</span>
            <span style={styles.howToChevron}>{showHowTo ? '▲' : '▼'}</span>
          </button>
          {showHowTo && (
            <div style={styles.howToBody}>
              <div style={styles.step}>
                <span style={styles.stepNum}>1</span>
                <div>
                  <div style={styles.stepTitle}>Join a league</div>
                  <div style={styles.stepText}>Create your own or join friends with an invite code.</div>
                </div>
              </div>
              <div style={styles.step}>
                <span style={styles.stepNum}>2</span>
                <div>
                  <div style={styles.stepTitle}>Make your picks</div>
                  <div style={styles.stepText}>Each UFC event, pick the fight winners and how they'll win. (Staking leagues bet a weekly budget on fights instead.)</div>
                </div>
              </div>
              <div style={styles.step}>
                <span style={styles.stepNum}>3</span>
                <div>
                  <div style={styles.stepTitle}>Go head-to-head</div>
                  <div style={styles.stepText}>Your score faces a different league member every event. Most points takes the win.</div>
                </div>
              </div>
              <div style={styles.step}>
                <span style={styles.stepNum}>4</span>
                <div>
                  <div style={styles.stepTitle}>Win the season</div>
                  <div style={styles.stepText}>Rack up wins, reach the playoffs, and claim the title.</div>
                </div>
              </div>
            </div>
          )}
        </div>

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
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', padding: '24px 16px' },
  stack: { display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 400 },
  howTo: { background: '#1a1a1a', borderRadius: 12, border: '1px solid #333', overflow: 'hidden' },
  howToHeader: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', color: '#fff', padding: '14px 18px', cursor: 'pointer', fontSize: 15, fontWeight: 700 },
  howToTitle: { fontSize: 15, fontWeight: 700 },
  howToChevron: { color: '#c8102e', fontSize: 11 },
  howToBody: { padding: '4px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 },
  step: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  stepNum: { flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#c8102e', color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepTitle: { color: '#fff', fontSize: 14, fontWeight: 600 },
  stepText: { color: '#999', fontSize: 13, lineHeight: 1.5, marginTop: 2 },
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
