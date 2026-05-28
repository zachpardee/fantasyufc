import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import { useAuthStore } from '../store/auth.store';
import { useIsMobile } from '../hooks/useIsMobile';
import { BeltHalo, MemberSheet, hasBelt, hasBmfBelt } from '../components/MemberSheet';
import { SkeletonFightRow } from '../components/LoadingScreen';

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
  const [selectedMatchupId, setSelectedMatchupId] = useState<string | null>(null);
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

  const { data: matchup, refetch } = useQuery<any>({
    queryKey: ['matchup-detail', leagueId, selectedMatchupId],
    queryFn: async () => {
      if (selectedMatchupId) {
        return apiClient.get(`/leagues/${leagueId}/matchups/${selectedMatchupId}`);
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
  const fights: any[] = homePicks?.fights ?? [];
  const awayPickMap: Record<string, any> = {};
  for (const f of (awayPicks?.fights ?? [])) awayPickMap[f.id] = f;

  const isViewingHistory = !!selectedMatchupId && selectedMatchupId !== mostRecentMyMatchup?.id;

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.navTitle}>Matchup</span>
        {isLive && !selectedMatchupId && <span style={styles.liveBadge}>LIVE</span>}
        {isViewingHistory && (
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
            const isActive = selectedMatchupId
              ? myM?.id === selectedMatchupId
              : ev.eventId === mostRecentMyMatchup?.eventId;
            const eventShort = ev.eventName
              ?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
              .replace(/^UFC\s+/i, 'UFC ') ?? ev.eventName;
            const dateStr = ev.scheduledAt
              ? new Date(ev.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null;

            const isCurrentEvent = ev.eventId === currentUpcomingEventId;
            const isLiveEvent = ev.eventStatus === 'live';

            return (
              <button
                key={ev.eventId}
                style={{ ...styles.historyChip, ...(isActive ? styles.historyChipActive : isCurrentEvent ? styles.historyChipCurrent : {}), ...(!myM ? styles.historyChipNoMatchup : {}) }}
                onClick={() => myM && setSelectedMatchupId(myM.id === mostRecentMyMatchup?.id ? null : myM.id)}
                disabled={!myM}
              >
                {isLiveEvent
                  ? <span style={styles.chipLiveBadge}>LIVE</span>
                  : isCurrentEvent
                    ? <span style={styles.chipNextBadge}>NEXT</span>
                    : null}
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

            <div style={styles.vsBlock}>
              {matchup.winnerId ? (
                <div style={styles.resultBadge}>
                  {matchup.winnerId === matchup.homeTeamId
                    ? `${matchup.homeTeamName} wins`
                    : `${matchup.awayTeamName} wins`}
                </div>
              ) : (
                <div style={styles.vsText}>VS</div>
              )}
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
          {!isStaking && (homePicksLoading || fights.length > 0) && (
            <div style={styles.section}>
              <div style={styles.sectionHeader}>
                <span style={styles.sectionTitle}>PICKS</span>
                {homePicks?.locked && <span style={styles.lockedTag}>LOCKED</span>}
              </div>
              {homePicksLoading || awayPicksLoading ? (
                [0, 1, 2, 3, 4, 5].map((i) => <SkeletonFightRow key={i} />)
              ) : (
                <>
                  <div style={styles.picksHeaderRow}>
                    <div style={styles.pickTeamHeader}>{matchup.homeTeamName}</div>
                    <div style={styles.fightInfoHeader}>FIGHT</div>
                    <div style={{ ...styles.pickTeamHeader, textAlign: 'right' }}>{matchup.awayTeamName}</div>
                  </div>
                  {fights.map((fight) => (
                    <PickRow key={fight.id} fight={fight} homePick={fight} awayPick={awayPickMap[fight.id]} onPhotoClick={openPhoto} />
                  ))}
                </>
              )}
              {(homeChampion || awayChampion) && (
                <ChampionPickRow homeChampion={homeChampion} awayChampion={awayChampion} locked={homePicks?.locked} onPhotoClick={openPhoto} />
              )}
            </div>
          )}

          {/* Staking bets */}
          {isStaking && (
            <StakingBetsSection
              fights={homeStaking?.fights ?? awayStaking?.fights ?? []}
              homeStaking={homeStaking}
              awayStaking={awayStaking}
              homeTeamName={matchup.homeTeamName}
              awayTeamName={matchup.awayTeamName}
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

function ChampionPickRow({ homeChampion, awayChampion, locked, onPhotoClick }: {
  homeChampion: any; awayChampion: any; locked?: boolean; onPhotoClick?: PhotoClickHandler;
}) {
  const renderSide = (champ: any, align: 'left' | 'right') => {
    if (!champ) return <span style={styles.noPick}>—</span>;
    const scored = locked && champ.resultWinnerId !== null;
    const won = scored && champ.pointsEarned > 0;
    const name = `${champ.firstName} ${champ.lastName}`;
    return (
      <div style={{ display: 'flex', flexDirection: align === 'right' ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
        {champ.imageUrl && (
          <div
            style={{ width: 36, height: 40, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: '#222', opacity: scored && !won ? 0.4 : 1, cursor: 'zoom-in' }}
            onClick={() => onPhotoClick?.(champ.imageUrl, name)}
          >
            <img src={champ.imageUrl} alt={name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
          <div style={{ color: '#ddd', fontSize: 14, fontWeight: 600 }}>{champ.firstName} {champ.lastName}</div>
          {scored
            ? <div style={{ color: won ? '#4caf50' : '#444', fontSize: 12, fontWeight: 700 }}>{won ? '+30 pts' : '✗'}</div>
            : <div style={{ color: '#888', fontSize: 12 }}>Pending</div>
          }
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...styles.pickRow, background: '#0d0d00', borderTop: '2px solid #1e1e00' }}>
      <div style={styles.pickCell}>{renderSide(homeChampion, 'left')}</div>
      <div style={styles.fightInfo}>
        <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>★ EVENT CHAMPION</div>
        <div style={styles.fightWeight}>+30 pts if correct</div>
      </div>
      <div style={{ ...styles.pickCell, alignItems: 'flex-end' }}>{renderSide(awayChampion, 'right')}</div>
    </div>
  );
}

const PICK_METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB', decision: 'DEC', disqualification: 'DQ',
};

function PickBadge({ pick, fight, align }: { pick: any; fight: any; align: 'left' | 'right' }) {
  if (!pick?.pickedFighterId) return <span style={styles.noPick}>—</span>;
  const isRed = pick.pickedFighterId === fight.redFighterId;
  const lastName = isRed ? fight.redLastName : fight.blueLastName;
  const scored = pick.isCorrect !== null;
  const correct = pick.isCorrect === true;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 2 }}>
      <span style={{ color: scored ? (correct ? '#4caf50' : '#444') : '#ccc', fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>
        {lastName}
      </span>
      {pick.pickedMethod && (
        <span style={{ color: '#444', fontSize: 10 }}>{PICK_METHOD_LABEL[pick.pickedMethod] ?? pick.pickedMethod}</span>
      )}
      {scored && (
        <span style={{ color: correct ? '#4caf50' : '#333', fontSize: 12, fontWeight: 700 }}>
          {correct ? `+${(+(pick.pointsEarned ?? 0)).toFixed(0)}` : '✗'}
        </span>
      )}
    </div>
  );
}

function PickRow({ fight, homePick, awayPick, onPhotoClick }: { fight: any; homePick: any; awayPick: any; onPhotoClick?: PhotoClickHandler }) {
  const resultWinner = fight.resultWinnerId;
  const resultOutcome = fight.resultOutcome;
  const redWon = resultWinner === fight.redFighterId;
  const blueWon = resultWinner === fight.blueFighterId;
  const fmtOdds = (n: number) => n >= 0 ? `+${n}` : `${n}`;

  return (
    <div style={styles.pickRow}>
      {/* Home pick */}
      <div style={styles.pickBadgeCol}>
        <PickBadge pick={homePick} fight={fight} align="left" />
      </div>

      {/* Fight card — sheet style */}
      <div style={styles.fightCardCenter}>
        {/* Red fighter */}
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: resultWinner && !redWon ? 0.35 : 1, cursor: fight.redImageUrl ? 'zoom-in' : 'default' }}
          onClick={() => fight.redImageUrl && onPhotoClick?.(fight.redImageUrl, `${fight.redFirstName} ${fight.redLastName}`)}
        >
          {fight.redImageUrl && (
            <img src={fight.redImageUrl} alt="" style={styles.fightCardPhoto} />
          )}
          <div style={styles.fightCardFighterInfo}>
            <span style={{ ...styles.fightCardName, color: redWon ? '#fff' : '#ccc' }}>{fight.redFirstName} {fight.redLastName}</span>
            {fight.redFighterOdds != null && (
              <span style={styles.fightCardOdds}>{fmtOdds(fight.redFighterOdds)}</span>
            )}
          </div>
        </div>

        {/* VS + weight + result */}
        <div style={styles.fightCardVs}>
          <span style={styles.vsText2}>VS</span>
          <span style={styles.fightCardWeight}>{fight.weightClassName}</span>
          {resultWinner && (
            <span style={styles.fightCardResult}>{METHOD_LABELS[resultOutcome] ?? resultOutcome}</span>
          )}
        </div>

        {/* Blue fighter */}
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 10, opacity: resultWinner && !blueWon ? 0.35 : 1, cursor: fight.blueImageUrl ? 'zoom-in' : 'default' }}
          onClick={() => fight.blueImageUrl && onPhotoClick?.(fight.blueImageUrl, `${fight.blueFirstName} ${fight.blueLastName}`)}
        >
          {fight.blueImageUrl && (
            <img src={fight.blueImageUrl} alt="" style={styles.fightCardPhoto} />
          )}
          <div style={{ ...styles.fightCardFighterInfo, alignItems: 'flex-end' }}>
            <span style={{ ...styles.fightCardName, color: blueWon ? '#fff' : '#ccc' }}>{fight.blueFirstName} {fight.blueLastName}</span>
            {fight.blueFighterOdds != null && (
              <span style={styles.fightCardOdds}>{fmtOdds(fight.blueFighterOdds)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Away pick */}
      <div style={{ ...styles.pickBadgeCol, alignItems: 'flex-end' }}>
        <PickBadge pick={awayPick} fight={fight} align="right" />
      </div>
    </div>
  );
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

function OddsBadge({ odds }: { odds: number }) {
  const isUnderdog = odds > 0;
  return (
    <span style={{
      background: isUnderdog ? '#162616' : '#1a1a1a',
      color: isUnderdog ? '#5cb85c' : '#666',
      fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 3,
      border: `1px solid ${isUnderdog ? '#2a4a2a' : '#2a2a2a'}`,
      letterSpacing: 0.2, flexShrink: 0,
    }}>
      {fmtOddsAmerican(odds)}
    </span>
  );
}

function PnlBadge({ value, isPending, potentialPayout }: { value: number; isPending: boolean; potentialPayout: number }) {
  if (isPending) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
        <span style={{ color: '#333', fontSize: 10 }}>→</span>
        <span style={{ color: '#555', fontSize: 12, fontWeight: 600 }}>{fmtMoney(potentialPayout)}</span>
      </div>
    );
  }
  const isWon = value > 0;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: isWon ? '#0d2214' : '#1e0808',
      color: isWon ? '#4caf50' : '#e05555',
      fontSize: 12, fontWeight: 700,
      padding: '3px 7px', borderRadius: 4, marginTop: 2,
      border: `1px solid ${isWon ? '#1e4a28' : '#3a1414'}`,
    }}>
      {fmtStakeScore(value)}
    </div>
  );
}


function ParlayDisplay({ parlay, legs, align }: { parlay: any; legs: any[]; align: 'left' | 'right' }) {
  const isLost = parlay.status === 'lost';
  const isWon = parlay.status === 'won';
  const isPending = parlay.status === 'pending';
  const rev = align === 'right';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: rev ? 'flex-end' : 'flex-start',
      gap: 5, opacity: isLost ? 0.45 : 1,
    }}>
      {legs.map((l: any) => (
        <div key={l.fightId} style={{
          display: 'flex', alignItems: 'center', gap: 5,
          flexDirection: rev ? 'row-reverse' : 'row',
        }}>
          <span style={{ color: isWon ? '#4caf50' : '#ddd', fontSize: 12, fontWeight: 700 }}>
            {l.fighterFirstName} {l.fighterLastName}
          </span>
          <OddsBadge odds={+l.odds} />
        </div>
      ))}
      <div style={{ color: '#444', fontSize: 10, marginTop: 1 }}>
        {legs.length} legs · {(+parlay.decimalOdds).toFixed(2)}x · {fmtMoney(+parlay.stake)}
      </div>
      <PnlBadge value={+parlay.profitLoss} isPending={isPending} potentialPayout={+parlay.potentialPayout} />
    </div>
  );
}

function InlineBetDisplay({ single, align }: { single: any; align: 'left' | 'right' }) {
  const isLost = single.status === 'lost';
  const isWon = single.status === 'won';
  const isPending = single.status === 'pending';
  const rev = align === 'right';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: rev ? 'flex-end' : 'flex-start', gap: 4, opacity: isLost ? 0.4 : 1 }}>
      <span style={{ color: isWon ? '#4caf50' : '#ddd', fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>
        {single.fighterFirstName} {single.fighterLastName}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexDirection: rev ? 'row-reverse' : 'row' }}>
        <OddsBadge odds={+single.odds} />
        <span style={{ color: '#555', fontSize: 10 }}>{fmtMoney(+single.stake)}</span>
      </div>
      <PnlBadge value={+single.profitLoss} isPending={isPending} potentialPayout={+single.potentialPayout} />
    </div>
  );
}

