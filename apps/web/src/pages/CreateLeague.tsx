import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

export function CreateLeaguePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    teamName: '',
    maxTeams: '10',
    seasonLengthMonths: '4',
  });

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const league = await apiClient.post<any, any>('/leagues', {
        name: form.name,
        teamName: form.teamName || 'My Team',
        maxTeams: parseInt(form.maxTeams),
        seasonLengthMonths: parseInt(form.seasonLengthMonths) as 4 | 6,
      });
      navigate(`/league/${league.id}`);
    } catch (err: any) {
      setError(err.error ?? err.message ?? 'Failed to create league');
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.header}>
          <Link to="/" style={styles.back}>← Back</Link>
          <h1 style={styles.title}>Create League</h1>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <Field label="League Name">
            <input style={styles.input} placeholder="My Fantasy League" value={form.name}
              onChange={(e) => set('name', e.target.value)} required maxLength={100} />
          </Field>

          <Field label="Your Team Name">
            <input style={styles.input} placeholder="My Team" value={form.teamName}
              onChange={(e) => set('teamName', e.target.value)} maxLength={100} />
          </Field>

          <div style={styles.row}>
            <Field label="Max Teams">
              <select style={styles.input} value={form.maxTeams} onChange={(e) => set('maxTeams', e.target.value)}>
                {[4,6,8,10,12,14,16].map((n) => <option key={n} value={n}>{n} teams</option>)}
              </select>
            </Field>
            <Field label="Season Length">
              <select style={styles.input} value={form.seasonLengthMonths} onChange={(e) => set('seasonLengthMonths', e.target.value)}>
                <option value="4">4 months</option>
                <option value="6">6 months</option>
              </select>
            </Field>
          </div>

          <div style={styles.hint}>
            Season runs from start date for the selected duration. The next 2 UFC events after the season ends become the playoffs (semis + finals).
          </div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.btn, ...(loading ? styles.btnDisabled : {}) }} type="submit" disabled={loading}>
            {loading ? 'Creating...' : 'Create League'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
      <label style={{ color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      {children}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 36, width: '100%', maxWidth: 520 },
  header: { marginBottom: 28 },
  back: { color: '#666', fontSize: 13, textDecoration: 'none', display: 'block', marginBottom: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  row: { display: 'flex', gap: 16 },
  input: { background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  hint: { color: '#555', fontSize: 12, lineHeight: 1.5 },
  btn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { color: '#ff6b6b', fontSize: 13, margin: 0 },
};
