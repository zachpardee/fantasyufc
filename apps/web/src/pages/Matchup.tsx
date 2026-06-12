import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { BeltHalo, MemberSheet, hasBelt, hasBmfBelt } from '../components/MemberSheet';
import { MemberAvatar } from '../components/MemberAvatar';
import { Trophy, Calendar } from 'lucide-react';
import { SkeletonFightRow } from '../components/LoadingScreen';
import {
  fmtStakeScore, fmtChipScore,
  MatchupFightList, MatchupPickPanel, StakingBetsSection, FighterModal, LiveFightCard,
  type PhotoClickHandler,
} from '../components/MatchupComponents';

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [browsingMatchupId, setBrowsingMatchupId] = useState<string | null>(null);
  const [showMatchupPicker, setShowMatchupPicker] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const currentChipRef = useRef<HTMLButtonElement>(null);

  // Reset to current matchup whenever the user navigates to this page
  useEffect(() => {
    setSelectedMatchupId(null);
    setSelectedEventId(null);
    setBrowsingMatchupId(null);
    setShowMatchupPicker(false);
  }, [location.key]);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string; fighterId?: string } | null>(null);
  const openPhoto: PhotoClickHandler = (url, name, fighterId) => setEnlargedPhoto({ url, name, fighterId });
  const [selectedMember, setSelectedMember] = useState<any>(null);

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  // All matchups in the league (for scores/results)
  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
  });

  // All UFC events from season start (for chip strip — includes events with no matchup)
  const { data: allSeasonEvents = [] } = useQuery<any[]>({
    queryKey: ['season-events', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/season-events`),
  });

  // Current user's league member record
  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });
  const myMember = members.find((m) => m.userId === session?.user.id);

  // allSeasonEvents is already sorted newest-first from the API
  const seasonEvents = allSeasonEvents;

  // Current user's matchup keyed by eventId
  const myMatchupByEvent = new Map<string, any>();
  for (const m of allMatchups) {
    if (m.homeTeamId === myMember?.id || m.awayTeamId === myMember?.id) {
      myMatchupByEvent.set(m.eventId, m);
    }
  }

  // The most recent event the user has a matchup in (for default selection)
  const mostRecentMyMatchup = seasonEvents.find((ev) => myMatchupByEvent.has(ev.eventId));

  // The current/next event (earliest scheduled or live)
  const currentUpcomingEventId = [...seasonEvents].reverse()
    .find((ev) => ev.eventStatus === 'live' || ev.eventStatus === 'scheduled')?.eventId ?? null;

  // Scroll the chip strip to center the current event chip once data is ready
  useEffect(() => {
    if (!currentUpcomingEventId || !stripRef.current || !currentChipRef.current) return;
    const strip = stripRef.current;
    const chip = currentChipRef.current;
    strip.scrollLeft = chip.offsetLeft - strip.offsetWidth / 2 + chip.offsetWidth / 2;
  }, [currentUpcomingEventId]);

  const effectiveMatchupId = browsingMatchupId ?? selectedMatchupId;
  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId, effectiveMatchupId, selectedEventId],
    queryFn: async () => {
      if (effectiveMatchupId) {
        return apiClient.get(`/leagues/${leagueId}/matchups/${effectiveMatchupId}`);
      }
      // If the user selected an event that has no matchup yet, return null so we show a preview stub
      if (selectedEventId) return null;
      const current = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!current) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${current.id}`);
    },
  });

  const liveRefetchInterval = matchup?.eventStatus === 'live' ? 30_000 : false;

  const { data: homePicks, isLoading: homePicksLoading } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
    refetchInterval: liveRefetchInterval,
  });

  const { data: awayPicks, isLoading: awayPicksLoading } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
    refetchInterval: liveRefetchInterval,
  });

  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
    refetchInterval: liveRefetchInterval,
  });

  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
    refetchInterval: liveRefetchInterval,
  });

  // Live updates only for the current matchup
  useEffect(() => {
    if (!matchup?.id || selectedMatchupId) return;
    const channel = supabase.channel(`matchup:${matchup.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matchups', filter: `id=eq.${matchup.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [matchup?.id, selectedMatchupId, refetch]);

  const isStaking = league?.leagueFormat === 'staking';

  const { data: homeStaking } = useQuery<any>({
    queryKey: ['matchup-staking-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchup!.eventId}?memberId=${matchup!.homeTeamId}`),
    enabled: isStaking && !!matchup?.eventId && !!matchup?.homeTeamId,
    refetchInterval: liveRefetchInterval,
  });
  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchup!.eventId}?memberId=${matchup!.awayTeamId}`),
    enabled: isStaking && !!matchup?.eventId && !!matchup?.awayTeamId,
    refetchInterval: liveRefetchInterval,
  });

  const isLive = matchup?.eventStatus === 'live';
  const eventIsLive = matchup?.eventStatus === 'live' || matchup?.eventStatus === 'completed';

  // Compute live staking score: unbet budget + settled P&L
  function calcStakingScore(staking: any): number {
    if (!staking) return 0;
    const budget = parseFloat(staking.weeklyBudget) || 100;
    const allBets = [...(staking.singles ?? []), ...(staking.parlays ?? [])];
    const pendingStake = allBets.filter((b: any) => b.status === 'pending').reduce((s: number, b: any) => s + (parseFloat(b.stake) || 0), 0);
    const settledPnl = allBets.filter((b: any) => b.status !== 'pending').reduce((s: number, b: any) => s + (parseFloat(b.profitLoss) || 0), 0);
    return budget - pendingStake + settledPnl;
  }

  // Orient so the current user's side is always on the left
  const isMeHome = !!myMember && myMember.id === matchup?.homeTeamId;
  const isMeAway = !!myMember && myMember.id === matchup?.awayTeamId;
  const flipSides = isMeAway; // swap left/right when user is the away team
  const myStaking = isMeHome ? homeStaking : isMeAway ? awayStaking : homeStaking;

  const leftTeamId   = flipSides ? matchup?.awayTeamId   : matchup?.homeTeamId;
  const rightTeamId  = flipSides ? matchup?.homeTeamId   : matchup?.awayTeamId;
  const leftTeamName = flipSides ? matchup?.awayTeamName : matchup?.homeTeamName;
  const rightTeamName= flipSides ? matchup?.homeTeamName : matchup?.awayTeamName;
  const leftPicks    = flipSides ? awayPicks    : homePicks;
  const rightPicks   = flipSides ? homePicks    : awayPicks;
  const leftChampion = flipSides ? awayChampion : homeChampion;
  const rightChampion= flipSides ? homeChampion : awayChampion;
  const leftStaking  = flipSides ? awayStaking  : homeStaking;
  const rightStaking = flipSides ? homeStaking  : awayStaking;

  // Compute scores directly from each side's staking data.
  // The API hides opponent bets pre-event (returns empty arrays), so we check whether bets
  // actually exist before computing — otherwise fall back to the DB matchup score.
  // For my own side, also use myStaking as a secondary fallback in case the direct query
  // came back empty for some reason.
  const homeHasBets = (homeStaking?.singles?.length ?? 0) + (homeStaking?.parlays?.length ?? 0) > 0;
  const awayHasBets = (awayStaking?.singles?.length ?? 0) + (awayStaking?.parlays?.length ?? 0) > 0;
  const homeStakingScore = homeHasBets
    ? calcStakingScore(homeStaking)
    : (isMeHome && myStaking ? calcStakingScore(myStaking) : +matchup?.homeScore);
  const awayStakingScore = awayHasBets
    ? calcStakingScore(awayStaking)
    : (isMeAway && myStaking ? calcStakingScore(myStaking) : +matchup?.awayScore);

  // For picks leagues, compute scores from the loaded picks data so they're always
  // accurate regardless of whether the DB matchup scores were updated correctly.
  const homePicksScore = calcPicksScore(
    homePicks?.fights ?? [],
    homeChampion?.pointsEarned ? +homeChampion.pointsEarned : 0,
    homePicks != null ? null : +matchup?.homeScore,
  );
  const awayPicksScore = calcPicksScore(
    awayPicks?.fights ?? [],
    awayChampion?.pointsEarned ? +awayChampion.pointsEarned : 0,
    awayPicks != null ? null : +matchup?.awayScore,
  );

  const leftPicksScore    = flipSides ? awayPicksScore    : homePicksScore;
  const rightPicksScore   = flipSides ? homePicksScore    : awayPicksScore;
  const leftStakingScore  = flipSides ? awayStakingScore  : homeStakingScore;
  const rightStakingScore = flipSides ? homeStakingScore  : awayStakingScore;

  const fights: any[] = homePicks?.fights ?? [];
  const awayPickMap: Record<string, any> = {};
  for (const f of (awayPicks?.fights ?? [])) awayPickMap[f.id] = f;

  const isViewingHistory = !!selectedMatchupId && selectedMatchupId !== mostRecentMyMatchup?.id;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>Matchup</span>
        {browsingMatchupId && (
          <button style={styles.currentBtn} onClick={() => setBrowsingMatchupId(null)}>
            ← My matchup
          </button>
        )}
        {(isViewingHistory || selectedEventId) && !browsingMatchupId && (
          <button style={styles.currentBtn} onClick={() => { setSelectedMatchupId(null); setSelectedEventId(null); }}>
            ← Current
          </button>
        )}
      </nav>

      {seasonEvents.length > 0 && (
        <div ref={stripRef} style={styles.historyStrip}>
          {seasonEvents.map((ev) => {
            const myM = myMatchupByEvent.get(ev.eventId);
            const chipIsMeHome = myM?.homeTeamId === myMember?.id;
            const isEventCompleted = ev.eventStatus === 'completed';
            const isLiveEvent = ev.eventStatus === 'live';

            // For the currently shown matchup use live-computed staking scores;
            // for all other chips fall back to the DB matchup scores.
            const isThisMatchup = isStaking && myM?.id === matchup?.id;
            const rawMyScore = myM ? +(chipIsMeHome ? myM.homeScore : myM.awayScore) : null;
            const rawOppScore = myM ? +(chipIsMeHome ? myM.awayScore : myM.homeScore) : null;
            const myScore = isThisMatchup
              ? (chipIsMeHome ? homeStakingScore : awayStakingScore)
              : rawMyScore;
            const oppScore = isThisMatchup
              ? (chipIsMeHome ? awayStakingScore : homeStakingScore)
              : rawOppScore;

            const oppName = myM ? (chipIsMeHome ? myM.awayTeamName : myM.homeTeamName) : null;
            // Only show W/L once the event is fully completed
            const isWin = isEventCompleted && !!(myM?.winnerId) && myM.winnerId === myMember?.id;
            const isLoss = isEventCompleted && !!(myM?.winnerId) && myM.winnerId !== myMember?.id;
            const hasScore = myM && isEventCompleted;
            const eventMatchups = allMatchups.filter((m) => m.eventId === ev.eventId);
            const isBrowsingThisEvent = !myM && eventMatchups.some((m) => m.id === browsingMatchupId);
            const isActive = (!!selectedMatchupId && myM?.id === selectedMatchupId) || selectedEventId === ev.eventId || isBrowsingThisEvent;
            const hasAnyMatchups = eventMatchups.length > 0;
            const eventShort = ev.eventName
              ?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
              .replace(/^UFC\s+/i, 'UFC ') ?? ev.eventName;
            const dateStr = ev.scheduledAt
              ? new Date(ev.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null;

            const isCurrentEvent = ev.eventId === currentUpcomingEventId;
            const isSemis = ev.eventId === league?.playoffSemisEventId;
            const isFinals = ev.eventId === league?.playoffFinalsEventId;

            return (
              <button
                key={ev.eventId}
                ref={isCurrentEvent ? currentChipRef : undefined}
                style={{ ...styles.historyChip, ...(isActive ? styles.historyChipActive : isCurrentEvent ? styles.historyChipCurrent : {}), ...(!myM && !hasAnyMatchups && !isActive ? styles.historyChipNoMatchup : {}) }}
                onClick={() => {
                  setShowMatchupPicker(false);
                  if (myM) {
                    setBrowsingMatchupId(null);
                    setSelectedEventId(null);
                    setSelectedMatchupId(myM.id === mostRecentMyMatchup?.id ? null : myM.id);
                  } else if (hasAnyMatchups) {
                    // No personal matchup but other matchups exist — browse the first one
                    if (isBrowsingThisEvent) {
                      setBrowsingMatchupId(null);
                    } else {
                      setSelectedMatchupId(null);
                      setSelectedEventId(null);
                      setBrowsingMatchupId(eventMatchups[0].id);
                    }
                  } else {
                    setBrowsingMatchupId(null);
                    setSelectedMatchupId(null);
                    setSelectedEventId(ev.eventId === selectedEventId ? null : ev.eventId);
                  }
                }}
              >
                {isLiveEvent
                  ? <span style={styles.chipLiveBadge}>LIVE</span>
                  : isCurrentEvent
                    ? <span style={styles.chipNextBadge}>NEXT</span>
                    : null}
                {isFinals && <span style={styles.chipFinalsBadge}>FINALS</span>}
                {isSemis && <span style={styles.chipSemisBadge}>SEMIS</span>}
                <span style={styles.chipEvent}>{eventShort}</span>
                {dateStr && <span style={styles.chipDate}>{dateStr}</span>}
                {myM ? (
                  hasScore ? (
                    <>
                      <span style={styles.chipOpp}>vs {oppName}</span>
                      <span style={styles.chipScore}>{isStaking ? fmtChipScore(myScore!) : myScore!.toFixed(0)}–{isStaking ? fmtChipScore(oppScore!) : oppScore!.toFixed(0)}</span>
                      {(isWin || isLoss) && (
                        <span style={{ ...styles.chipResult, color: isWin ? '#4caf50' : '#ff5252' }}>
                          {isWin ? 'W' : 'L'}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span style={styles.chipOpp}>vs {oppName}</span>
                      <span style={styles.chipPending}>Upcoming</span>
                    </>
                  )
                ) : (
                  <span style={styles.chipPending}>TBD</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!matchup && selectedEventId ? (() => {
        const ev = seasonEvents.find((e) => e.eventId === selectedEventId);
        const isPlayoff = ev?.eventId === league?.playoffSemisEventId || ev?.eventId === league?.playoffFinalsEventId;
        return (
          <div style={styles.empty}>
            <div style={{ marginBottom: 12 }}>{isPlayoff ? <Trophy size={28} color="#555" /> : <Calendar size={28} color="#555" />}</div>
            <div style={{ color: '#ccc', fontWeight: 700, marginBottom: 4 }}>
              {ev?.eventName ?? 'Upcoming Event'}
            </div>
            {ev?.scheduledAt && (
              <div style={{ color: '#666', fontSize: 13, marginBottom: 10 }}>
                {new Date(ev.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
            <div style={{ color: '#444', fontSize: 13 }}>
              {isPlayoff ? 'Playoff matchup will be set once the regular season ends.' : 'Matchup not yet assigned for this event.'}
            </div>
          </div>
        );
      })() : !matchup ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚔️</div>
          <div style={{ color: '#ccc', fontWeight: 700, marginBottom: 6 }}>No matchup yet</div>
          <div style={{ color: '#555', fontSize: 14 }}>Matchups are generated when the season schedule is set. Check back after the commissioner starts the season.</div>
        </div>
      ) : (
        <>
          <div style={styles.eventHeader}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={styles.eventName}>{matchup.eventName}</div>
              {isLive && <span style={styles.liveBadge}>LIVE</span>}
            </div>
            {(matchup.venue || matchup.location) && (
              <div style={styles.eventLocation}>
                {[matchup.venue, matchup.location].filter(Boolean).join(' · ')}
              </div>
            )}
            {matchup.scheduledAt && (
              <div style={styles.eventDate}>
                {new Date(matchup.scheduledAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            )}
          </div>

          {/* Scoreboard */}
          {(() => {
            const leftMember  = members.find((m: any) => m.id === leftTeamId);
            const rightMember = members.find((m: any) => m.id === rightTeamId);
            const leftColor  = leftMember?.avatarColor  ?? '#5555ff';
            const rightColor = rightMember?.avatarColor ?? '#5555ff';
            const leftHasBelt  = !!leftMember  && hasBelt(leftMember,  members, league);
            const leftHasBmf   = !!leftMember  && hasBmfBelt(leftMember,  league);
            const rightHasBelt = !!rightMember && hasBelt(rightMember, members, league);
            const rightHasBmf  = !!rightMember && hasBmfBelt(rightMember, league);
            return (
          <div style={{ ...styles.scoreboard, ...(isMobile ? styles.scoreboardMobile : {}) }}>
            <div style={styles.teamBlock}>
              <div style={styles.teamLabelRow}>
                <div style={{ position: 'relative', display: 'inline-flex' }} onClick={() => leftMember && setSelectedMember(leftMember)}>
                  <MemberAvatar teamName={leftTeamName ?? ''} color={leftColor} size={32} avatarUrl={leftMember?.avatarUrl} onClick={() => leftMember && setSelectedMember(leftMember)} />
                  {leftHasBelt && <BeltHalo size={32} />}
                  {leftHasBmf && <BeltHalo size={32} variant="bmf" position={leftHasBelt ? 'bottom' : 'top'} />}
                </div>
                <div style={styles.teamLabel}>{leftTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                ...(isStaking ? styles.matchupScoreStaking : {}),
                color: matchup.winnerId === leftTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{isStaking ? fmtStakeScore(leftStakingScore) : leftPicksScore.toFixed(0)}</div>
              <div style={styles.scoreUnit}>{isStaking ? 'event payout' : 'matchup pts'}</div>
            </div>

            <div style={{ ...styles.vsBlock, cursor: 'pointer' }} onClick={() => setShowMatchupPicker(v => !v)}>
              {matchup.winnerId && !isLive ? (
                <div style={styles.resultBadge}>
                  {matchup.winnerId === leftTeamId
                    ? `${leftTeamName} wins`
                    : `${rightTeamName} wins`}
                </div>
              ) : (
                <div style={styles.vsText}>VS</div>
              )}
              <div style={styles.browseHint}>other matchups ▾</div>
            </div>

            <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
              <div style={{ ...styles.teamLabelRow, flexDirection: 'row-reverse' }}>
                <div style={{ position: 'relative', display: 'inline-flex' }} onClick={() => rightMember && setSelectedMember(rightMember)}>
                  <MemberAvatar teamName={rightTeamName ?? ''} color={rightColor} size={32} avatarUrl={rightMember?.avatarUrl} onClick={() => rightMember && setSelectedMember(rightMember)} />
                  {rightHasBelt && <BeltHalo size={32} />}
                  {rightHasBmf && <BeltHalo size={32} variant="bmf" position={rightHasBelt ? 'bottom' : 'top'} />}
                </div>
                <div style={styles.teamLabel}>{rightTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                ...(isStaking ? styles.matchupScoreStaking : {}),
                color: matchup.winnerId === rightTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{isStaking ? fmtStakeScore(rightStakingScore) : rightPicksScore.toFixed(0)}</div>
              <div style={styles.scoreUnit}>{isStaking ? 'event payout' : 'matchup pts'}</div>
            </div>
          </div>
            );
          })()}

          {/* Live fight card */}
          {isLive && (
            <div style={{ ...styles.section, ...(isMobile ? { padding: '0 12px 8px' } : {}) }}>
              <LiveFightCard />
            </div>
          )}

          {/* Picks (pick'em leagues) */}
          {!isStaking && !!matchup?.eventId && (
            <div style={{ ...styles.section, ...(isMobile ? { padding: '0 12px 8px' } : {}) }}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>PICKS</span>
                {homePicks?.locked && <span style={styles.lockedTag}>LOCKED</span>}
              </div>
              {homePicksLoading || awayPicksLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => <SkeletonFightRow key={i} />)
              ) : (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: 'flex-start' }}>
                  {isMobile && <MatchupFightList fights={fights} onPhotoClick={openPhoto} isEventLive={isLive} />}
                  <MatchupPickPanel
                    teamName={leftTeamName ?? ''}
                    fights={leftPicks?.fights ?? []}
                    champion={leftChampion}
                    isLocked={!(isMeHome || isMeAway) && !eventIsLive}
                    isOwn={isMeHome || isMeAway}
                    leagueId={leagueId}
                    locked={leftPicks?.locked}
                  />
                  {!isMobile && <MatchupFightList fights={fights} onPhotoClick={openPhoto} isEventLive={isLive} />}
                  <MatchupPickPanel
                    teamName={rightTeamName ?? ''}
                    fights={rightPicks?.fights ?? []}
                    champion={rightChampion}
                    isLocked={!eventIsLive}
                  />
                </div>
              )}
            </div>
          )}

          {/* Staking bets — user always on left */}
          {isStaking && (
            <StakingBetsSection
              fights={leftStaking?.fights ?? rightStaking?.fights ?? []}
              homeStaking={leftStaking}
              awayStaking={rightStaking}
              homeTeamName={leftTeamName ?? ''}
              awayTeamName={rightTeamName ?? ''}
              isMeHome={isMeHome || isMeAway}
              isMeAway={false}
              isEventLive={eventIsLive}
              leagueId={leagueId}
              onPhotoClick={openPhoto}
            />
          )}

          {/* Score breakdown (pick'em only) */}
          {!isStaking && (
            <div style={{ ...styles.totalsBar, ...(isMobile ? { padding: '16px', flexDirection: 'column', gap: 24 } : {}) }}>
              <ScoreBreakdown
                label={leftTeamName ?? ''}
                picks={leftPicks?.fights ?? []}
                matchupPts={leftPicksScore}
                championPts={leftChampion?.pointsEarned ? +leftChampion.pointsEarned : 0}
              />
              <div style={styles.totalsDivider} />
              <ScoreBreakdown
                label={rightTeamName ?? ''}
                picks={rightPicks?.fights ?? []}
                matchupPts={rightPicksScore}
                championPts={rightChampion?.pointsEarned ? +rightChampion.pointsEarned : 0}
              />
            </div>
          )}

          {/* Season breakdown table */}
          <SeasonTable
            allMatchups={allMatchups}
            homeTeamId={matchup.homeTeamId}
            awayTeamId={matchup.awayTeamId}
            homeTeamName={matchup.homeTeamName}
            awayTeamName={matchup.awayTeamName}
            currentEventId={matchup.eventId}
            isStaking={isStaking}
          />
        </>
      )}

      {selectedMember && league && (
        <MemberSheet
          member={selectedMember}
          members={members}
          league={league}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {showMatchupPicker && matchup && (() => {
        const eventMatchups = allMatchups.filter((m) => m.eventId === matchup.eventId);
        const myMatchupForEvent = myMatchupByEvent.get(matchup.eventId);
        return (
          <div style={styles.pickerOverlay} onClick={() => setShowMatchupPicker(false)}>
            <div style={styles.pickerSheet} onClick={(e) => e.stopPropagation()}>
              <div style={styles.pickerTitle}>Matchups · {matchup.eventName?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ').replace(/^UFC\s+/i, 'UFC ')}</div>
              {eventMatchups.map((m) => {
                const isMyMatchup = m.id === myMatchupForEvent?.id;
                const isActive = browsingMatchupId === m.id || (!browsingMatchupId && isMyMatchup);
                return (
                  <button
                    key={m.id}
                    style={{ ...styles.pickerRow, ...(isActive ? styles.pickerRowActive : {}) }}
                    onClick={() => {
                      setBrowsingMatchupId(isMyMatchup ? null : m.id);
                      setShowMatchupPicker(false);
                    }}
                  >
                    <span style={styles.pickerTeam}>{m.homeTeamName}</span>
                    <span style={styles.pickerVs}>vs</span>
                    <span style={styles.pickerTeam}>{m.awayTeamName}</span>
                    {isMyMatchup && <span style={styles.pickerMine}>mine</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {enlargedPhoto && (
        <FighterModal
          photo={enlargedPhoto.url}
          name={enlargedPhoto.name}
          fighterId={enlargedPhoto.fighterId}
          onClose={() => setEnlargedPhoto(null)}
        />
      )}
    </div>
  );
}

// Compute pick'em score from the loaded picks data.
// `dbFallback` is used when picks haven't loaded yet (null triggers computation from picks).
function calcPicksScore(picks: any[], championPts: number, dbFallback: number | null): number {
  if (dbFallback !== null) return dbFallback;
  const scored = picks.filter((p) => p.isCorrect !== null);
  if (scored.length === 0) return 0;
  const correct = scored.filter((p) => p.isCorrect === true);
  const pts = picks.reduce((s: number, p: any) => s + (+(p.pointsEarned ?? 0)), 0);
  const sweep = correct.length === 6 ? 20 : correct.length === 5 ? 10 : correct.length === 4 ? 5 : 0;
  return pts + sweep + championPts;
}

type SeasonRow = {
  eventId: string; eventName: string; scheduledAt: string;
  homeScore: number; awayScore: number;
  isCurrent: boolean;
};

function SeasonTable({ allMatchups, homeTeamId, awayTeamId, homeTeamName, awayTeamName, currentEventId, isStaking }: {
  allMatchups: any[]; homeTeamId: string; awayTeamId: string;
  homeTeamName: string; awayTeamName: string; currentEventId: string; isStaking?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const seenEventIds = new Set<string>();
  const relevantEvents: any[] = [];
  for (const m of allMatchups) {
    const involves = m.homeTeamId === homeTeamId || m.awayTeamId === homeTeamId
                  || m.homeTeamId === awayTeamId  || m.awayTeamId === awayTeamId;
    if (involves && !seenEventIds.has(m.eventId)) {
      seenEventIds.add(m.eventId);
      relevantEvents.push(m);
    }
  }

  const teamScore = (eventId: string, teamId: string): number => {
    const m = allMatchups.find(
      (x) => x.eventId === eventId && (x.homeTeamId === teamId || x.awayTeamId === teamId),
    );
    if (!m) return 0;
    return +(m.homeTeamId === teamId ? m.homeScore : m.awayScore);
  };

  const rows: SeasonRow[] = relevantEvents.map((ev): SeasonRow => ({
    eventId: ev.eventId as string,
    eventName: ev.eventName as string,
    scheduledAt: ev.scheduledAt as string,
    homeScore: teamScore(ev.eventId, homeTeamId),
    awayScore: teamScore(ev.eventId, awayTeamId),
    isCurrent: ev.eventId === currentEventId,
  }))
    .filter((r) => isStaking || r.homeScore > 0 || r.awayScore > 0)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  if (rows.length === 0) return null;

  const totalHome = rows.reduce((s, r) => s + r.homeScore, 0);
  const totalAway = rows.reduce((s, r) => s + r.awayScore, 0);

  return (
    <div style={styles.seasonSection}>
      <button
        style={styles.sectionHeaderBtn}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={styles.sectionTitle}>SEASON BREAKDOWN <span style={styles.collapseChevron}>{open ? '▲' : '▼'}</span></span>
      </button>
      {open && <div style={styles.seasonTable}>
        <div style={styles.seasonHeaderRow}>
          <div style={styles.seasonTeamCell}>{homeTeamName}</div>
          <div style={{ ...styles.seasonEventCell, textAlign: 'center' as const }}>EVENT</div>
          <div style={{ ...styles.seasonTeamCell, justifyContent: 'flex-start' }}>{awayTeamName}</div>
        </div>
        {rows.map((r) => {
          const short = r.eventName.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ').replace(/^UFC\s+/i, 'UFC ');
          const fmtS = isStaking ? fmtStakeScore : (n: number) => n.toFixed(0);
          return (
            <div key={r.eventId} style={{ ...styles.seasonRow, ...(r.isCurrent ? styles.seasonRowCurrent : {}) }}>
              <div style={styles.seasonScoreCell}>
                <span style={{ ...styles.seasonPts, ...(isStaking ? { color: r.homeScore < 0 ? '#ff5252' : r.homeScore > 0 ? '#4caf50' : '#555' } : {}) }}>
                  {fmtS(r.homeScore)}
                </span>
              </div>
              <div style={{ ...styles.seasonEventCell, textAlign: 'center' as const }}>{short}</div>
              <div style={{ ...styles.seasonScoreCell, justifyContent: 'flex-start' }}>
                <span style={{ ...styles.seasonPts, ...(isStaking ? { color: r.awayScore < 0 ? '#ff5252' : r.awayScore > 0 ? '#4caf50' : '#555' } : {}) }}>
                  {fmtS(r.awayScore)}
                </span>
              </div>
            </div>
          );
        })}
        <div style={styles.seasonTotalRow}>
          <div style={styles.seasonScoreCell}>
            <span style={{ ...styles.seasonTotalPts, ...(isStaking ? { color: totalHome < 0 ? '#ff5252' : '#ff8c42' } : {}) }}>
              {isStaking ? fmtStakeScore(totalHome) : totalHome.toFixed(0)}
            </span>
          </div>
          <div style={{ ...styles.seasonEventCell, textAlign: 'center' as const }}>SEASON TOTAL</div>
          <div style={{ ...styles.seasonScoreCell, justifyContent: 'flex-start' }}>
            <span style={{ ...styles.seasonTotalPts, ...(isStaking ? { color: totalAway < 0 ? '#ff5252' : '#ff8c42' } : {}) }}>
              {isStaking ? fmtStakeScore(totalAway) : totalAway.toFixed(0)}
            </span>
          </div>
        </div>
      </div>}
    </div>
  );
}

const PICK_METHOD_LABEL2: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'Sub', decision: 'Dec',
};

function ScoreBreakdown({ label, picks, matchupPts, championPts }: {
  label: string; picks: any[]; matchupPts: number; championPts: number;
}) {
  const scored = picks.filter((p) => p.isCorrect !== null);
  const correct = picks.filter((p) => p.isCorrect === true);
  const hasScores = scored.length > 0;

  const sweepBonus = correct.length === 6 ? 20 : correct.length === 5 ? 10 : correct.length === 4 ? 5 : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ ...styles.totalsTeam, marginBottom: 10 }}>{label}</div>
      {hasScores ? (
        <>
          {picks.map((p) => {
            const isRed = p.pickedFighterId === p.redFighterId;
            const fullName: string = isRed ? `${p.redFirstName} ${p.redLastName}` : `${p.blueFirstName} ${p.blueLastName}`;
            const earned = +(p.pointsEarned ?? 0);
            const isDecision = ['decision_unanimous', 'decision_split', 'decision_majority'].includes(p.resultOutcome);
            const methodMatch =
              (p.pickedMethod === 'ko_tko'    && p.resultOutcome === 'ko_tko') ||
              (p.pickedMethod === 'submission' && p.resultOutcome === 'submission') ||
              (p.pickedMethod === 'decision'   && isDecision);

            let resultLabel = '';
            if (p.isCorrect === true) {
              resultLabel = methodMatch
                ? `Win + ${PICK_METHOD_LABEL2[p.pickedMethod] ?? p.pickedMethod}`
                : 'Win';
            }

            return (
              <div key={p.id ?? fullName} style={styles.bdPickRow}>
                <span style={{ ...styles.bdFighter, color: p.isCorrect ? '#ccc' : p.isCorrect === false ? '#333' : '#666' }}>
                  {fullName}
                </span>
                <span style={{ ...styles.bdResult, color: p.isCorrect ? '#666' : '#2a2a2a' }}>
                  {p.isCorrect === true ? resultLabel : p.isCorrect === false ? '✗' : '—'}
                </span>
                <span style={{ ...styles.bdPts, color: p.isCorrect ? '#4caf50' : '#2a2a2a' }}>
                  {p.isCorrect === true ? `+${earned}` : ''}
                </span>
              </div>
            );
          })}

          {(sweepBonus > 0 || championPts > 0) && (
            <div style={styles.breakdownDividerRow} />
          )}
          {sweepBonus > 0 && (
            <div style={styles.bdPickRow}>
              <span style={{ ...styles.bdFighter, color: '#888' }}>Sweep bonus</span>
              <span style={{ ...styles.bdResult, color: '#555' }}>{correct.length}/6</span>
              <span style={{ ...styles.bdPts, color: '#4caf50' }}>+{sweepBonus}</span>
            </div>
          )}
          {championPts > 0 && (
            <div style={styles.bdPickRow}>
              <span style={{ ...styles.bdFighter, color: '#ffd700' }}>★ Champion</span>
              <span style={{ ...styles.bdResult, color: '#666' }}>Win</span>
              <span style={{ ...styles.bdPts, color: '#4caf50' }}>+{championPts}</span>
            </div>
          )}

          <div style={{ ...styles.breakdownDividerRow, marginTop: 'auto', paddingTop: 6 }} />
          <div style={{ ...styles.bdPickRow, paddingTop: 6 }}>
            <span style={{ ...styles.bdFighter, color: '#555', fontWeight: 700, textTransform: 'uppercase', fontSize: 10, letterSpacing: 0.5 }}>
              Total
            </span>
            <span style={styles.bdResult} />
            <span style={styles.totalsMatchup}>{matchupPts.toFixed(0)}</span>
          </div>
        </>
      ) : (
        <div style={styles.breakdownPending}>Scores update as fights complete</div>
      )}
    </div>
  );
}


const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { position: 'sticky' as const, top: 0, zIndex: 100, background: 'rgba(17,17,17,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', borderBottom: '1px solid #222', padding: '8px 20px', minHeight: 52, boxSizing: 'border-box' as const, display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  currentBtn: { background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', fontSize: 12, padding: '4px 10px', cursor: 'pointer' },
  empty: { color: '#888', padding: 40, textAlign: 'center', marginTop: 80 },

  historyStrip: {
    display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 24px',
    background: '#0d0d0d', borderBottom: '1px solid #1a1a1a',
    scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent',
  },
  historyChip: {
    flexShrink: 0, background: '#141414', border: '1px solid #242424',
    borderRadius: 8, padding: '8px 12px', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90,
  },
  historyChipActive: { border: '1px solid #c8102e', background: '#1a0808' },
  historyChipCurrent: { border: '1px solid #ffd700', background: '#1a1800' },
  historyChipNoMatchup: { opacity: 0.5, cursor: 'pointer' },
  chipNextBadge: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipLiveBadge: { color: '#c8102e', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipFinalsBadge: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipSemisBadge: { color: '#ff8c42', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipEvent: { color: '#888', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  chipDate: { color: '#444', fontSize: 10, textAlign: 'center' },
  chipOpp: { color: '#555', fontSize: 10, textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipScore: { color: '#fff', fontSize: 14, fontWeight: 700 },
  chipResult: { fontSize: 12, fontWeight: 700 },
  chipPending: { color: '#444', fontSize: 10 },

  eventHeader: { background: '#111', borderBottom: '1px solid #1e1e1e', padding: '16px 24px', textAlign: 'center' },
  eventName: { color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 4 },
  eventLocation: { color: '#555', fontSize: 14 },
  eventDate: { color: '#444', fontSize: 12, marginTop: 2 },

  scoreboard: { background: '#111', borderBottom: '1px solid #222', padding: '24px 32px', display: 'flex', alignItems: 'center' },
  scoreboardMobile: { padding: '16px', flexDirection: 'column', gap: 12 },
  teamBlock: { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  teamLabelRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  teamAvatar: { width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', border: '2px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' },
  teamLabel: { color: '#666', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  matchupScore: { fontSize: 52, fontWeight: 700, lineHeight: 1 },
  matchupScoreStaking: { fontSize: 36 },
  scoreUnit: { color: '#444', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  vsBlock: { flex: 1, textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  vsText: { color: '#333', fontWeight: 700, fontSize: 18 },
  resultBadge: { color: '#ffd700', fontSize: 12, fontWeight: 700, textAlign: 'center' },
  browseHint: { color: '#333', fontSize: 10, letterSpacing: 0.3 },

  pickerOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  pickerSheet: { background: '#141414', border: '1px solid #2a2a2a', borderRadius: 12, minWidth: 320, maxWidth: 440, width: '90vw', overflow: 'hidden' },
  pickerTitle: { padding: '14px 16px 10px', color: '#555', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #1e1e1e' },
  pickerRow: { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'transparent', border: 'none', borderBottom: '1px solid #1a1a1a', cursor: 'pointer', textAlign: 'left' as const },
  pickerRowActive: { background: '#1a0808' },
  pickerTeam: { color: '#ddd', fontSize: 13, fontWeight: 600, flex: 1 },
  pickerVs: { color: '#444', fontSize: 11, flexShrink: 0 },
  pickerMine: { color: '#555', fontSize: 10, flexShrink: 0 },

  section: { padding: '0 24px 8px' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 10px' },
  sectionHeaderBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '20px 0 10px', background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left' as const },
  sectionTitle: { color: '#444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  collapseChevron: { color: '#444', fontSize: 10, marginLeft: 6 },
  lockedTag: { background: '#222', color: '#555', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3 },

  picksHeaderRow: { display: 'flex', alignItems: 'center', borderBottom: '1px solid #1a1a1a', paddingBottom: 6, marginBottom: 4 },
  pickTeamHeader: { flex: 1, color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' },
  fightInfoHeader: { width: 160, textAlign: 'center', color: '#333', fontSize: 10, fontWeight: 700, letterSpacing: 1 },

  noPick: { color: '#333', fontSize: 14 },

  // Pick row — sheet-style fight card with pick badge columns on each side
  pickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #141414' },
  pickBadgeCol: { width: 68, flexShrink: 0, display: 'flex', flexDirection: 'column' as const, alignItems: 'flex-start' },
  fightCardCenter: { flex: 1, display: 'flex', alignItems: 'center', gap: 0, minWidth: 0 },
  fightCardPhoto: { width: 44, height: 54, objectFit: 'cover' as const, objectPosition: 'top center', borderRadius: 4, background: '#111', flexShrink: 0 },
  fightCardFighterInfo: { display: 'flex', flexDirection: 'column' as const, gap: 3, minWidth: 0 },
  fightCardName: { fontSize: 14, fontWeight: 700, lineHeight: 1.2 },
  fightCardOdds: { color: '#555', fontSize: 12 },
  fightCardVs: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, flexShrink: 0, minWidth: 72, padding: '0 10px' },
  vsText2: { color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1 },
  fightCardWeight: { color: '#444', fontSize: 10, textAlign: 'center' as const, lineHeight: 1.3 },
  fightCardResult: { color: '#aaa', fontSize: 10, fontWeight: 700, textAlign: 'center' as const, marginTop: 2 },

  // Legacy — kept for ChampionPickRow which still uses them
  fightInfo: { width: 160, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  fightName: { color: '#555', fontSize: 12, textAlign: 'center' },
  fightWeight: { color: '#333', fontSize: 10, textAlign: 'center' },
  fightResult: { color: '#888', fontSize: 10, textAlign: 'center', marginTop: 2 },

  seasonSection: { padding: '0 24px 16px' },
  seasonTable: { border: '1px solid #242424', borderRadius: 8, overflow: 'hidden' },
  seasonHeaderRow: { display: 'flex', padding: '8px 12px', background: '#0d0d0d', borderBottom: '1px solid #1e1e1e' },
  seasonRow: { display: 'flex', padding: '9px 12px', borderBottom: '1px solid #111' },
  seasonRowCurrent: { background: '#111' },
  seasonTotalRow: { display: 'flex', padding: '10px 12px', background: '#0d0d0d', borderTop: '1px solid #222' },
  seasonEventCell: { flex: 1, color: '#666', fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  seasonScoreCell: { width: 80, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' },
  seasonTeamCell: { width: 80, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  seasonPts: { color: '#ccc', fontSize: 14, fontWeight: 700 },
  seasonBonus: { color: '#4caf50', fontSize: 12, fontWeight: 700 },
  seasonTotalPts: { color: '#ff8c42', fontSize: 15, fontWeight: 700 },
  totalsBar: { background: '#111', borderTop: '1px solid #1e1e1e', padding: '20px 32px', display: 'flex', marginTop: 16 },
  totalsDivider: { width: 1, background: '#222', margin: '0 24px' },
  totalsTeam: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalsLabel: { color: '#444', fontSize: 12 },
  totalsMatchup: { color: '#c8102e', fontSize: 20, fontWeight: 700 },
  totalsSeason: { color: '#ff8c42', fontSize: 20, fontWeight: 700 },
  breakdownRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 24 },
  breakdownDividerRow: { borderTop: '1px solid #1e1e1e', margin: '4px 0' },
  breakdownPending: { color: '#333', fontSize: 12, fontStyle: 'italic' },
  bdPickRow: { display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'baseline', gap: '0 10px', padding: '3px 0' },
  bdFighter: { fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  bdResult: { fontSize: 12, color: '#555', whiteSpace: 'nowrap' as const },
  bdPts: { fontSize: 12, fontWeight: 700, minWidth: 28, textAlign: 'right' as const },
};