function FightCardRow({ fight, homeSingle, awaySingle, onPhotoClick }: { fight: any; homeSingle?: any; awaySingle?: any; onPhotoClick?: PhotoClickHandler }) {
  const hasResult = !!fight.resultWinnerId;
  const redWon = hasResult && fight.resultWinnerId === fight.redFighterId;
  const blueWon = hasResult && fight.resultWinnerId === fight.blueFighterId;
  const fmtOdds = (n: number) => n >= 0 ? `+${n}` : `${n}`;

  return (
    <div style={styles.pickRow}>
      {/* Home bet column */}
      <div style={styles.pickBadgeCol}>
        {homeSingle
          ? <InlineBetDisplay single={homeSingle} align="left" />
          : <span style={{ color: '#2a2a2a', fontSize: 18 }}>—</span>}
      </div>

      {/* Fight card center — sheet style */}
      <div style={styles.fightCardCenter}>
        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, opacity: hasResult && !redWon ? 0.35 : 1, cursor: fight.redImageUrl ? 'zoom-in' : 'default' }}
          onClick={() => fight.redImageUrl && onPhotoClick?.(fight.redImageUrl, `${fight.redFirstName} ${fight.redLastName}`)}
        >
          {fight.redImageUrl && <img src={fight.redImageUrl} alt="" style={styles.fightCardPhoto} />}
          <div style={styles.fightCardFighterInfo}>
            <span style={{ ...styles.fightCardName, color: redWon ? '#fff' : '#ccc' }}>{fight.redFirstName} {fight.redLastName}</span>
            {fight.redFighterOdds != null && <span style={styles.fightCardOdds}>{fmtOdds(fight.redFighterOdds)}</span>}
          </div>
        </div>

        <div style={styles.fightCardVs}>
          <span style={styles.vsText2}>VS</span>
          <span style={styles.fightCardWeight}>{fight.weightClassName}</span>
          {hasResult && fight.resultOutcome && (
            <span style={styles.fightCardResult}>{METHOD_LABELS[fight.resultOutcome] ?? fight.resultOutcome}</span>
          )}
        </div>

        <div
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 10, opacity: hasResult && !blueWon ? 0.35 : 1, cursor: fight.blueImageUrl ? 'zoom-in' : 'default' }}
          onClick={() => fight.blueImageUrl && onPhotoClick?.(fight.blueImageUrl, `${fight.blueFirstName} ${fight.blueLastName}`)}
        >
          {fight.blueImageUrl && <img src={fight.blueImageUrl} alt="" style={styles.fightCardPhoto} />}
          <div style={{ ...styles.fightCardFighterInfo, alignItems: 'flex-end' }}>
            <span style={{ ...styles.fightCardName, color: blueWon ? '#fff' : '#ccc' }}>{fight.blueFirstName} {fight.blueLastName}</span>
            {fight.blueFighterOdds != null && <span style={styles.fightCardOdds}>{fmtOdds(fight.blueFighterOdds)}</span>}
          </div>
        </div>
      </div>

      {/* Away bet column */}
      <div style={{ ...styles.pickBadgeCol, alignItems: 'flex-end' }}>
        {awaySingle
          ? <InlineBetDisplay single={awaySingle} align="right" />
          : <span style={{ color: '#2a2a2a', fontSize: 18 }}>—</span>}
      </div>
    </div>
  );
}

