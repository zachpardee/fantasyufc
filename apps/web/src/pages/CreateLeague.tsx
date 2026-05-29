import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

function nextHolidayTarget(after: Date): Date {
  const y = after.getFullYear();
  const candidates = [
    new Date(Date.UTC(y,     0, 1)),
    new Date(Date.UTC(y,     6, 4)),
    new Date(Date.UTC(y + 1, 0, 1)),
    new Date(Date.UTC(y + 1, 6, 4)),
  ].filter((d) => d > after);
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0];
}

function getPlayoffHint(months: number): string {
  const end = new Date();
  end.setMonth(end.getMonth() + months);
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  if (months === 6) {
    const holiday = nextHolidayTarget(end);
    const holidayStr = holiday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `Season runs until ~${endStr}. Finals target the UFC event nearest ${holidayStr}; semis are the event just before it.`;
  }

  return `Season runs until ~${endStr}. Playoffs are the next 2 UFC events after the season ends (semis + finals).`;
}

export function CreateLeaguePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    teamName: '',
    maxTeams: '10',
    seasonLengthMonths: '6',
    leagueFormat: 'pickem' as 'pickem' | 'staking',
    weeklyBudget: '100' as '100' | '500',
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
        leagueFormat: form.leagueFormat,
        ...(form.leagueFormat === 'staking' ? { weeklyBudget: parseInt(form.weeklyBudget) } : {}),
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

          <Field label="League Format">
            <div style={styles.formatRow}>
              {(['pickem', 'staking'] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  style={{ ...styles.formatBtn, ...(form.leagueFormat === fmt ? styles.formatBtnActive : {}) }}
                  onClick={() => set('leagueFormat', fmt)}
                >
                  <span style={styles.formatBtnTitle}>{fmt === 'pickem' ? 'Pick\'em' : 'Staking'}</span>
                  <span style={styles.formatBtnDesc}>
                    {fmt === 'pickem' ? 'Pick fight winners + methods for points' : 'Bet a weekly budget on fights'}
                  </span>
                </button>
              ))}
            </div>
          </Field>

          {form.leagueFormat === 'staking' && (
            <Field label="Weekly Budget">
              <select style={styles.input} value={form.weeklyBudget} onChange={(e) => set('weeklyBudget', e.target.value as '100' | '500')}>
                <option value="100">$100 / week</option>
                <option value="500">$500 / week</option>
              </select>
            </Field>
          )}

          <div style={styles.hint}>
            {getPlayoffHint(parseInt(form.seasonLengthMonths))}
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
  card: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: 36, width: '100%', maxWidth: 520, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  header: { marginBottom: 28 },
  back: { color: '#666', fontSize: 14, textDecoration: 'none', display: 'block', marginBottom: 12 },
  title: { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 20 },
  row: { display: 'flex', gap: 16 },
  input: { background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 8, padding: '11px 14px', color: '#fff', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' },
  hint: { color: '#555', fontSize: 12, lineHeight: 1.5 },
  formatRow: { display: 'flex', gap: 10 },
  formatBtn: { flex: 1, background: '#2a2a2a', border: '1px solid #3a3a3a', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' as const, display: 'flex', flexDirection: 'column' as const, gap: 4 },
  formatBtnActive: { border: '1px solid #c8102e', background: '#1a0808' },
  formatBtnTitle: { color: '#fff', fontSize: 14, fontWeight: 700 },
  formatBtnDesc: { color: '#666', fontSize: 12, lineHeight: 1.4 },
  btn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '14px', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
  btnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  error: { color: '#ff6b6b', fontSize: 14, margin: 0 },
};
