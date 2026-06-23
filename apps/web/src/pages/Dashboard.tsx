import { useState } from 'react';
import { Zap, Target, Wallet, X, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { currentOrNextSeason } from '@fantasy-ufc/shared';
import type { League, UFCEvent, Fighter } from '@fantasy-ufc/shared';
import {
  SkeletonEventCard,
  SkeletonLeagueCard,
  SkeletonFightRow,
} from '../components/LoadingScreen';
import { FighterPhoto } from '../components/FighterPhoto';

export function DashboardPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { session } = useAuthStore();
  const [showJoin, setShowJoin] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createForm, setCreateForm] = useState({
    name: '',
    teamName: '',
    maxTeams: '10',
    leagueFormat: '' as 'pickem' | 'staking' | '',
    weeklyBudget: '100' as '50' | '100' | '500',
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [showFightCard, setShowFightCard] = useState(false);
  const [showFighters, setShowFighters] = useState(false);
  const [fighterSearch, setFighterSearch] = useState('');
  const [fighterWeightClass, setFighterWeightClass] = useState('');
  const [zoomedFighter, setZoomedFighter] = useState<{ name: string; imageUrl: string } | null>(
    null,
  );

  const {
    data: leagues = [],
    isLoading: leaguesLoading,
    refetch: refetchLeagues,
  } = useQuery<League[]>({
    queryKey: ['leagues'],
    queryFn: () => apiClient.get('/leagues'),
  });

  const { data: me } = useQuery<any>({
    queryKey: ['me'],
    queryFn: () => apiClient.get('/auth/me'),
    staleTime: 5 * 60_000,
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

  const nextEvent =
    events?.find((e) => e.status === 'live') ?? events?.find((e) => e.status === 'scheduled');

  const { data: fightCardFights } = useQuery<any[]>({
    queryKey: ['event-fights', nextEvent?.id],
    queryFn: () => apiClient.get(`/events/${nextEvent!.id}/fights`),
    enabled: showFightCard && !!nextEvent?.id,
    staleTime: 60_000,
  });

  function openCreate() {
    setCreateForm({
      name: '',
      teamName: '',
      maxTeams: '10',
      leagueFormat: '',
      weeklyBudget: '100',
    });
    setCreateStep(1);
    setCreateError('');
    setShowCreate(true);
  }

  async function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');
    try {
      const league = await apiClient.post<any, any>('/leagues', {
        name: createForm.name,
        teamName: createForm.teamName || 'My Team',
        maxTeams: parseInt(createForm.maxTeams),
        leagueFormat: createForm.leagueFormat,
        ...(createForm.leagueFormat === 'staking'
          ? { weeklyBudget: parseInt(createForm.weeklyBudget) }
          : {}),
      });
      navigate(`/league/${league.id}`);
    } catch (err: any) {
      setCreateError(err.error ?? err.message ?? 'Failed to create league');
      setCreateLoading(false);
    }
  }

  async function joinLeague(e: React.FormEvent) {
    e.preventDefault();
    setJoinLoading(true);
    setJoinError('');
    try {
      await apiClient.post('/leagues/join', { inviteCode, teamName });
      setShowJoin(false);
      setInviteCode('');
      setTeamName('');
      refetchLeagues();
    } catch (err: any) {
      setJoinError(err.error ?? err.message ?? 'Failed to join league');
    } finally {
      setJoinLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <img src="/logo.jpg" alt="FFL" style={styles.logo} />
        <div style={styles.navRight}>
          {me?.isAdmin && (
            <Link to="/admin" style={styles.adminLink}>
              Admin
            </Link>
          )}
          {session?.user.email && <span style={styles.navEmail}>{session.user.email}</span>}
          <button
            style={styles.logoutBtn}
            onClick={async () => {
              await supabase.auth.signOut();
              navigate('/login');
            }}
          >
            Sign Out
          </button>
        </div>
      </nav>

      <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>
        {eventsLoading ? (
          <SkeletonEventCard />
        ) : nextEvent ? (
          <div
            style={{ ...styles.eventCard, cursor: 'pointer' }}
            onClick={() => setShowFightCard(true)}
          >
            <span style={styles.eventLabel}>NEXT EVENT</span>
            {nextEvent.status === 'live' && <span style={styles.liveBadge}>LIVE</span>}
            <h2 style={styles.eventName}>{nextEvent.name}</h2>
            <p style={styles.eventDate}>
              {new Date(nextEvent.scheduledAt).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            {(nextEvent.venue || nextEvent.location) && (
              <p style={styles.eventLocation}>
                {[nextEvent.venue, nextEvent.location].filter(Boolean).join(' · ')}
              </p>
            )}
            <span style={styles.viewCardHint}>View fight card ›</span>
          </div>
        ) : null}

        <div style={styles.section}>
          <div style={styles.leagueActions}>
            <button
              style={{ ...styles.leagueActionBtn, ...styles.leagueActionBtnSecondary }}
              onClick={() => setShowJoin(true)}
            >
              <span style={styles.leagueActionIcon}>
                <Plus size={18} />
              </span>
              <span style={styles.leagueActionLabel}>Join League</span>
              <span style={styles.leagueActionSub}>Enter an invite code</span>
            </button>
            <button
              style={{ ...styles.leagueActionBtn, ...styles.leagueActionBtnPrimary }}
              onClick={openCreate}
            >
              <span style={styles.leagueActionIcon}>
                <Zap size={18} />
              </span>
              <span style={styles.leagueActionLabel}>Create League</span>
              <span style={styles.leagueActionSub}>Start a new league</span>
            </button>
          </div>

          <h2 style={styles.sectionTitle}>My Leagues</h2>
          <div style={{ ...styles.leagueGrid, ...(isMobile ? styles.leagueGridMobile : {}) }}>
            {leaguesLoading ? (
              [0, 1, 2].map((i) => <SkeletonLeagueCard key={i} />)
            ) : leagues.length === 0 ? (
              <div style={styles.emptyLeagues}>No leagues yet — join or create one above</div>
            ) : (
              leagues.map((league) => (
                <Link key={league.id} to={`/league/${league.id}`} style={styles.leagueCard}>
                  <h3 style={styles.leagueName}>{league.name}</h3>
                  <p style={styles.leagueMeta}>{league.memberCount} teams</p>
                  <span
                    style={{
                      ...styles.status,
                      ...(league.status === 'active' ? styles.statusActive : styles.statusSetup),
                    }}
                  >
                    {league.status}
                  </span>
                </Link>
              ))
            )}
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
                  {[
                    'heavyweight',
                    'light-heavyweight',
                    'middleweight',
                    'welterweight',
                    'lightweight',
                    'featherweight',
                    'bantamweight',
                    'flyweight',
                  ].map((wc) => (
                    <option key={wc} value={wc}>
                      {wc.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
              <table style={styles.fighterTable}>
                <thead>
                  <tr>
                    {['#', 'Fighter', 'Division', 'Record', 'Avg Pts'].map((h) => (
                      <th key={h} style={styles.th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {fighters?.map((f) => (
                    <tr key={f.id} style={styles.fighterRow}>
                      <td style={styles.td}>
                        <span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.nameRow}>
                          {(f as any).imageUrl && (
                            <div
                              style={{
                                width: 36,
                                height: 40,
                                borderRadius: 4,
                                overflow: 'hidden',
                                flexShrink: 0,
                                background: '#222',
                                cursor: 'pointer',
                              }}
                              onClick={() =>
                                setZoomedFighter({
                                  name: `${f.firstName} ${f.lastName}`,
                                  imageUrl: (f as any).imageUrl,
                                })
                              }
                            >
                              <img
                                src={(f as any).imageUrl}
                                alt=""
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  objectPosition: 'top center',
                                }}
                              />
                            </div>
                          )}
                          {f.isChampion && <span style={styles.champ}>C</span>}
                          <div>
                            <span style={styles.fighterName}>
                              {f.firstName} {f.lastName}
                            </span>
                            {f.nickname && <div style={styles.nickname}>"{f.nickname}"</div>}
                          </div>
                        </div>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.division}>{f.weightClassName}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.record}>
                          {f.record.wins}-{f.record.losses}-{f.record.draws}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.avgPts}>
                          {f.averageFantasyPoints?.toFixed(1) ?? '--'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showFightCard && (
        <div style={styles.sheetOverlay} onClick={() => setShowFightCard(false)}>
          <div style={styles.bottomSheet} onClick={(e) => e.stopPropagation()}>
            <div style={styles.sheetHandle} />
            <div style={styles.sheetHeader}>
              <span style={styles.sheetTitle}>{nextEvent?.name ?? 'Fight Card'}</span>
              <button style={styles.sheetClose} onClick={() => setShowFightCard(false)}>
                <X size={15} />
              </button>
            </div>
            {nextEvent && (
              <div style={styles.sheetSubtitle}>
                {new Date(nextEvent.scheduledAt).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            )}
            <div style={styles.sheetBody}>
              {!fightCardFights ? (
                <div style={{ paddingTop: 8 }}>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <SkeletonFightRow key={i} />
                  ))}
                </div>
              ) : fightCardFights.length === 0 ? (
                <div style={{ color: '#555', textAlign: 'center', padding: '32px 0' }}>
                  No fight card available yet
                </div>
              ) : (
                (['main', 'prelims', 'early_prelims'] as const).map((seg) => {
                  const fights = fightCardFights.filter((f) => f.cardSegment === seg);
                  if (!fights.length) return null;
                  const segLabel: Record<string, string> = {
                    main: 'Main Card',
                    prelims: 'Prelims',
                    early_prelims: 'Early Prelims',
                  };
                  return (
                    <div key={seg}>
                      <div style={styles.cardSegmentLabel}>{segLabel[seg]}</div>
                      {fights.map((f) => (
                        <div key={f.id} style={styles.fightRow}>
                          <div style={styles.fightRowFighter}>
                            <FighterPhoto
                              imageUrl={f.redImageUrl}
                              name={`${f.redFirstName} ${f.redLastName}`}
                              style={styles.fightRowImg}
                            />
                            <div style={styles.fightRowInfo}>
                              <span style={styles.fightRowName}>
                                {f.redFirstName} {f.redLastName}
                              </span>
                            </div>
                          </div>
                          <div style={styles.fightRowCenter}>
                            <span style={styles.fightRowVs}>VS</span>
                            <span style={styles.fightRowWeight}>{f.weightClassName}</span>
                          </div>
                          <div
                            style={{
                              ...styles.fightRowFighter,
                              flexDirection: 'row-reverse',
                              textAlign: 'right' as const,
                            }}
                          >
                            <FighterPhoto
                              imageUrl={f.blueImageUrl}
                              name={`${f.blueFirstName} ${f.blueLastName}`}
                              style={styles.fightRowImg}
                            />
                            <div style={{ ...styles.fightRowInfo, alignItems: 'flex-end' }}>
                              <span style={styles.fightRowName}>
                                {f.blueFirstName} {f.blueLastName}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showJoin && (
        <div style={styles.joinOverlay} onClick={() => setShowJoin(false)}>
          <div style={styles.joinCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.joinHeader}>
              <h2 style={styles.joinTitle}>Join League</h2>
              <button style={styles.joinClose} onClick={() => setShowJoin(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={joinLeague} style={styles.joinForm}>
              <div style={styles.joinField}>
                <label style={styles.joinLabel}>Invite Code</label>
                <input
                  style={styles.joinInput}
                  placeholder="Enter invite code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div style={styles.joinField}>
                <label style={styles.joinLabel}>Your Team Name</label>
                <input
                  style={styles.joinInput}
                  placeholder="My Team"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                />
              </div>
              {joinError && <p style={styles.joinError}>{joinError}</p>}
              <button
                type="submit"
                style={{ ...styles.joinBtn, ...(joinLoading ? styles.joinBtnDisabled : {}) }}
                disabled={joinLoading}
              >
                {joinLoading ? 'Joining...' : 'Join League'}
              </button>
            </form>
          </div>
        </div>
      )}

      {showCreate && (
        <div style={styles.joinOverlay} onClick={() => setShowCreate(false)}>
          <div style={styles.joinCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.joinHeader}>
              <div>
                {createStep === 2 && (
                  <button
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#666',
                      fontSize: 13,
                      cursor: 'pointer',
                      padding: 0,
                      marginBottom: 4,
                    }}
                    onClick={() => setCreateStep(1)}
                  >
                    ← Back
                  </button>
                )}
                <h2 style={styles.joinTitle}>
                  {createStep === 1 ? 'Choose Format' : 'League Settings'}
                </h2>
              </div>
              <button style={styles.joinClose} onClick={() => setShowCreate(false)}>
                <X size={15} />
              </button>
            </div>

            {createStep === 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: '#666', fontSize: 13, margin: '0 0 4px' }}>
                  How do you want to play?
                </p>
                {(
                  [
                    {
                      fmt: 'pickem',
                      title: "Pick'em",
                      icon: <Target size={18} />,
                      desc: 'Pick fight winners & methods each week. Earn points for correct predictions. Compete head-to-head.',
                    },
                    {
                      fmt: 'staking',
                      title: 'Staking',
                      icon: <Wallet size={18} />,
                      desc: 'Bet a weekly budget on fights. Odds-based payouts. Most profit at the end of the season wins.',
                    },
                  ] as const
                ).map(({ fmt, title, icon, desc }) => (
                  <button
                    key={fmt}
                    style={styles.formatPickBtn}
                    onClick={() => {
                      setCreateForm((f) => ({ ...f, leagueFormat: fmt }));
                      setCreateStep(2);
                    }}
                  >
                    <span style={{ color: '#c8102e', marginBottom: 6, display: 'flex' }}>
                      {icon}
                    </span>
                    <span
                      style={{
                        color: '#fff',
                        fontSize: 16,
                        fontWeight: 700,
                        display: 'block',
                        marginBottom: 4,
                      }}
                    >
                      {title}
                    </span>
                    <span
                      style={{ color: '#666', fontSize: 13, lineHeight: 1.5, display: 'block' }}
                    >
                      {desc}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={submitCreate} style={styles.joinForm}>
                <div style={styles.joinField}>
                  <label style={styles.joinLabel}>League Name</label>
                  <input
                    style={styles.joinInput}
                    placeholder="My Fantasy League"
                    value={createForm.name}
                    onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                    required
                    maxLength={100}
                    autoFocus
                  />
                </div>
                <div style={styles.joinField}>
                  <label style={styles.joinLabel}>Your Team Name</label>
                  <input
                    style={styles.joinInput}
                    placeholder="My Team"
                    value={createForm.teamName}
                    onChange={(e) => setCreateForm((f) => ({ ...f, teamName: e.target.value }))}
                    maxLength={100}
                  />
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ ...styles.joinField, flex: 1 }}>
                    <label style={styles.joinLabel}>Max Teams</label>
                    <select
                      style={styles.joinInput}
                      value={createForm.maxTeams}
                      onChange={(e) => setCreateForm((f) => ({ ...f, maxTeams: e.target.value }))}
                    >
                      {[4, 6, 8, 10, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} teams
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...styles.joinField, flex: 1 }}>
                    <label style={styles.joinLabel}>Season</label>
                    <div
                      style={{
                        ...styles.joinInput,
                        display: 'flex',
                        alignItems: 'center',
                        color: '#ccc',
                      }}
                    >
                      {currentOrNextSeason(new Date()).label}
                    </div>
                  </div>
                </div>
                {createForm.leagueFormat === 'staking' && (
                  <div style={styles.joinField}>
                    <label style={styles.joinLabel}>Weekly Budget</label>
                    <select
                      style={styles.joinInput}
                      value={createForm.weeklyBudget}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          weeklyBudget: e.target.value as '50' | '100' | '500',
                        }))
                      }
                    >
                      <option value="50">$50 / week</option>
                      <option value="100">$100 / week</option>
                      <option value="500">$500 / week</option>
                    </select>
                  </div>
                )}
                {createError && <p style={styles.joinError}>{createError}</p>}
                <button
                  type="submit"
                  style={{ ...styles.joinBtn, ...(createLoading ? styles.joinBtnDisabled : {}) }}
                  disabled={createLoading}
                >
                  {createLoading ? 'Creating...' : 'Create League'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {zoomedFighter && (
        <div style={styles.modalBackdrop} onClick={() => setZoomedFighter(null)}>
          <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalImgWrap}>
              <img src={zoomedFighter.imageUrl} alt={zoomedFighter.name} style={styles.modalImg} />
            </div>
            <p style={styles.modalName}>{zoomedFighter.name}</p>
            <button style={styles.modalClose} onClick={() => setZoomedFighter(null)}>
              <X size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 100,
    background: 'rgba(17,17,17,0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid #222',
    padding: '8px 20px',
    minHeight: 52,
    boxSizing: 'border-box' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { height: 30 },
  navRight: { display: 'flex', alignItems: 'center', gap: 16 },
  navLink: { color: '#aaa', textDecoration: 'none', fontSize: 14 },
  navEmail: { color: '#555', fontSize: 14 },
  adminLink: {
    color: '#c8102e',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: 600,
    border: '1px solid #c8102e44',
    borderRadius: 6,
    padding: '6px 12px',
  },
  logoutBtn: {
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: 6,
    color: '#888',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: 14,
  },
  content: { maxWidth: 1200, margin: '0 auto', padding: 24 },
  contentMobile: { padding: 12 },
  eventCard: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 24,
    marginBottom: 32,
    position: 'relative',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  eventLabel: { fontSize: 12, color: '#c8102e', fontWeight: 700, letterSpacing: 1 },
  liveBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    background: '#c8102e',
    color: '#fff',
    padding: '3px 10px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  eventName: { color: '#fff', fontSize: 24, marginTop: 8, marginBottom: 6 },
  eventDate: { color: '#888', fontSize: 14 },
  eventLocation: { color: '#666', fontSize: 13, marginTop: 2 },
  section: {},
  sectionTitle: { color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 14 },
  leagueActions: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 },
  leagueActionsMobile: { gridTemplateColumns: '1fr' },
  leagueActionBtn: {
    background: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '16px 20px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    textAlign: 'left',
    transition: 'border-color 0.15s',
  },
  leagueActionBtnPrimary: { background: '#1a0508', border: '1px solid #c8102e' },
  leagueActionBtnSecondary: { background: '#141414', border: '1px solid #3a3a3a' },
  leagueActionIcon: { color: '#c8102e', marginBottom: 4, display: 'flex', alignItems: 'center' },
  leagueActionLabel: { color: '#fff', fontSize: 16, fontWeight: 700, display: 'block' },
  leagueActionSub: { color: '#666', fontSize: 13, display: 'block' },
  emptyLeagues: { color: '#444', fontSize: 14, padding: '32px 0', textAlign: 'center' as const },
  input: {
    background: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '8px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    flex: 1,
    minWidth: 140,
  },
  joinOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    zIndex: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  joinCard: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 36,
    width: '100%',
    maxWidth: 480,
    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
  },
  joinHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  joinTitle: { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 },
  joinClose: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: 20,
    cursor: 'pointer',
    padding: 4,
    lineHeight: 1,
  },
  joinForm: { display: 'flex', flexDirection: 'column', gap: 20 },
  joinField: { display: 'flex', flexDirection: 'column', gap: 6 },
  joinLabel: {
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  joinInput: {
    background: '#2a2a2a',
    border: '1px solid #3a3a3a',
    borderRadius: 8,
    padding: '11px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  joinError: { color: '#ff6b6b', fontSize: 14, margin: 0 },
  joinBtn: {
    background: '#c8102e',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: 4,
  },
  joinBtnDisabled: { opacity: 0.6, cursor: 'not-allowed' },
  formatPickBtn: {
    background: '#1e1e1e',
    border: '1px solid #2a2a2a',
    borderRadius: 12,
    padding: '18px 20px',
    cursor: 'pointer',
    textAlign: 'left' as const,
    width: '100%',
  },
  leagueGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 14,
  },
  leagueGridMobile: { gridTemplateColumns: '1fr' },
  leagueCard: {
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 12,
    padding: 20,
    textDecoration: 'none',
    display: 'block',
    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
  },
  leagueName: { color: '#fff', fontSize: 16, fontWeight: 700, marginBottom: 6 },
  leagueMeta: { color: '#888', fontSize: 14, marginBottom: 10 },
  status: { fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  statusActive: { background: '#1a3a1a', color: '#4caf50' },
  statusSetup: { background: '#2a2a3a', color: '#8888ff' },
  fightersToggle: {
    width: '100%',
    background: '#141414',
    border: '1px solid #242424',
    borderRadius: 8,
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'pointer',
    textAlign: 'left',
  },
  toggleChevron: { color: '#aaa', fontSize: 14, fontWeight: 700 },
  fightersBody: { marginTop: 4 },
  fighterFilters: { display: 'flex', gap: 12, marginBottom: 16 },
  fighterSearch: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '8px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    flex: 1,
    maxWidth: 300,
  },
  fighterSelect: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '8px 14px',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
  },
  fighterTable: { width: '100%', borderCollapse: 'collapse' as const },
  th: {
    color: '#555',
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    padding: '10px 14px',
    textAlign: 'left' as const,
    borderBottom: '1px solid #222',
  },
  fighterRow: { borderBottom: '1px solid #1a1a1a' },
  td: { padding: '12px 14px' },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  nameRow: { display: 'flex', alignItems: 'center', gap: 8 },
  champ: {
    background: '#2a2400',
    color: '#ffd700',
    fontSize: 9,
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: 3,
  },
  fighterName: { color: '#fff', fontWeight: 600, fontSize: 14 },
  nickname: { color: '#666', fontSize: 12, marginTop: 2 },
  division: { color: '#888', fontSize: 14 },
  record: { color: '#aaa', fontSize: 14, fontFamily: 'monospace' },
  avgPts: { color: '#c8102e', fontWeight: 700, fontSize: 14 },
  viewCardHint: { color: '#555', fontSize: 12, marginTop: 8, display: 'block' },
  sheetOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    zIndex: 500,
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  bottomSheet: {
    background: '#111',
    borderRadius: '16px 16px 0 0',
    width: '100%',
    maxWidth: 600,
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid #222',
    borderBottom: 'none',
  },
  sheetHandle: { width: 36, height: 4, background: '#333', borderRadius: 2, margin: '12px auto 0' },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 20px 8px',
  },
  sheetTitle: { color: '#fff', fontWeight: 700, fontSize: 16 },
  sheetClose: {
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: 18,
    cursor: 'pointer',
    padding: 4,
  },
  sheetSubtitle: {
    color: '#555',
    fontSize: 13,
    padding: '0 20px 12px',
    borderBottom: '1px solid #1e1e1e',
  },
  sheetBody: { overflowY: 'auto', padding: '0 16px 24px', flex: 1 },
  cardSegmentLabel: {
    color: '#555',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    padding: '16px 0 8px',
  },
  fightRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #1a1a1a',
  },
  fightRowFighter: { flex: 1, display: 'flex', alignItems: 'center', gap: 10 },
  fightRowImg: {
    width: 44,
    height: 54,
    borderRadius: 4,
    objectFit: 'cover',
    objectPosition: 'top center',
    flexShrink: 0,
  },
  fightRowInfo: { display: 'flex', flexDirection: 'column', gap: 2 },
  fightRowName: { color: '#ddd', fontSize: 14, fontWeight: 600 },
  fightRowCenter: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 64,
    padding: '0 8px',
  },
  fightRowVs: { color: '#555', fontSize: 11, fontWeight: 700 },
  fightRowWeight: { color: '#444', fontSize: 10, textAlign: 'center', marginTop: 2 },
  modalBackdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalBox: {
    position: 'relative',
    background: '#111',
    borderRadius: 12,
    overflow: 'hidden',
    maxWidth: 320,
    width: '90%',
  },
  modalImgWrap: {
    width: '100%',
    height: 380,
    background: '#111',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalImg: {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
    objectPosition: 'center',
  },
  modalName: {
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    textAlign: 'center',
    padding: '12px 16px',
    margin: 0,
    background: '#111',
  },
  modalClose: {
    position: 'absolute',
    top: 10,
    right: 10,
    background: 'rgba(0,0,0,0.6)',
    border: 'none',
    borderRadius: '50%',
    color: '#fff',
    width: 28,
    height: 28,
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
