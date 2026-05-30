import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link, useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { BeltHalo, MemberSheet, hasBelt, hasBmfBelt } from '../components/MemberSheet';
import { SkeletonFightRow } from '../components/LoadingScreen';
import { FighterPhoto } from '../components/FighterPhoto';

const METHOD_LABELS: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB',
  decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
  decision_majority: 'DEC (M)', draw: 'DRAW',
  no_contest: 'NC', disqualification: 'DQ',
  decision: 'DEC',
};

type PhotoClickHandler = (url: string, name: string) => void;

export function MatchupPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const isMobile = useIsMobile();
  const location = useLocation();
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
  const [browsingMatchupId, setBrowsingMatchupId] = useState<string | null>(null);
  const [showMatchupPicker, setShowMatchupPicker] = useState(false);

  // Reset to current matchup whenever the user navigates to this page
  useEffect(() => {
    setSelectedMatchupId(null);
    setBrowsingMatchupId(null);
    setShowMatchupPicker(false);
  }, [location.key]);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string } | null>(null);
  const openPhoto: PhotoClickHandler = (url, name) => setEnlargedPhoto({ url, name });
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

  const effectiveMatchupId = browsingMatchupId ?? selectedMatchupId;
  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId, effectiveMatchupId],
    queryFn: async () => {
      if (effectiveMatchupId) {
        return apiClient.get(`/leagues/${leagueId}/matchups/${effectiveMatchupId}`);
      }
      const current = await apiClient.get<any, any>(`/leagues/${leagueId}/matchups/current`);
      if (!current) return null;
      return apiClient.get(`/leagues/${leagueId}/matchups/${current.id}`);
    },
  });

  const { data: homePicks, isLoading: homePicksLoading } = useQuery<any>({
    queryKey: ['matchup-picks-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
  });

  const { data: awayPicks, isLoading: awayPicksLoading } = useQuery<any>({
    queryKey: ['matchup-picks-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
  });

  const { data: homeChampion } = useQuery<any>({
    queryKey: ['matchup-champion-home', leagueId, matchup?.eventId, matchup?.homeTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.homeTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.homeTeamId,
  });

  const { data: awayChampion } = useQuery<any>({
    queryKey: ['matchup-champion-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${matchup!.eventId}/champion?memberId=${matchup!.awayTeamId}`),
    enabled: !!matchup?.eventId && !!matchup?.awayTeamId,
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
  });
  const { data: awayStaking } = useQuery<any>({
    queryKey: ['matchup-staking-away', leagueId, matchup?.eventId, matchup?.awayTeamId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${matchup!.eventId}?memberId=${matchup!.awayTeamId}`),
    enabled: isStaking && !!matchup?.eventId && !!matchup?.awayTeamId,
  });

  const isLive = matchup?.eventStatus === 'live';
  const eventIsLive = matchup?.eventStatus === 'live' || matchup?.eventStatus === 'completed';

  // Orient so the current user's bets are always on the left
  const isMeHome = !!myMember && myMember.id === matchup?.homeTeamId;
  const isMeAway = !!myMember && myMember.id === matchup?.awayTeamId;
  const myStaking = isMeHome ? homeStaking : isMeAway ? awayStaking : homeStaking;
  const oppStaking = isMeHome ? awayStaking : isMeAway ? homeStaking : awayStaking;
  const myStakingTeamName = isMeHome ? matchup?.homeTeamName : isMeAway ? matchup?.awayTeamName : matchup?.homeTeamName;
  const oppStakingTeamName = isMeHome ? matchup?.awayTeamName : isMeAway ? matchup?.homeTeamName : matchup?.awayTeamName;
  const fights: any[] = homePicks?.fights ?? [];
  const awayPickMap: Record<string, any> = {};
  for (const f of (awayPicks?.fights ?? [])) awayPickMap[f.id] = f;

  const isViewingHistory = !!selectedMatchupId && selectedMatchupId !== mostRecentMyMatchup?.id;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>Matchup</span>
        {isLive && !effectiveMatchupId && <span style={styles.liveBadge}>LIVE</span>}
        {browsingMatchupId && (
          <button style={styles.currentBtn} onClick={() => setBrowsingMatchupId(null)}>
            ← My matchup
          </button>
        )}
        {isViewingHistory && !browsingMatchupId && (
          <button style={styles.currentBtn} onClick={() => setSelectedMatchupId(null)}>
            ← Current
          </button>
        )}
      </nav>

      {seasonEvents.length > 0 && (
        <div style={styles.historyStrip}>
          {seasonEvents.map((ev) => {
            const myM = myMatchupByEvent.get(ev.eventId);
            const isMeHome = myM?.homeTeamId === myMember?.id;
            const myScore = myM ? +(isMeHome ? myM.homeScore : myM.awayScore) : null;
            const oppScore = myM ? +(isMeHome ? myM.awayScore : myM.homeScore) : null;
            const oppName = myM ? (isMeHome ? myM.awayTeamName : myM.homeTeamName) : null;
            const isWin = myM?.winnerId && myM.winnerId === myMember?.id;
            const isLoss = myM?.winnerId && myM.winnerId !== myMember?.id;
            const hasScore = myM && (myM.eventStatus === 'completed' || myM.winnerId || (myScore ?? 0) > 0);
            const isActive = !!selectedMatchupId && myM?.id === selectedMatchupId;
            const eventShort = ev.eventName
              ?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
              .replace(/^UFC\s+/i, 'UFC ') ?? ev.eventName;
            const dateStr = ev.scheduledAt
              ? new Date(ev.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null;

            const isCurrentEvent = ev.eventId === currentUpcomingEventId;
            const isLiveEvent = ev.eventStatus === 'live';
            const isSemis = ev.eventId === league?.playoffSemisEventId;
            const isFinals = ev.eventId === league?.playoffFinalsEventId;

            return (
              <button
                key={ev.eventId}
                style={{ ...styles.historyChip, ...(isActive ? styles.historyChipActive : isCurrentEvent ? styles.historyChipCurrent : {}), ...(!myM ? styles.historyChipNoMatchup : {}) }}
                onClick={() => { setBrowsingMatchupId(null); setShowMatchupPicker(false); myM && setSelectedMatchupId(myM.id === mostRecentMyMatchup?.id ? null : myM.id); }}
                disabled={!myM}
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
                      <span style={{ ...styles.chipResult, color: isWin ? '#4caf50' : isLoss ? '#ff5252' : '#ffd700' }}>
                        {isWin ? 'W' : isLoss ? 'L' : 'T'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={styles.chipOpp}>vs {oppName}</span>
                      <span style={styles.chipPending}>Upcoming</span>
                    </>
                  )
                ) : (
                  <span style={styles.chipPending}>No matchup</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!matchup ? (
        <div style={styles.empty}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚔️</div>
          <div style={{ color: '#ccc', fontWeight: 700, marginBottom: 6 }}>No matchup yet</div>
          <div style={{ color: '#555', fontSize: 14 }}>Matchups are generated when the season schedule is set. Check back after the commissioner starts the season.</div>
        </div>
      ) : (
        <>
          <div style={styles.eventHeader}>
            <div style={styles.eventName}>{matchup.eventName}</div>
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
            const homeMember = members.find((m: any) => m.id === matchup.homeTeamId);
            const awayMember = members.find((m: any) => m.id === matchup.awayTeamId);
            const homeColor = homeMember?.avatarColor ?? '#5555ff';
            const awayColor = awayMember?.avatarColor ?? '#5555ff';
            const homeHasBelt = !!homeMember && hasBelt(homeMember, members, league);
            const homeHasBmf = !!homeMember && hasBmfBelt(homeMember, league);
            const awayHasBelt = !!awayMember && hasBelt(awayMember, members, league);
            const awayHasBmf = !!awayMember && hasBmfBelt(awayMember, league);
            return (
          <div style={{ ...styles.scoreboard, ...(isMobile ? styles.scoreboardMobile : {}) }}>
            <div style={styles.teamBlock}>
              <div style={styles.teamLabelRow}>
                <div style={{ position: 'relative', display: 'inline-flex', cursor: homeMember ? 'pointer' : 'default' }} onClick={() => homeMember && setSelectedMember(homeMember)}>
                  <div style={{ ...styles.teamAvatar, background: homeColor + '33', borderColor: homeColor }}>{matchup.homeTeamName?.charAt(0).toUpperCase()}</div>
                  {homeHasBelt && <BeltHalo size={32} />}
                  {homeHasBmf && <BeltHalo size={32} variant="bmf" position={homeHasBelt ? 'bottom' : 'top'} />}
                </div>
                <div style={styles.teamLabel}>{matchup.homeTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                ...(isStaking ? styles.matchupScoreStaking : {}),
                color: matchup.winnerId === matchup.homeTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{isStaking ? fmtStakeScore(+matchup.homeScore) : (+matchup.homeScore).toFixed(0)}</div>
              <div style={styles.scoreUnit}>{isStaking ? 'event payout' : 'matchup pts'}</div>
            </div>

            <div style={{ ...styles.vsBlock, cursor: 'pointer' }} onClick={() => setShowMatchupPicker(v => !v)}>
              {matchup.winnerId ? (
                <div style={styles.resultBadge}>
                  {matchup.winnerId === matchup.homeTeamId
                    ? `${matchup.homeTeamName} wins`
                    : `${matchup.awayTeamName} wins`}
                </div>
              ) : (
                <div style={styles.vsText}>VS</div>
              )}
              <div style={styles.browseHint}>other matchups ▾</div>
            </div>

            <div style={{ ...styles.teamBlock, alignItems: 'flex-end' }}>
              <div style={{ ...styles.teamLabelRow, flexDirection: 'row-reverse' }}>
                <div style={{ position: 'relative', display: 'inline-flex', cursor: awayMember ? 'pointer' : 'default' }} onClick={() => awayMember && setSelectedMember(awayMember)}>
                  <div style={{ ...styles.teamAvatar, background: awayColor + '33', borderColor: awayColor }}>{matchup.awayTeamName?.charAt(0).toUpperCase()}</div>
                  {awayHasBelt && <BeltHalo size={32} />}
                  {awayHasBmf && <BeltHalo size={32} variant="bmf" position={awayHasBelt ? 'bottom' : 'top'} />}
                </div>
                <div style={styles.teamLabel}>{matchup.awayTeamName}</div>
              </div>
              <div style={{
                ...styles.matchupScore,
                ...(isStaking ? styles.matchupScoreStaking : {}),
                color: matchup.winnerId === matchup.awayTeamId ? '#fff' : matchup.winnerId ? '#444' : '#fff',
              }}>{isStaking ? fmtStakeScore(+matchup.awayScore) : (+matchup.awayScore).toFixed(0)}</div>
              <div style={styles.scoreUnit}>{isStaking ? 'event payout' : 'matchup pts'}</div>
            </div>
          </div>
            );
          })()}

          {/* Picks (pick'em leagues) */}
          {!isStaking && !!matchup?.eventId && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>PICKS</span>
                {homePicks?.locked && <span style={styles.lockedTag}>LOCKED</span>}
              </div>
              {homePicksLoading || awayPicksLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => <SkeletonFightRow key={i} />)
              ) : (
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <MatchupPickPanel
                    teamName={isMeHome ? matchup.homeTeamName : isMeAway ? matchup.awayTeamName : matchup.homeTeamName}
                    fights={isMeHome ? (homePicks?.fights ?? []) : isMeAway ? (awayPicks?.fights ?? []) : (homePicks?.fights ?? [])}
                    champion={isMeHome ? homeChampion : isMeAway ? awayChampion : homeChampion}
                    isLocked={!(isMeHome || isMeAway) && !eventIsLive}
                    isOwn={isMeHome || isMeAway}
                    leagueId={leagueId}
                    locked={homePicks?.locked}
                  />
                  <MatchupFightList fights={fights} onPhotoClick={openPhoto} />
                  <MatchupPickPanel
                    teamName={isMeHome ? matchup.awayTeamName : isMeAway ? matchup.homeTeamName : matchup.awayTeamName}
                    fights={isMeHome ? (awayPicks?.fights ?? []) : isMeAway ? (homePicks?.fights ?? []) : (awayPicks?.fights ?? [])}
                    champion={isMeHome ? awayChampion : isMeAway ? homeChampion : awayChampion}
                    isLocked={!eventIsLive}
                  />
                </div>
              )}
            </div>
          )}

          {/* Staking bets */}
          {isStaking && (
            <StakingBetsSection
              fights={myStaking?.fights ?? oppStaking?.fights ?? []}
              myStaking={myStaking}
              oppStaking={oppStaking}
              myTeamName={myStakingTeamName ?? matchup.homeTeamName}
              oppTeamName={oppStakingTeamName ?? matchup.awayTeamName}
              isEventLive={eventIsLive}
              amInMatchup={isMeHome || isMeAway}
              leagueId={leagueId}
              onPhotoClick={openPhoto}
            />
          )}

          {/* Score breakdown (pick'em only) */}
          {!isStaking && (
            <div style={styles.totalsBar}>
              <ScoreBreakdown
                label={matchup.homeTeamName}
                picks={homePicks?.fights ?? []}
                matchupPts={+matchup.homeScore}
                championPts={homeChampion?.pointsEarned ? +homeChampion.pointsEarned : 0}
              />
              <div style={styles.totalsDivider} />
              <ScoreBreakdown
                label={matchup.awayTeamName}
                picks={awayPicks?.fights ?? []}
                matchupPts={+matchup.awayScore}
                championPts={awayChampion?.pointsEarned ? +awayChampion.pointsEarned : 0}
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
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setEnlargedPhoto(null)}
        >
          <img
            src={enlargedPhoto.url}
            alt={enlargedPhoto.name}
            style={{ maxWidth: '80vw', maxHeight: '75vh', objectFit: 'contain', objectPosition: 'top center', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          />
          <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginTop: 16, letterSpacing: 0.5 }}>{enlargedPhoto.name}</div>
        </div>
      )}
    </div>
  );
}

const PICK_METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB', decision: 'DEC', disqualification: 'DQ',
};

type SeasonRow = {
  eventId: string; eventName: string; scheduledAt: string;
  homeScore: number; awayScore: number;
  isCurrent: boolean;
};

function SeasonTable({ allMatchups, homeTeamId, awayTeamId, homeTeamName, awayTeamName, currentEventId, isStaking }: {
  allMatchups: any[]; homeTeamId: string; awayTeamId: string;
  homeTeamName: string; awayTeamName: string; currentEventId: string; isStaking?: boolean;
}) {
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
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>SEASON BREAKDOWN</span>
      </div>
      <div style={styles.seasonTable}>
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
      </div>
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

// ── Staking helpers ──────────────────────────────────────────────────────────

function fmtOddsAmerican(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '$') + s;
}

function fmtStakeScore(n: number): string {
  const abs = Math.abs(n);
  const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '+$') + s;
}

function fmtChipScore(n: number): string {
  const abs = Math.abs(n);
  const s = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  return n < 0 ? `(${s})` : s;
}

// ── Staking matchup layout ────────────────────────────────────────────────────

function MatchupBetRow({ bet }: { bet: any }) {
  const stake = parseFloat(bet.stake) || 0;
  const odds: number | null = bet.odds != null ? +bet.odds : null;
  const isPending = bet.status === 'pending';
  const pl = parseFloat(bet.profitLoss);
  const potentialPayout = parseFloat(bet.potentialPayout) || 0;

  const rowBg = !isPending ? (bet.status === 'won' ? 'rgba(76,175,80,0.08)' : 'rgba(255,82,82,0.08)') : undefined;

  return (
    <div style={{ ...mb.betRow, background: rowBg }}>
      <div style={mb.betLeft}>
        <div style={{ ...mb.betFighter, color: isPending ? '#ddd' : bet.status === 'won' ? '#4caf50' : '#ff5252' }}>
          {bet.fighterFirstName} {bet.fighterLastName}
        </div>
        {odds != null && (
          <div style={{ ...mb.betOdds, color: odds < 0 ? '#888' : '#4caf50' }}>{fmtOddsAmerican(odds)}</div>
        )}
      </div>
      <div style={mb.betRight}>
        <div style={mb.betStake}>{fmtMoney(stake)}</div>
        {isPending
          ? <div style={mb.betPotential}>Win {fmtMoney(potentialPayout)}</div>
          : <div style={{ ...mb.betPnl, color: pl >= 0 ? '#4caf50' : '#ff5252' }}>
              {bet.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
            </div>
        }
      </div>
    </div>
  );
}

function MatchupBetPanel({ teamName, singles, isLocked, isOwn, leagueId, isEventLive }: {
  teamName: string; singles: any[]; isLocked: boolean;
  isOwn?: boolean; leagueId?: string; isEventLive?: boolean;
}) {
  const pending = singles.filter((s: any) => s.status === 'pending');
  const settled = singles.filter((s: any) => s.status !== 'pending');

  const totalStaked = singles.reduce((sum, s) => sum + (parseFloat(s.stake) || 0), 0);
  const totalPotential = pending.reduce((sum, s) => sum + (parseFloat(s.potentialPayout) || 0), 0);
  const totalPnl = settled.reduce((sum, s) => sum + (parseFloat(s.profitLoss) || 0), 0);
  const showTotals = !isLocked && singles.length > 0;

  return (
    <div style={mb.panel}>
      <div style={mb.header}>
        <span style={mb.headerTitle}>{teamName}</span>
        {singles.length > 0 && <span style={mb.badge}>{singles.length}</span>}
        {isOwn && leagueId && !isEventLive && (
          <Link to={`/league/${leagueId}/staking`} style={mb.editLink}>Edit Bets</Link>
        )}
      </div>

      {isLocked ? (
        <div style={mb.locked}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
          <div style={{ color: '#333', fontSize: 11, fontStyle: 'italic' }}>Revealed at event start</div>
        </div>
      ) : singles.length === 0 ? (
        <div style={mb.empty}>No bets placed</div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <div style={mb.sectionLabel}>PENDING</div>
              {pending.map((s: any) => <MatchupBetRow key={s.id} bet={s} />)}
            </>
          )}
          {settled.length > 0 && (
            <>
              <div style={mb.sectionLabel}>SETTLED</div>
              {settled.map((s: any) => <MatchupBetRow key={s.id} bet={s} />)}
            </>
          )}
        </>
      )}

      {showTotals && (
        <div style={mb.totalsRow}>
          <div style={mb.totalItem}>
            <span style={mb.totalLabel}>Staked</span>
            <span style={mb.totalVal}>{fmtMoney(totalStaked)}</span>
          </div>
          {pending.length > 0 && totalPotential > 0 && (
            <div style={mb.totalItem}>
              <span style={mb.totalLabel}>To win</span>
              <span style={{ ...mb.totalVal, color: '#4caf50' }}>{fmtMoney(totalPotential)}</span>
            </div>
          )}
          {settled.length > 0 && (
            <div style={mb.totalItem}>
              <span style={mb.totalLabel}>P&L</span>
              <span style={{ ...mb.totalVal, color: totalPnl >= 0 ? '#4caf50' : '#ff5252' }}>
                {totalPnl >= 0 ? '+' : ''}{fmtMoney(totalPnl)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchupPickPanel({ teamName, fights, champion, isLocked, isOwn, leagueId, locked }: {
  teamName: string; fights: any[]; champion: any; isLocked: boolean;
  isOwn?: boolean; leagueId?: string; locked?: boolean;
}) {
  const pickedCount = fights.filter((f) => f.pickedFighterId).length;

  return (
    <div style={mb.panel}>
      <div style={mb.header}>
        <span style={mb.headerTitle}>{teamName}</span>
        {pickedCount > 0 && <span style={mb.badge}>{pickedCount}</span>}
        {isOwn && leagueId && !locked && (
          <Link to={`/league/${leagueId}/picks`} style={mb.editLink}>Edit Picks</Link>
        )}
      </div>

      {isLocked ? (
        <div style={mb.locked}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
          <div style={{ color: '#333', fontSize: 11, fontStyle: 'italic' }}>Revealed at event start</div>
        </div>
      ) : pickedCount === 0 && !champion ? (
        <div style={mb.empty}>No picks placed</div>
      ) : (
        <>
          {fights.map((fight) => {
            if (!fight.pickedFighterId) return (
              <div key={fight.id} style={mb.betRow}>
                <span style={{ color: '#2a2a2a', fontSize: 12 }}>—</span>
              </div>
            );
            const isRed = fight.pickedFighterId === fight.redFighterId;
            const firstName = isRed ? fight.redFirstName : fight.blueFirstName;
            const lastName = isRed ? fight.redLastName : fight.blueLastName;
            const scored = fight.isCorrect !== null && fight.isCorrect !== undefined;
            const correct = fight.isCorrect === true;
            const rowBg = scored ? (correct ? 'rgba(76,175,80,0.08)' : 'rgba(255,82,82,0.08)') : undefined;
            return (
              <div key={fight.id} style={{ ...mb.betRow, background: rowBg }}>
                <div style={mb.betLeft}>
                  <div style={{ ...mb.betFighter, color: scored ? (correct ? '#4caf50' : '#ff5252') : '#ddd' }}>
                    {firstName} {lastName}
                  </div>
                  {fight.pickedMethod && (
                    <div style={mb.betOdds}>{PICK_METHOD_LABEL[fight.pickedMethod] ?? fight.pickedMethod}</div>
                  )}
                </div>
                <div style={mb.betRight}>
                  {scored ? (
                    <span style={{ color: correct ? '#4caf50' : '#333', fontSize: 12, fontWeight: 700 }}>
                      {correct ? `+${(+(fight.pointsEarned ?? 0)).toFixed(0)}` : '✗'}
                    </span>
                  ) : (
                    <span style={{ color: '#333', fontSize: 11 }}>–</span>
                  )}
                </div>
              </div>
            );
          })}

          {champion && (() => {
            const champScored = champion.resultWinnerId !== null;
            const champWon = champScored && champion.pointsEarned > 0;
            const champBg = champScored ? (champWon ? 'rgba(76,175,80,0.08)' : 'rgba(255,82,82,0.08)') : 'rgba(255,215,0,0.04)';
            return (
              <div style={{ ...mb.betRow, background: champBg, borderTop: '1px solid #1e1e00' }}>
                <div style={mb.betLeft}>
                  <div style={{ color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>★ CHAMPION</div>
                  <div style={{ ...mb.betFighter, color: champScored ? (champWon ? '#4caf50' : '#ff5252') : '#ddd' }}>
                    {champion.firstName} {champion.lastName}
                  </div>
                </div>
                <div style={mb.betRight}>
                  {champScored ? (
                    <span style={{ color: champWon ? '#4caf50' : '#333', fontSize: 12, fontWeight: 700 }}>
                      {champWon ? `+${(+champion.pointsEarned).toFixed(0)}` : '✗'}
                    </span>
                  ) : (
                    <span style={{ color: '#333', fontSize: 11 }}>–</span>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function MatchupFightList({ fights, onPhotoClick }: { fights: any[]; onPhotoClick?: PhotoClickHandler }) {
  if (fights.length === 0) return null;
  return (
    <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {fights.map((fight) => {
        const hasResult = !!fight.resultWinnerId;
        const redWon = hasResult && fight.resultWinnerId === fight.redFighterId;
        const blueWon = hasResult && fight.resultWinnerId === fight.blueFighterId;
        const fmtO = (n: number) => n >= 0 ? `+${n}` : `${n}`;
        return (
          <div key={fight.id} style={mb.fightCard}>
            <div style={mb.fightCardMeta}>
              <span style={mb.weightLabel}>{fight.weightClassName}</span>
              {hasResult && fight.resultOutcome && (
                <span style={mb.resultLabel}>{METHOD_LABELS[fight.resultOutcome] ?? fight.resultOutcome}</span>
              )}
            </div>
            <div style={mb.fightCardFighters}>
              <div
                style={{ ...mb.fighterSide, opacity: hasResult && !redWon ? 0.3 : 1, cursor: fight.redImageUrl ? 'zoom-in' : 'default' }}
                onClick={() => fight.redImageUrl && onPhotoClick?.(fight.redImageUrl, `${fight.redFirstName} ${fight.redLastName}`)}
              >
                <FighterPhoto imageUrl={fight.redImageUrl} name={`${fight.redFirstName} ${fight.redLastName}`} style={mb.photo} />
                <div>
                  <div style={{ ...mb.fighterName, color: redWon ? '#fff' : '#ccc' }}>{fight.redLastName}</div>
                  {fight.redFighterOdds != null && <div style={mb.fighterOdds}>{fmtO(fight.redFighterOdds)}</div>}
                </div>
              </div>
              <div style={mb.vsLabel}>VS</div>
              <div
                style={{ ...mb.fighterSide, flexDirection: 'row-reverse', opacity: hasResult && !blueWon ? 0.3 : 1, cursor: fight.blueImageUrl ? 'zoom-in' : 'default' }}
                onClick={() => fight.blueImageUrl && onPhotoClick?.(fight.blueImageUrl, `${fight.blueFirstName} ${fight.blueLastName}`)}
              >
                <FighterPhoto imageUrl={fight.blueImageUrl} name={`${fight.blueFirstName} ${fight.blueLastName}`} style={mb.photo} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mb.fighterName, color: blueWon ? '#fff' : '#ccc' }}>{fight.blueLastName}</div>
                  {fight.blueFighterOdds != null && <div style={mb.fighterOdds}>{fmtO(fight.blueFighterOdds)}</div>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StakingBetsSection({ fights, myStaking, oppStaking, myTeamName, oppTeamName, isEventLive, amInMatchup, leagueId, onPhotoClick }: {
  fights: any[]; myStaking: any; oppStaking: any;
  myTeamName: string; oppTeamName: string;
  isEventLive: boolean; amInMatchup: boolean; leagueId?: string; onPhotoClick?: PhotoClickHandler;
}) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>BETS</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <MatchupBetPanel teamName={myTeamName} singles={myStaking?.singles ?? []} isLocked={!amInMatchup && !isEventLive} isOwn={amInMatchup} leagueId={leagueId} isEventLive={isEventLive} />
        <MatchupFightList fights={fights} onPhotoClick={onPhotoClick} />
        <MatchupBetPanel teamName={oppTeamName} singles={oppStaking?.singles ?? []} isLocked={!isEventLive} />
      </div>
    </div>
  );
}

const mb: Record<string, React.CSSProperties> = {
  panel: { flex: 1, background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#141414', borderBottom: '1px solid #1a1a1a' },
  headerTitle: { color: '#666', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  badge: { background: '#222', color: '#888', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px', minWidth: 18, textAlign: 'center' },
  sectionLabel: { padding: '5px 14px', color: '#333', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', background: '#0d0d0d', borderBottom: '1px solid #161616' },
  betRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '10px 14px', borderBottom: '1px solid #161616' },
  betLeft: { flex: 1, minWidth: 0 },
  betRight: { textAlign: 'right' as const, flexShrink: 0 },
  betFighter: { fontSize: 13, fontWeight: 600, lineHeight: 1.2 },
  betOdds: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  betStake: { color: '#fff', fontSize: 13, fontWeight: 700 },
  betPotential: { color: '#555', fontSize: 11, marginTop: 2 },
  betPnl: { fontSize: 12, fontWeight: 700, marginTop: 2 },
  editLink: { color: '#c8102e', fontSize: 11, fontWeight: 700, textDecoration: 'none', marginLeft: 4 },
  locked: { padding: '28px 14px', textAlign: 'center' },
  empty: { padding: '28px 14px', textAlign: 'center', color: '#333', fontSize: 12 },
  totalsRow: { display: 'flex', gap: 0, borderTop: '1px solid #1e1e1e', background: '#0d0d0d' },
  totalItem: { flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', padding: '8px 6px', gap: 2 },
  totalLabel: { color: '#444', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  totalVal: { color: '#fff', fontSize: 13, fontWeight: 700 },

  fightCard: { background: '#141414', border: '1px solid #1e1e1e', borderRadius: 8, padding: '8px 10px', overflow: 'hidden' },
  fightCardMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  weightLabel: { color: '#333', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 },
  resultLabel: { color: '#888', fontSize: 9, fontWeight: 700 },
  fightCardFighters: { display: 'flex', alignItems: 'center', gap: 4 },
  fighterSide: { flex: 1, display: 'flex', alignItems: 'center', gap: 5 },
  photo: { width: 26, height: 32, objectFit: 'cover' as const, objectPosition: 'top center', borderRadius: 3, background: '#111', flexShrink: 0 },
  fighterName: { fontSize: 11, fontWeight: 700, lineHeight: 1.2 },
  fighterOdds: { color: '#555', fontSize: 10 },
  vsLabel: { color: '#333', fontSize: 9, fontWeight: 700, flexShrink: 0, padding: '0 2px' },
};

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
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
  historyChipNoMatchup: { opacity: 0.4, cursor: 'default' },
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
  sectionTitle: { color: '#444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
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