function StakingFightCard({ fights, homeTeamName, awayTeamName, homeSinglesMap, awaySinglesMap, onPhotoClick }: {
  fights: any[]; homeTeamName: string; awayTeamName: string;
  homeSinglesMap: Map<string, any>; awaySinglesMap: Map<string, any>;
  onPhotoClick?: PhotoClickHandler;
}) {
  if (fights.length === 0) return null;
  return (
    <div style={sk.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: '#0d0d0d', borderBottom: '1px solid #1e1e1e' }}>
        <span style={{ flex: 1, color: '#555', fontSize: 12, fontWeight: 700 }}>{homeTeamName}</span>
        <span style={{ ...sk.cardHeaderText, width: 168, flexShrink: 0, textAlign: 'center' }}>FIGHT CARD</span>
        <span style={{ flex: 1, color: '#555', fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{awayTeamName}</span>
      </div>
      {fights.map((fight, i) => (
        <div key={fight.id} style={i < fights.length - 1 ? { borderBottom: '1px solid #161616' } : {}}>
          <FightCardRow
            fight={fight}
            homeSingle={homeSinglesMap.get(fight.id)}
            awaySingle={awaySinglesMap.get(fight.id)}
            onPhotoClick={onPhotoClick}
          />
        </div>
      ))}
    </div>
  );
}

function StakingBetsSection({ fights, homeStaking, awayStaking, homeTeamName, awayTeamName, onPhotoClick }: {
  fights: any[]; homeStaking: any; awayStaking: any;
  homeTeamName: string; awayTeamName: string;
  onPhotoClick?: PhotoClickHandler;
}) {
  const homeSinglesMap = new Map<string, any>((homeStaking?.singles ?? []).map((s: any) => [s.fightId, s]));
  const awaySinglesMap = new Map<string, any>((awayStaking?.singles ?? []).map((s: any) => [s.fightId, s]));

  const homeParlay = homeStaking?.parlay ?? null;
  const awayParlay = awayStaking?.parlay ?? null;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        <span style={styles.sectionTitle}>BETS</span>
      </div>

      <StakingFightCard
        fights={fights}
        homeTeamName={homeTeamName}
        awayTeamName={awayTeamName}
        homeSinglesMap={homeSinglesMap}
        awaySinglesMap={awaySinglesMap}
        onPhotoClick={onPhotoClick}
      />

      {(homeParlay || awayParlay) && (
        <div style={{ background: '#0d0c00', border: '1px solid #2a2200', borderRadius: 8, padding: '14px', marginTop: 8 }}>
          <div style={{ color: '#ffd700', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 12 }}>★ PARLAY</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1 }}>
              {homeParlay
                ? <ParlayDisplay parlay={homeParlay} legs={homeStaking?.parlayLegs ?? []} align="left" />
                : <span style={{ color: '#2a2a2a', fontSize: 18 }}>—</span>}
            </div>
            <div style={{ width: 1, background: '#2a2200', alignSelf: 'stretch', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              {awayParlay
                ? <ParlayDisplay parlay={awayParlay} legs={awayStaking?.parlayLegs ?? []} align="right" />
                : <span style={{ color: '#2a2a2a', fontSize: 18 }}>—</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const sk: Record<string, React.CSSProperties> = {
  card: { background: '#141414', border: '1px solid #242424', borderRadius: 12, overflow: 'hidden', marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  cardHeader: { background: '#0d0d0d', borderBottom: '1px solid #1e1e1e', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 },
  cardHeaderText: { color: '#444', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
  fightRow: { padding: '12px 14px 10px' },
  fightMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 },
  mainBadge: { background: '#c8102e22', color: '#c8102e', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3, letterSpacing: 0.5 },
  weightLabel: { color: '#333', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
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
  fightCardVs: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, flexShrink: 0, width: 56, padding: '0 4px' },
  vsText2: { color: '#2a2a2a', fontSize: 9, fontWeight: 700, letterSpacing: 1 },
  fightCardWeight: { color: '#333', fontSize: 9, textAlign: 'center' as const, lineHeight: 1.3 },
  fightCardResult: { color: '#888', fontSize: 9, fontWeight: 700, textAlign: 'center' as const, marginTop: 2 },

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
