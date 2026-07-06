import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../api/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let settled = false;
    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      setHasSession(found);
      setReady(true);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        finish(true);
      }
    });

    // Fall back to checking for an existing session (recovery token already parsed).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) finish(true);
    });

    // If nothing establishes a recovery session shortly, treat the link as invalid.
    const timer = setTimeout(() => finish(false), 2500);

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setSuccess(true);
    setLoading(false);
    setTimeout(() => navigate('/login'), 2000);
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <img src="/logo.jpg" alt="Fantasy Fighting League" style={styles.logo} />
        <h1 style={styles.heading}>Set a New Password</h1>

        {!ready && <p style={styles.muted}>Verifying reset link…</p>}

        {ready && !hasSession && !success && (
          <>
            <p style={styles.error}>This reset link is invalid or expired.</p>
            <Link to="/login" style={styles.link}>
              Back to login
            </Link>
          </>
        )}

        {ready && hasSession && !success && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <input
              style={styles.input}
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {error && <p style={styles.error}>{error}</p>}
            <button style={styles.button} type="submit" disabled={loading}>
              {loading ? 'Updating...' : 'Update Password'}
            </button>
            <Link to="/login" style={styles.link}>
              Back to login
            </Link>
          </form>
        )}

        {success && (
          <>
            <p style={styles.success}>Password updated — redirecting to login…</p>
            <Link to="/login" style={styles.link}>
              Go to login
            </Link>
          </>
        )}
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
    padding: '24px 16px',
  },
  card: {
    background: '#1a1a1a',
    borderRadius: 12,
    padding: 40,
    width: '100%',
    maxWidth: 400,
    border: '1px solid #333',
  },
  logo: { width: 220, display: 'block', margin: '0 auto 24px' },
  heading: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 20px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: 16 },
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
  },
  error: { color: '#ff6b6b', fontSize: 14, textAlign: 'center' },
  success: { color: '#4caf50', fontSize: 14, textAlign: 'center' },
  muted: { color: '#888', fontSize: 14, textAlign: 'center' },
  link: { display: 'block', textAlign: 'center', marginTop: 20, color: '#c8102e', fontSize: 14 },
};
