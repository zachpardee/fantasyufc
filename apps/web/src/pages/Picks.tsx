import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';
import { StakingPicksPage } from './StakingPicks';
import { FighterPhoto } from '../components/FighterPhoto';

export function PicksPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const [localPicks, setLocalPicks] = useState<Record<string, string>>({});
  const [localMethods, setLocalMethods] = useState<Record<string, string>>({});
  const [localChampion, setLocalChampion] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const initialViewSet = useRef(false);
  const championInitialized = useRef(false);

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  const isCommissioner = session?.user.id === league?.commissionerId;

  const { data: picksData } = useQuery<any>({
    queryKey: ['picks', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
    refetchInterval: (query) => query.state.data?.eventStatus === 'live' ? 30_000 : false,
  });

  const { data: championData } = useQuery<any>({
    queryKey: ['picks-champion', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}/champion`),
    enabled: !!currentEvent?.id,
  });

  // Seed local picks from server data (only when fresh data loads, not on every keystroke)
  useEffect(() => {
    if (!picksData?.fights) return;
    setLocalPicks((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const existing: Record<string, string> = {};
      for (const f of picksData.fights) {
        if (f.pickedFighterId) existing[f.id] = f.pickedFighterId;
      }
      return existing;
    });
    setLocalMethods((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const existing: Record<string, string> = {};
      for (const f of picksData.fights) {
        if (f.pickedMethod) existing[f.id] = f.pickedMethod;
      }
      return existing;
    });
    // Default to summary view if server already has picks saved
    if (!initialViewSet.current) {
      initialViewSet.current = true;
      const hasSavedPicks = picksData.fights.some((f: any) => f.pickedFighterId);
      if (hasSavedPicks) setShowSummary(true);
    }
  }, [picksData]);

  // Reset champion state when event changes so each event starts with a clean pick
  useEffect(() => {
    setLocalChampion(null);
    championInitialized.current = false;
  }, [currentEvent?.id]);

  useEffect(() => {
    if (championInitialized.current || championData === undefined) return;
    championInitialized.current = true;
    if (championData?.fighterId) setLocalChampion(championData.fighterId);
  }, [championData]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const picks = Object.entries(localPicks)
        .filter(([fightId]) => localMethods[fightId])
        .map(([fightId, pickedFighterId]) => ({
          fightId,
          pickedFighterId,
          pickedMethod: localMethods[fightId],
        }));
      return apiClient.post(`/leagues/${leagueId}/picks/${currentEvent!.id}`, { picks });
    },
    onSuccess: () => {
      setShowSummary(true);
      qc.invalidateQueries({ queryKey: ['picks', leagueId, currentEvent?.id] });
    },
  });

  const championMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.put(`/leagues/${leagueId}/picks/${currentEvent!.id}/champion`, { fighterId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picks-champion', leagueId, currentEvent?.id] }),
  });

  if (league?.leagueFormat === 'staking') return <StakingPicksPage />;

  const fights: any[] = picksData?.fights ?? [];
  const locked: boolean = picksData?.locked ?? false;

  // Fights with no segment data default to main card
  const earlyPrelims = fights.filter((f) => f.cardSegment === 'early_prelims');
  const prelims = fights.filter((f) => f.cardSegment === 'prelims');
  const mainCard = fights.filter((f) => !earlyPrelims.includes(f) && !prelims.includes(f));

  const totalFights = fights.length;
  // A pick is complete only when both a winner and a method are selected
  const totalComplete = fights.filter((f) => localPicks[f.id] && localMethods[f.id]).length;
  const allComplete = totalComplete === totalFights && totalFights > 0;

  if (!currentEvent) {
    return (
      <div style={styles.page}>
        <nav style={styles.nav}>
          <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
          <span style={styles.title}>Event Picks</span>
        </nav>
        <div style={styles.empty}>No upcoming scoring event scheduled.</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Event Picks</span>
        {locked && <span style={styles.lockedBadge}>LOCKED</span>}
      </nav>

      <div style={styles.header}>
        <div>
          <div style={styles.eventName}>{currentEvent.name}</div>
          <div style={styles.eventMeta}>
            {new Date(currentEvent.scheduledAt ?? currentEvent.scheduled_at).toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric',
            })}
          </div>
        </div>
        <div style={styles.pickCount}>
          <span style={{ ...styles.pickCountNum, color: allComplete ? '#4caf50' : '#c8102e' }}>{totalComplete}</span>
          <span style={styles.pickCountDen}>/{totalFights}</span>
          <span style={styles.pickCountLabel}>complete</span>
        </div>
      </div>

      {locked && (
        <div style={styles.lockedBanner}>
          Picks are locked — the event is {picksData?.eventStatus}. Results will update as fights finish.
        </div>
      )}

      {showSummary || locked ? (
        <div style={styles.summaryWrap}>
          <table style={styles.summaryTable}>
            <thead>
              <tr>
                {['Fight', 'Your Pick', 'Method', ...(locked ? ['Result'] : [])].map((h) => (
                  <th key={h} style={styles.summaryTh}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fights.map((fight, i) => {
                const pickedId = localPicks[fight.id];
                const method = localMethods[fight.id];
                const pickedRed = pickedId === fight.redFighterId;
                const pickedName = pickedId
                  ? (pickedRed ? `${fight.redFirstName} ${fight.redLastName}` : `${fight.blueFirstName} ${fight.blueLastName}`)
                  : null;
                const pickedImageUrl = pickedId ? (pickedRed ? fight.redImageUrl : fight.blueImageUrl) : null;
                const isCorrect = fight.isCorrect;
                const isWrong = isCorrect === false;
                const methodLabel: Record<string, string> = { ko_tko: 'KO/TKO', submission: 'SUB', decision: 'DEC', disqualification: 'DQ' };
                return (
                  <tr key={fight.id} style={i % 2 === 0 ? styles.summaryRowEven : styles.summaryRowOdd}>
                    <td style={styles.summaryTd}>
                      {fight.isTitleFight && <span style={styles.summaryBelt}>TITLE · </span>}
                      <span style={{ color: '#c8102e' }}>{fight.redLastName}</span>
                      <span style={styles.summaryVs}> v </span>
                      <span style={{ color: '#4488cc' }}>{fight.blueLastName}</span>
                      <div style={styles.summaryFightMeta}>{fight.weightClassName}</div>
                    </td>
                    <td style={styles.summaryTd}>
                      {pickedName ? (
                        <div style={styles.summaryPickCell}>
                          {pickedImageUrl && (
                            <div style={styles.summaryImg}>
                              <img src={pickedImageUrl} alt={pickedName}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                            </div>
                          )}
                          <span style={{ color: pickedRed ? '#e05555' : '#5599dd', fontWeight: 600 }}>{pickedName}</span>
                        </div>
                      ) : <span style={{ color: '#333' }}>—</span>}
                    </td>
                    <td style={styles.summaryTd}>
                      {method ? <span style={styles.methodBadge}>{methodLabel[method] ?? method}</span> : <span style={{ color: '#333' }}>—</span>}
                    </td>
                    {locked && (
                      <td style={styles.summaryTd}>
                        {isCorrect === true && <span style={styles.correctBadge}>✓ +{(+fight.pointsEarned).toFixed(0)} pts</span>}
                        {isWrong && <span style={styles.wrongBadge}>✗ 0 pts</span>}
                        {isCorrect === null && pickedId && <span style={{ color: '#555', fontSize: 12 }}>Pending</span>}
                        {!pickedId && <span style={{ color: '#333', fontSize: 12 }}>No pick</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Champion pick summary */}
          {(championData || localChampion) && (() => {
            const champ = championData;
            const isWon = champ?.pointsEarned > 0;
            const isPending = champ && champ.resultWinnerId === null;
            const name = champ ? `${champ.firstName} ${champ.lastName}` : null;
            return (
              <div style={styles.champSummaryCard}>
                <div style={styles.champSummaryLabel}>★ Event Champion Pick</div>
                {name ? (
                  <div style={styles.champSummaryRow}>
                    {champ.imageUrl && (
                      <div style={styles.champSummaryImg}>
                        <img src={champ.imageUrl} alt={name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
                      </div>
                    )}
                    <span style={styles.champSummaryName}>{name}</span>
                    {locked && (
                      isWon
                        ? <span style={styles.champCorrectBadge}>✓ +30 pts</span>
                        : isPending
                          ? <span style={styles.champPendingBadge}>Pending</span>
                          : <span style={styles.champWrongBadge}>✗ 0 pts</span>
                    )}
                  </div>
                ) : (
                  <div style={{ color: '#555', fontSize: 14 }}>No pick yet</div>
                )}
              </div>
            );
          })()}

          <div style={styles.summaryFooter}>
            {!locked && (
              <button style={styles.editPicksFooterBtn} onClick={() => setShowSummary(false)}>Edit Picks</button>
            )}
            {(isCommissioner || locked) && (
              <Link to={`/league/${leagueId}/picks/comparison`} style={styles.compareLink}>Compare All Picks →</Link>
            )}
          </div>
        </div>
      ) : (
        <>
          {[
            { label: 'Main Card', fights: mainCard },
            { label: 'Prelims', fights: prelims },
            { label: 'Early Prelims', fights: earlyPrelims },
          ].filter((g) => g.fights.length > 0).map((group) => (
            <div key={group.label} style={styles.section}>
              <div style={styles.sectionLabel}>{group.label}</div>
              {group.fights.map((fight) => (
                <FightPickRow
                  key={fight.id}
                  fight={fight}
                  picked={localPicks[fight.id]}
                  pickedMethod={localMethods[fight.id]}
                  locked={locked}
                  onChange={(fighterId) => {
                    if (locked) return;
                    setLocalPicks((p) => ({ ...p, [fight.id]: fighterId }));
                  }}
                  onMethodChange={(method) => {
                    if (locked) return;
                    setLocalMethods((p) => ({ ...p, [fight.id]: method }));
                  }}
                />
              ))}
            </div>
          ))}

          {/* Event champion picker */}
          {fights.length > 0 && (
            <div style={styles.champSection}>
              <div style={styles.champSectionHeader}>
                <span style={styles.champSectionTitle}>★ Event Champion</span>
                <span style={styles.champSectionSub}>Pick one fighter from the card — +30 pts if they win</span>
              </div>
              <div style={styles.champGrid}>
                {fights.flatMap((fight) => [
                  { id: fight.redFighterId, firstName: fight.redFirstName, lastName: fight.redLastName, imageUrl: fight.redImageUrl, corner: 'red' as const },
                  { id: fight.blueFighterId, firstName: fight.blueFirstName, lastName: fight.blueLastName, imageUrl: fight.blueImageUrl, corner: 'blue' as const },
                ]).map((fighter) => {
                  const isSelected = localChampion === fighter.id;
                  return (
                    <button
                      key={fighter.id}
                      style={{
                        ...styles.champFighterBtn,
                        ...(isSelected ? styles.champFighterBtnSelected : {}),
                      }}
                      onClick={() => {
                        if (locked) return;
                        const newId = isSelected ? null : fighter.id;
                        setLocalChampion(newId);
                        if (newId) championMutation.mutate(newId);
                      }}
                      disabled={locked}
                    >
                      <FighterPhoto
                        imageUrl={fighter.imageUrl}
                        name={`${fighter.firstName} ${fighter.lastName}`}
                        style={styles.champFighterImg}
                      />
                      <span style={{ ...styles.champFighterName, color: fighter.corner === 'red' ? '#e05555' : '#5599dd' }}>
                        {fighter.firstName} {fighter.lastName}
                      </span>
                      {isSelected && <span style={styles.champSelectedTag}>★ CHAMPION</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={styles.footer}>
            {saveMutation.isError && (
              <span style={styles.footerError}>Failed to save — please try again</span>
            )}
            <button
              style={{ ...styles.saveBtn, ...(saveMutation.isPending ? styles.saveBtnDisabled : {}) }}
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : `Save Picks (${totalComplete}/${totalFights})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const METHODS = [
  { value: 'ko_tko', label: 'KO/TKO' },
  { value: 'submission', label: 'SUB' },
  { value: 'decision', label: 'DEC' },
  { value: 'disqualification', label: 'DQ' },
] as const;

function FightPickRow({ fight, picked, pickedMethod, locked, onChange, onMethodChange }: {
  fight: any;
  picked?: string;
  pickedMethod?: string;
  locked: boolean;
  onChange: (fighterId: string) => void;
  onMethodChange: (method: string) => void;
}) {
  const isCompleted = fight.status === 'completed' || fight.resultWinnerId != null;
  const winnerId = fight.resultWinnerId;

  return (
    <div style={styles.fightCard}>
      {fight.isTitleFight && <div style={styles.titleBelt}>TITLE FIGHT</div>}
      <div style={styles.fightMeta}>{fight.weightClassName} · {fight.scheduledRounds}R</div>

      <div style={styles.matchup}>
        <FighterPick
          firstName={fight.redFirstName}
          lastName={fight.redLastName}
          imageUrl={fight.redImageUrl}
          ranking={fight.redRanking}
          isChampion={fight.redIsChampion}
          corner="red"
          odds={fight.redFighterOdds}
          isPicked={picked === fight.redFighterId}
          isWinner={isCompleted && winnerId === fight.redFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.redFighterId}
          locked={locked}
          onPick={() => onChange(fight.redFighterId)}
          pointsEarned={picked === fight.redFighterId ? fight.pointsEarned : null}
          isCorrect={picked === fight.redFighterId ? fight.isCorrect : null}
        />

        <div style={styles.vs}>VS</div>

        <FighterPick
          firstName={fight.blueFirstName}
          lastName={fight.blueLastName}
          imageUrl={fight.blueImageUrl}
          ranking={fight.blueRanking}
          isChampion={fight.blueIsChampion}
          corner="blue"
          odds={fight.blueFighterOdds}
          isPicked={picked === fight.blueFighterId}
          isWinner={isCompleted && winnerId === fight.blueFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.blueFighterId}
          locked={locked}
          onPick={() => onChange(fight.blueFighterId)}
          pointsEarned={picked === fight.blueFighterId ? fight.pointsEarned : null}
          isCorrect={picked === fight.blueFighterId ? fight.isCorrect : null}
        />
      </div>

      {/* Method selector — shown when a winner is picked and event isn't completed */}
      {picked && (
        <div style={styles.methodRow}>
          <span style={{ ...styles.methodLabel, color: !pickedMethod && !isCompleted ? '#c8102e' : '#555' }}>
            {isCompleted ? 'Method:' : pickedMethod ? 'Method:' : 'Method (required):'}
          </span>
          <div style={styles.methodBtns}>
            {METHODS.map((m) => {
              const isSelected = pickedMethod === m.value;
              const isResultMatch = fight.resultOutcome && (
                m.value === 'ko_tko' ? fight.resultOutcome === 'ko_tko' :
                m.value === 'submission' ? fight.resultOutcome === 'submission' :
                m.value === 'decision' ? ['decision_unanimous','decision_split','decision_majority'].includes(fight.resultOutcome) :
                fight.resultOutcome === 'disqualification'
              );
              return (
                <button
                  key={m.value}
                  style={{
                    ...styles.methodBtn,
                    ...(isSelected ? styles.methodBtnSelected : {}),
                    ...(isCompleted && isResultMatch ? styles.methodBtnCorrect : {}),
                    ...(isCompleted && isSelected && !isResultMatch ? styles.methodBtnWrong : {}),
                  }}
                  onClick={() => !locked && onMethodChange(isSelected ? '' : m.value)}
                  disabled={locked}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {fight.resultOutcome && (
        <div style={styles.resultOutcome}>
          {formatOutcome(fight.resultOutcome)} · R{fight.resultEndingRound ?? '?'}
        </div>
      )}
    </div>
  );
}

function FighterPick({ firstName, lastName, imageUrl, ranking, isChampion, corner, odds, isPicked, isWinner, isLoser, locked, onPick, pointsEarned, isCorrect }: {
  fighterId?: string; firstName: string; lastName: string; imageUrl?: string;
  ranking?: number; isChampion?: boolean; corner: 'red' | 'blue';
  odds?: number | null;
  isPicked: boolean; isWinner: boolean; isLoser: boolean;
  locked: boolean; onPick: () => void;
  pointsEarned?: number | null; isCorrect?: boolean | null;
}) {
  const borderColor = isPicked
    ? isCorrect === true ? '#4caf50' : isCorrect === false ? '#ff5252' : (corner === 'red' ? '#c8102e' : '#1565c0')
    : isWinner ? '#4caf50'
    : '#2a2a2a';

  const isUnderdog = odds != null && odds >= 350;
  const oddsLabel = odds != null ? (odds > 0 ? `+${odds}` : `${odds}`) : null;

  return (
    <button
      style={{
        ...styles.fighter,
        border: `2px solid ${borderColor}`,
        opacity: isLoser ? 0.4 : 1,
        cursor: locked ? 'default' : 'pointer',
        background: isPicked ? '#1a1a2e' : '#141414',
      }}
      onClick={onPick}
      disabled={locked}
    >
      {imageUrl && (
        <div style={{ width: 64, height: 72, margin: '0 auto 6px', overflow: 'hidden', borderRadius: 6, background: '#222' }}>
          <img src={imageUrl} alt={`${firstName} ${lastName}`}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }} />
        </div>
      )}
      <div style={styles.fighterName}>{firstName} {lastName}</div>
      <div style={styles.fighterRank}>
        {isChampion ? <span style={styles.champBadge}>C</span>
          : ranking ? <span>#{ranking}</span>
          : <span style={{ color: '#444' }}>NR</span>}
      </div>
      {oddsLabel && (
        <div style={isUnderdog ? styles.underdogOdds : styles.oddsLabel}>
          {oddsLabel}{isUnderdog && ' 🐶'}
        </div>
      )}
      {isPicked && isCorrect === true && (
        <div style={styles.pickResult}>✓ +{(+pointsEarned!).toFixed(0)} pts</div>
      )}
      {isPicked && isCorrect === false && (
        <div style={{ ...styles.pickResult, color: '#ff5252' }}>✗ 0 pts</div>
      )}
      {isPicked && isCorrect === null && !locked && (
        <div style={styles.pickedTag}>YOUR PICK</div>
      )}
    </button>
  );
}

function formatOutcome(outcome: string) {
  const map: Record<string, string> = {
    ko_tko: 'KO/TKO', submission: 'SUB',
    decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
    decision_majority: 'DEC (M)', draw: 'DRAW',
    no_contest: 'NC', disqualification: 'DQ',
  };
  return map[outcome] ?? outcome;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  lockedBadge: { background: '#444', color: '#888', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  header: { background: '#111', borderBottom: '1px solid #1a1a1a', padding: '20px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  eventName: { color: '#fff', fontSize: 18, fontWeight: 700 },
  eventMeta: { color: '#666', fontSize: 14, marginTop: 4 },
  pickCount: { display: 'flex', alignItems: 'baseline', gap: 2 },
  pickCountNum: { color: '#c8102e', fontSize: 28, fontWeight: 700 },
  pickCountDen: { color: '#444', fontSize: 18, fontWeight: 700 },
  pickCountLabel: { color: '#555', fontSize: 12, marginLeft: 4 },
  lockedBanner: { background: '#1a1400', borderBottom: '1px solid #333', padding: '10px 24px', color: '#888', fontSize: 14 },
  section: { padding: '0 24px 16px' },
  sectionLabel: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, padding: '20px 0 10px' },
  fightCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '16px 20px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  titleBelt: { color: '#ffd700', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 },
  fightMeta: { color: '#555', fontSize: 12, marginBottom: 12 },
  matchup: { display: 'flex', alignItems: 'stretch', gap: 12 },
  vs: { color: '#333', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', flexShrink: 0 },
  fighter: {
    flex: 1, borderRadius: 8, padding: '12px 16px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    textAlign: 'center',
  },
  fighterName: { color: '#ddd', fontSize: 14, fontWeight: 700 },
  fighterRank: { color: '#888', fontSize: 12 },
  champBadge: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 3 },
  pickedTag: { color: '#c8102e', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 },
  pickResult: { color: '#4caf50', fontSize: 12, fontWeight: 700 },
  oddsLabel: { color: '#555', fontSize: 12 },
  underdogOdds: { color: '#ffd700', fontSize: 12, fontWeight: 700 },
  methodRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' },
  methodLabel: { color: '#555', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' },
  methodBtns: { display: 'flex', gap: 6 },
  methodBtn: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 5, color: '#666', padding: '4px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
  methodBtnSelected: { border: '1px solid #c8102e', color: '#c8102e', background: '#1a0a0a' },
  methodBtnCorrect: { border: '1px solid #4caf50', color: '#4caf50', background: '#0a1a0a' },
  methodBtnWrong: { border: '1px solid #333', color: '#444' },
  resultOutcome: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 10 },
  footer: { position: 'sticky', bottom: 0, background: '#0a0a0a', borderTop: '1px solid #1a1a1a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 },
  footerHint: { color: '#666', fontSize: 14, flex: 1 },
  footerError: { color: '#ff6b6b', fontSize: 14, flex: 1, fontWeight: 600 },
  savedMsg: { color: '#4caf50', fontSize: 14, fontWeight: 600 },
  editPicksBtn: { background: 'transparent', border: '1px solid #444', borderRadius: 6, color: '#aaa', fontSize: 14, fontWeight: 600, padding: '6px 14px', cursor: 'pointer' },
  summaryWrap: { padding: '24px' },
  summaryTable: { width: '100%', borderCollapse: 'collapse', marginBottom: 24 },
  summaryTh: { color: '#444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, padding: '8px 14px', textAlign: 'left', borderBottom: '1px solid #1e1e1e' },
  summaryTd: { padding: '14px', fontSize: 14, color: '#ccc', verticalAlign: 'middle' },
  summaryRowEven: { background: '#0f0f0f' },
  summaryRowOdd: { background: '#0a0a0a' },
  summaryPickCell: { display: 'flex', alignItems: 'center', gap: 10 },
  summaryImg: { width: 36, height: 42, borderRadius: 4, overflow: 'hidden', background: '#222', flexShrink: 0 },
  summaryBelt: { color: '#ffd700', fontSize: 10, fontWeight: 700 },
  summaryVs: { color: '#333' },
  summaryFightMeta: { color: '#444', fontSize: 12, marginTop: 2 },
  methodBadge: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 4, color: '#888', fontSize: 12, fontWeight: 700, padding: '2px 8px' },
  correctBadge: { color: '#4caf50', fontWeight: 700, fontSize: 14 },
  wrongBadge: { color: '#ff5252', fontWeight: 700, fontSize: 14 },
  summaryFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8 },
  editPicksFooterBtn: { background: 'transparent', border: '1px solid #333', borderRadius: 6, color: '#888', fontSize: 14, fontWeight: 600, padding: '8px 18px', cursor: 'pointer' },
  compareLink: { color: '#c8102e', textDecoration: 'none', fontSize: 14, fontWeight: 700 },
  saveBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  saveBtnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  empty: { color: '#555', textAlign: 'center', padding: 60, fontSize: 14 },
  champSection: { padding: '0 24px 16px' },
  champSectionHeader: { display: 'flex', flexDirection: 'column' as const, gap: 4, padding: '20px 0 12px' },
  champSectionTitle: { color: '#ffd700', fontSize: 14, fontWeight: 700, letterSpacing: 0.5 },
  champSectionSub: { color: '#555', fontSize: 12 },
  champGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 },
  champFighterBtn: {
    background: '#141414', border: '1px solid #242424', borderRadius: 8, padding: '10px 8px',
    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 4,
    cursor: 'pointer', transition: 'border-color 0.1s',
  },
  champFighterBtnSelected: { border: '1px solid #ffd700', background: '#1a1600' },
  champFighterImg: { width: 48, height: 54, borderRadius: 5, overflow: 'hidden', background: '#222' },
  champFighterName: { fontSize: 12, fontWeight: 700, textAlign: 'center' as const, lineHeight: 1.2 },
  champSelectedTag: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.5 },
  champSummaryCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '14px 16px', marginBottom: 16 },
  champSummaryLabel: { color: '#ffd700', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 },
  champSummaryRow: { display: 'flex', alignItems: 'center', gap: 10 },
  champSummaryImg: { width: 36, height: 42, borderRadius: 4, overflow: 'hidden', background: '#222', flexShrink: 0 },
  champSummaryName: { color: '#ddd', fontSize: 14, fontWeight: 700, flex: 1 },
  champCorrectBadge: { color: '#4caf50', fontWeight: 700, fontSize: 14 },
  champWrongBadge: { color: '#ff5252', fontWeight: 700, fontSize: 14 },
  champPendingBadge: { color: '#888', fontSize: 12 },
};
