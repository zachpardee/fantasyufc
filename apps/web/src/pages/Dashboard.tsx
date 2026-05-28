import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';
import type { League, UFCEvent, Fighter } from '@fantasy-ufc/shared';
import { SkeletonEventCard, SkeletonLeagueCard } from '../components/LoadingScreen';

export function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { session } = useAuthStore();
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [showFighters, setShowFighters] = useState(false);
  const [fighterSearch, setFighterSearch] = useState('');
  const [fighterWeightClass, setFighterWeightClass] = useState('');
  const [zoomedFighter, setZoomedFighter] = useState<{ name: string; imageUrl: string } | null>(null);

  const { data: leagues = [], isLoading: leaguesLoading, refetch: refetchLeagues } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<UFCEvent[]>({
    queryKey: ['events'],
    queryFn: () => apiClient.get('/events'),
  });

  const { data: fighters } = useQuery<(Fighter & { weightClassName: string })[]>({
    queryKey: ['fighters', fighterSearch, fighterWeightClass],
    queryFn: () => {
      const p = new URLSearchParams({ status: 'active' });
      if (fighterSearch) p.set('search', fighterSearch);
      if (fighterWeightClass) p.set('weightClass', fighterWeightClass);
      return apiClient.get(`/fighters?${p}`);
    },
    enabled: showFighters,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const nextEvent = events?.find((e) => e.status === 'live') ?? events?.find((e) => e.status === 'scheduled');

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
          {session?.user.email && <span style={styles.navEmail}>{session.user.email}</span>}
          <button
            style={styles.logoutBtn}
            onClick={async () => { await supabase.auth.signOut(); navigate('/login'); }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>
        {eventsLoading ? (
          <SkeletonEventCard />
        ) : nextEvent ? (
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
        ) : null}

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

          <div style={{ ...styles.leagueGrid, ...(isMobile ? styles.leagueGridMobile : {}) }}>
            {leaguesLoading
              ? [0, 1, 2].map((i) => <SkeletonLeagueCard key={i} />)
              : leagues.map((league) => (
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

        <div style={{ ...styles.section, marginTop: 32 }}>
          <button style={styles.fightersToggle} onClick={() => setShowFighters((v) => !v)}>
            <span style={styles.sectionTitle}>Fighters</span>
            <span style={styles.toggleChevron}>{showFighters ? '▲' : '▼'}</span>
          </button>

          {showFighters && (
            <div style={styles.fightersBody}>
              <div style={styles.fighterFilters}>
                <input
                  style={styles.fighterSearch}
                  placeholder="Search fighters..."
                  value={fighterSearch}
                  onChange={(e) => setFighterSearch(e.target.value)}
                />
                <select
                  style={styles.fighterSelect}
                  value={fighterWeightClass}
                  onChange={(e) => setFighterWeightClass(e.target.value)}
                >
                  <option value="">All Divisions</option>
                  {['heavyweight','light-heavyweight','middleweight','welterweight','lightweight','featherweight','bantamweight','flyweight'].map((wc) => (
                    <option key={wc} value={wc}>{wc.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
              <table style={styles.fighterTable}>
                <thead>
                  <tr>{['#', 'Fighter', 'Division', 'Record', 'Avg Pts'].map((h) => (
                    <th key={h} style={styles.th}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {fighters?.map((f) => (
                    <tr key={f.id} style={styles.fighterRow}>
                      <td style={styles.td}><span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span></td>
                      <td style={styles.td}>
                        <div style={styles.nameRow}>
                          {(f as any).imageUrl && (
                            <div
                              style={{ width: 36, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#222', cursor: 'pointer' }}
                              onClick={() => setZoomedFighter({ name: `${f.firstName} ${f.lastName}`, imageUrl: (f as any).imageUrl })}
                            >
                              <img src={(f as any).imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                            </div>
                          )}
                          {f.isChampion && <span style={styles.champ}>C</span>}
                          <div>
                            <span style={styles.fighterName}>{f.firstName} {f.lastName}</span>
                            {f.nickname && <div style={styles.nickname}>"{f.nickname}"</div>}
                          </div>
                        </div>
                      </td>
                      <td style={styles.td}><span style={styles.division}>{f.weightClassName}</span></td>
                      <td style={styles.td}><span style={styles.record}>{f.record.wins}-{f.record.losses}-{f.record.draws}</span></td>
                      <td style={styles.td}><span style={styles.avgPts}>{f.averageFantasyPoints?.toFixed(1) ?? '--'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {zoomedFighter && (
        <div style={styles.modalBackdrop} onClick={() => setZoomedFighter(null)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalImgWrap}>
              <img
                src={zoomedFighter.imageUrl}
                alt={zoomedFighter.name}
                style={styles.modalImg}
              />
            </div>
            <p style={styles.modalName}>{zoomedFighter.name}</p>
            <button style={styles.modalClose} onClick={() => setZoomedFighter(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logo: { height: 48 },
  navRight: { display: 'flex', alignItems: 'center', gap: 16 },
  navLink: { color: '#aaa', textDecoration: 'none', fontSize: 14 },
  navEmail: { color: '#555', fontSize: 14 },
  logoutBtn: { background: 'transparent', border: '1px solid #444', borderRadius: 6, color: '#888', padding: '6px 14px', cursor: 'pointer', fontSize: 14 },
  content: { maxWidth: 1200, margin: '0 auto', padding: 24 },
  contentMobile: { padding: 12 },
  eventCard: {
    background: '#141414', border: '1px solid #242424', borderRadius: 12,
    padding: 24, marginBottom: 32, position: 'relative',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  eventLabel: { fontSize: 12, color: '#c8102e', fontWeight: 700, letterSpacing: 1 },
  liveBadge: {
    position: 'absolute', top: 20, right: 20,
    background: '#c8102e', color: '#fff', padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 700,
  },
  eventName: { color: '#fff', fontSize: 24, marginTop: 8, marginBottom: 6 },
  eventDate: { color: '#888', fontSize: 14 },
  section: {},
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 700 },
  actions: { display: 'flex', gap: 10 },
  btn: { background: '#2a2a2a', color: '#ccc', border: '1px solid #444', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 14 },
  btnPrimary: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700 },
  joinForm: { display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' },
  input: { background: '#1a1a1a', border: '1px solid #444', borderRadius: 6, padding: '8px 14px', color: '#fff', fontSize: 14, outline: 'none', flex: 1, minWidth: 140 },
  leagueGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 },
  leagueGridMobile: { gridTemplateColumns: '1fr' },
  leagueCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: 20, textDecoration: 'none', display: 'block', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  leagueName: { color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 6 },
  leagueMeta: { color: '#888', fontSize: 14, marginBottom: 10 },
  status: { fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  statusActive: { background: '#1a3a1a', color: '#4caf50' },
  statusSetup: { background: '#2a2a3a', color: '#8888ff' },
  fightersToggle: { width: '100%', background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' },
  toggleChevron: { color: '#aaa', fontSize: 14, fontWeight: 700 },
  fightersBody: { marginTop: 4 },
  fighterFilters: { display: 'flex', gap: 12, marginBottom: 16 },
  fighterSearch: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '8px 14px', color: '#fff', fontSize: 14, outline: 'none', flex: 1, maxWidth: 300 },
  fighterSelect: { background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, padding: '8px 14px', color: '#fff', fontSize: 14, outline: 'none' },
  fighterTable: { width: '100%', borderCollapse: 'collapse' as const },
  th: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, padding: '10px 14px', textAlign: 'left' as const, borderBottom: '1px solid #222' },
  fighterRow: { borderBottom: '1px solid #1a1a1a' },
  td: { padding: '12px 14px' },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  champ: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3 },
  fighterName: { color: '#fff', fontWeight: 600, fontSize: 14 },
  nickname: { color: '#666', fontSize: 12, marginTop: 2 },
  division: { color: '#888', fontSize: 14 },
  record: { color: '#aaa', fontSize: 14, fontFamily: 'monospace' },
  avgPts: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  modalBackdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modalBox: { position: 'relative', background: '#111', borderRadius: 12, overflow: 'hidden', maxWidth: 320, width: '90%' },
  modalImgWrap: { width: '100%', height: 380, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modalImg: { width: '100%', height: '100%', display: 'block', objectFit: 'contain', objectPosition: 'center' },
  modalName: { color: '#fff', fontWeight: 700, fontSize: 16, textAlign: 'center', padding: '12px 16px', margin: 0, background: '#111' },
  modalClose: { position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
