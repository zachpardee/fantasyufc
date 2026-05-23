import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import type { League, UFCEvent } from '@fantasy-ufc/shared';

export function DashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuthStore();
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');

  const { data: leagues = [], refetch: refetchLeagues } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  const { data: events = [] } = useQuery<UFCEvent[]>({
    queryKey: ['events'],
    queryFn: () => apiClient.get('/events'),
  });

  const nextEvent = events?.find((e) => e.status === 'scheduled' || e.status === 'live');

  async function joinLeague() {
    await apiClient.post('/leagues/join', { inviteCode, teamName });
    setShowJoin(false);
    refetchLeagues();
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <img src="/logo.jpg" alt="FFL" style={styles.logo} />
        <div style={styles.navRight}>
          <Link to="/fighters" style={styles.navLink}>Fighters</Link>
          {session?.user.email && <span style={styles.navEmail}>{session.user.email}</span>}
          <button
            style={styles.logoutBtn}
            onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div style={styles.content}>
        {nextEvent && (
          <div style={styles.eventCard}>
            <span style={styles.eventLabel}>NEXT EVENT</span>
            {nextEvent.status === 'live' && <span style={styles.liveBadge}>LIVE</span>}
            <h2 style={styles.eventName}>{nextEvent.name}</h2>
            <p style={styles.eventDate}>
              {new Date(nextEvent.scheduledAt).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
              })}
            </p>
          </div>
        )}

        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>My Leagues</h2>
            <div style={styles.actions}>
              <button style={styles.btn} onClick={() => setShowJoin(true)}>Join League</button>
              <button style={styles.btnPrimary} onClick={() => navigate('/league/create')}>+ Create</button>
            </div>
          </div>

          {showJoin && (
            <div style={styles.joinForm}>
              <input style={styles.input} placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <input style={styles.input} placeholder="Team name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              <button style={styles.btnPrimary} onClick={joinLeague}>Join</button>
              <button style={styles.btn} onClick={() => setShowJoin(false)}>Cancel</button>
            </div>
          )}

          <div style={styles.leagueGrid}>
            {leagues?.map((league) => (
              <Link key={league.id} to={`/league/${league.id}`} style={styles.leagueCard}>
                <h3 style={styles.leagueName}>{league.name}</h3>
                <p style={styles.leagueMeta}>{league.memberCount} teams</p>
                <span style={{ ...styles.status, ...(league.status === 'active' ? styles.statusActive : styles.statusSetup) }}>
                  {league.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { height: 48 },
  navRight: { display: 'flex', alignItems: 'center', gap: 16 },
  navLink: { color: '#aaa', textDecoration: 'none', fontSize: 14 },
  navEmail: { color: '#555', fontSize: 13 },
  logoutBtn: { background: 'transparent', border: '1px solid #444', borderRadius: 6, color: '#888', padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  content: { maxWidth: 1200, margin: '0 auto', padding: 24 },
  eventCard: {
    background: '#1a1a1a', border: '1px solid #333', borderRadius: 12,
    padding: 24, marginBottom: 32, position: 'relative',
  },
  eventLabel: { fontSize: 11, color: '#c8102e', fontWeight: 700, letterSpacing: 1 },
  liveBadge: {
    position: 'absolute', top: 20, right: 20,
    background: '#c8102e', color: '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
  },
  eventName: { color: '#fff', fontSize: 26, marginTop: 8, marginBottom: 6 },
  eventDate: { color: '#888', fontSize: 14 },
  section: {},
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 700 },
  actions: { display: 'flex', gap: 10 },
  btn: { background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13 },
  btnPrimary: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  joinForm: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  input: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, padding: '8px 14px', color: '#fff', fontSize: 14, outline: 'none', flex: 1, minWidth: 140 },
  leagueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  leagueCard: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: 20, textDecoration: 'none', display: 'block' },
  leagueName: { color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 6 },
  leagueMeta: { color: '#888', fontSize: 13, marginBottom: 10 },
  status: { fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  statusActive: { background: '#1a3a1a', color: '#4caf50' },
  statusSetup: { background: '#2a2a3a', color: '#8888ff' },
};
