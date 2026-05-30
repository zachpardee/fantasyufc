import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

function toDecimalOdds(american: number): number {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function calcPayout(stake: number, decimalOdds: number): number {
  return Math.round(stake * decimalOdds * 100) / 100;
}

function fmtOdds(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '$') + formatted;
}

type SingleBet = { clientId: string; fightId: string; fighterId: string; stake: string };
type ParlayLegs = Record<string, string>; // fightId → fighterId

export function StakingPicksPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();

  const [singles, setSingles] = useState<SingleBet[]>([]);
  const [parlayLegs, setParlayLegs] = useState<ParlayLegs>({});
  const [parlayStake, setParlayStake] = useState('');
  const [singlesTouched, setSinglesTouched] = useState(false);
  const [parlayTouched, setParlayTouched] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showSlip, setShowSlip] = useState(false);
  const initialized = useRef(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const currentChipRef = useRef<HTMLDivElement>(null);

  const { data: currentEvent } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  const { data: picksData } = useQuery<any>({
    queryKey: ['picks', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
  });

  const { data: betsData, refetch: refetchBets } = useQuery<any>({
    queryKey: ['staking-bets', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
  });

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: allSeasonEvents = [] } = useQuery<any[]>({
    queryKey: ['season-events', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups/season-events`),
  });

  const { data: allMatchups = [] } = useQuery<any[]>({
    queryKey: ['matchups-all', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/matchups`),
  });

  const { data: members = [] } = useQuery<any[]>({
    queryKey: ['league-members', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/members`),
  });

  const myMember = members.find((m: any) => m.userId === session?.user.id);
  const myMatchupByEvent = new Map<string, any>();
  for (const m of allMatchups) {
    if (m.homeTeamId === myMember?.id || m.awayTeamId === myMember?.id) {
      myMatchupByEvent.set(m.eventId, m);
    }
  }

  // Slip is for new bets only — never pre-populate from existing DB bets.
  // Saved bets are shown in the SavedBetsPanel, not the slip.
  useEffect(() => {
    if (!betsData || initialized.current) return;
    initialized.current = true;
  }, [betsData]);

  useEffect(() => {
    initialized.current = false;
    setSingles([]);
    setParlayLegs({});
    setParlayStake('');
    setSinglesTouched(false);
    setParlayTouched(false);
    setSaveError('');
  }, [currentEvent?.id]);

  useEffect(() => {
    if (!currentEvent?.id || !stripRef.current || !currentChipRef.current) return;
    const strip = stripRef.current;
    const chip = currentChipRef.current;
    strip.scrollLeft = chip.offsetLeft - strip.offsetWidth / 2 + chip.offsetWidth / 2;
  }, [currentEvent?.id]);

  function addSingle(fightId: string, fighterId: string) {
    setSingles((prev) => [...prev, { clientId: `${fightId}-${Date.now()}`, fightId, fighterId, stake: '' }]);
    setSinglesTouched(true);
  }
  function updateSingle(clientId: string, updates: Partial<SingleBet>) {
    setSingles((prev) => prev.map((b) => b.clientId === clientId ? { ...b, ...updates } : b));
    setSinglesTouched(true);
  }
  function removeSingle(clientId: string) {
    setSingles((prev) => prev.filter((b) => b.clientId !== clientId));
    setSinglesTouched(true);
  }

  // Sync parlay legs with current unique fight selections
  function autoPopulateParlay(currentSingles: SingleBet[]) {
    const uniqueFightIds = [...new Set(currentSingles.filter(b => b.fighterId).map(b => b.fightId))];
    setParlayLegs(prev => {
      const newLegs: ParlayLegs = {};
      for (const fightId of uniqueFightIds) {
        if (prev[fightId]) {
          newLegs[fightId] = prev[fightId];
        } else {
          const bet = currentSingles.find(b => b.fightId === fightId && b.fighterId);
          if (bet) newLegs[fightId] = bet.fighterId;
        }
      }
      return newLegs;
    });
  }

  function removeParlayLeg(fightId: string) {
    setParlayLegs(prev => { const next = { ...prev }; delete next[fightId]; return next; });
    setParlayTouched(true);
  }

  function clearSlip() {
    setSingles([]);
    setParlayLegs({});
    setParlayStake('');
    setSinglesTouched(false);
    setParlayTouched(false);
    setSaveError('');
  }

  const saveSinglesMutation = useMutation({
    mutationFn: () => {
      const bets = singles
        .map((b) => ({ fightId: b.fightId, fighterId: b.fighterId, stake: parseFloat(b.stake) }))
        .filter((b) => b.fighterId && !isNaN(b.stake) && b.stake > 0);
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent!.id}/singles`, { bets });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save bets'),
  });

  const saveParlayMutation = useMutation({
    mutationFn: () => {
      const legs = Object.entries(parlayLegs)
        .filter(([, fighterId]) => !!fighterId)
        .map(([fightId, fighterId]) => ({ fightId, fighterId }));
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent!.id}/parlay`, { stake: parseFloat(parlayStake), legs });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save parlay'),
  });

  const removeParlayMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent!.id}/parlay`),
    onSuccess: () => { setParlayLegs({}); setParlayStake(''); setParlayTouched(false); refetchBets(); },
  });

  const deleteSavedSingleMutation = useMutation({
    mutationFn: (betId: string) => apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent!.id}/singles/${betId}`),
    onSuccess: () => refetchBets(),
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to delete bet'),
  });

  const deleteSavedParlayMutation = useMutation({
    mutationFn: (parlayId: string) => apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent!.id}/parlays/${parlayId}`),
    onSuccess: () => refetchBets(),
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to delete parlay'),
  });

  async function saveAll() {
    setSaveError('');
    const parlayLegSnapshot = parlayLegs;
    const parlayStakeSnapshot = parlayStake;
    const parlayTouchedSnapshot = parlayTouched;
    try {
      if (singlesTouched) await saveSinglesMutation.mutateAsync();
      const validLegCount = Object.values(parlayLegSnapshot).filter(Boolean).length;
      if (parlayTouchedSnapshot && validLegCount >= 2 && parlayStakeSnapshot) {
        await saveParlayMutation.mutateAsync();
      }
      // Clear the slip after all saves succeed
      clearSlip();
      refetchBets();
      qc.invalidateQueries({ queryKey: ['staking-bets', leagueId, currentEvent?.id] });
    } catch { /* errors handled in onError */ }
  }

  const mainCard: any[] = betsData?.fights ?? [];
  const serverLocked: boolean = picksData?.locked ?? false;
  const [timeLocked, setTimeLocked] = useState(() => {
    const startTime = currentEvent?.prelimsAt ?? currentEvent?.scheduledAt;
    return !!startTime && Date.now() >= new Date(startTime).getTime() - 10 * 60 * 1000;
  });
  useEffect(() => {
    const startTime = currentEvent?.prelimsAt ?? currentEvent?.scheduledAt;
    if (!startTime) return;
    const lockAt = new Date(startTime).getTime() - 10 * 60 * 1000;
    const remaining = lockAt - Date.now();
    if (remaining <= 0) { setTimeLocked(true); return; }
    const t = setTimeout(() => setTimeLocked(true), remaining);
    return () => clearTimeout(t);
  }, [currentEvent?.prelimsAt, currentEvent?.scheduledAt]);
  const locked = serverLocked || timeLocked;
  const weeklyBudget: number = betsData?.weeklyBudget ?? 100;
  const seasonBankroll: number = betsData?.seasonBankroll ?? 0;

  const serverUsedThisWeek: number = betsData?.usedThisWeek ?? 0;
  const localSinglesTotal = singles.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
  const localParlayTotal = parseFloat(parlayStake) || 0;
  const liveUsed = serverUsedThisWeek + localSinglesTotal + localParlayTotal;
  const liveAvailable = weeklyBudget - liveUsed;

  const parlayDecOdds = Object.entries(parlayLegs)
    .filter(([, fighterId]) => !!fighterId)
    .reduce((prod, [fightId, fighterId]) => {
      const fight = mainCard.find((f) => f.id === fightId);
      if (!fight) return prod;
      const odds = fight.redFighterId === fighterId ? fight.redFighterOdds : fight.blueFighterOdds;
      return odds != null ? prod * toDecimalOdds(odds) : prod;
    }, 1);
  const parlayLegCount = Object.values(parlayLegs).filter(Boolean).length;
  const parlayPotential = localParlayTotal > 0 && parlayLegCount >= 2 ? calcPayout(localParlayTotal, parlayDecOdds) : 0;
  const parlayAmericanOdds = parlayDecOdds <= 1 ? null : parlayDecOdds >= 2 ? Math.round((parlayDecOdds - 1) * 100) : Math.round(-100 / (parlayDecOdds - 1));

  const singlesPotential = singles.reduce((sum, b) => {
    const fight = mainCard.find((f) => f.id === b.fightId);
    if (!fight || !b.fighterId || !b.stake) return sum;
    const odds = fight.redFighterId === b.fighterId ? fight.redFighterOdds : fight.blueFighterOdds;
    if (odds == null) return sum;
    const stake = parseFloat(b.stake);
    if (isNaN(stake) || stake <= 0) return sum;
    return sum + calcPayout(stake, toDecimalOdds(odds));
  }, 0);

  const activeSinglesCount = singles.filter((b) => b.fighterId && parseFloat(b.stake) > 0).length;
  const slipCount = activeSinglesCount + (parlayLegCount >= 2 && localParlayTotal > 0 ? 1 : 0);
  const anyUnsaved = singlesTouched || parlayTouched;
  const isSaving = saveSinglesMutation.isPending || saveParlayMutation.isPending;
  const settledSingles = (betsData?.singles ?? []).filter((s: any) => s.status !== 'pending');
  const settledParlay = betsData?.parlay && betsData.parlay.status !== 'pending' ? betsData.parlay : null;
  const hasResults = settledSingles.length > 0 || !!settledParlay;

  if (!currentEvent) {
    return (
      <div style={s.page}>
        <nav style={s.nav}>
          <Link to={`/league/${leagueId}`} style={s.back}>← League</Link>
          <span style={s.navTitle}>Bets</span>
        </nav>
        <div style={s.empty}>No upcoming event to bet on.</div>
      </div>
    );
  }

  const slipProps = {
    mainCard, singles, parlayLegs, parlayStake, parlayLegCount,
    parlayAmericanOdds, parlayPotential, singlesPotential, liveUsed, liveAvailable,
    anyUnsaved, isSaving, locked, hasResults, settledSingles, settledParlay, betsData,
    onSaveAll: saveAll,
    onClearAll: clearSlip,
    onStakeChange: (clientId: string, value: string) => updateSingle(clientId, { stake: value }),
    onRemoveSingle: removeSingle,
    onParlayLegChange: (fightId: string, fighterId: string) => { setParlayLegs(p => ({ ...p, [fightId]: fighterId })); setParlayTouched(true); },
    onParlayStakeChange: (v: string) => { setParlayStake(v); setParlayTouched(true); },
    onRemoveParlayLeg: removeParlayLeg,
    onRemoveParlay: () => removeParlayMutation.mutate(),
    onAutoPopulateParlay: autoPopulateParlay,
  };

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link to={`/league/${leagueId}`} style={s.back}>← League</Link>
        <span style={s.navTitle}>Bets</span>
        {locked && <span style={s.lockedBadge}>LOCKED</span>}
      </nav>

      {allSeasonEvents.length > 0 && (
        <div ref={stripRef} style={s.historyStrip}>
          {allSeasonEvents.map((ev) => {
            const myM = myMatchupByEvent.get(ev.eventId);
            const isMeHome = myM?.homeTeamId === myMember?.id;
            const myScore = myM ? +(isMeHome ? myM.homeScore : myM.awayScore) : null;
            const oppScore = myM ? +(isMeHome ? myM.awayScore : myM.homeScore) : null;
            const oppName = myM ? (isMeHome ? myM.awayTeamName : myM.homeTeamName) : null;
            const isWin = myM?.winnerId && myM.winnerId === myMember?.id;
            const isLoss = myM?.winnerId && myM.winnerId !== myMember?.id;
            const hasScore = myM && (myM.eventStatus === 'completed' || myM.winnerId || (myScore ?? 0) > 0);
            const isCurrentEvent = ev.eventId === currentEvent?.id;
            const isLiveEvent = ev.eventStatus === 'live';
            const isSemis = ev.eventId === league?.playoffSemisEventId;
            const isFinals = ev.eventId === league?.playoffFinalsEventId;
            const eventShort = ev.eventName
              ?.replace(/^UFC\s+Fight\s+Night:\s*/i, 'FN: ')
              .replace(/^UFC\s+/i, 'UFC ') ?? ev.eventName;
            const dateStr = ev.scheduledAt
              ? new Date(ev.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : null;

            function fmtChipScore(n: number): string {
              const abs = Math.abs(n);
              const str = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
              return n < 0 ? `(${str})` : str;
            }

            return (
              <div key={ev.eventId} ref={isCurrentEvent ? currentChipRef : undefined} style={{ ...s.historyChip, ...(isCurrentEvent ? s.historyChipCurrent : {}), ...(isLiveEvent ? s.historyChipLive : {}), ...(!myM ? s.historyChipNoMatchup : {}) }}>
                {isLiveEvent
                  ? <span style={s.chipLiveBadge}>LIVE</span>
                  : isCurrentEvent
                    ? <span style={s.chipNextBadge}>NEXT</span>
                    : null}
                {isFinals && <span style={s.chipFinalsBadge}>FINALS</span>}
                {isSemis && <span style={s.chipSemisBadge}>SEMIS</span>}
                <span style={s.chipEvent}>{eventShort}</span>
                {dateStr && <span style={s.chipDate}>{dateStr}</span>}
                {myM ? (
                  hasScore ? (
                    <>
                      <span style={s.chipOpp}>vs {oppName}</span>
                      <span style={s.chipScore}>{fmtChipScore(myScore!)}–{fmtChipScore(oppScore!)}</span>
                      <span style={{ ...s.chipResult, color: isWin ? '#4caf50' : isLoss ? '#ff5252' : '#ffd700' }}>
                        {isWin ? 'W' : isLoss ? 'L' : 'T'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={s.chipOpp}>vs {oppName}</span>
                      <span style={s.chipPending}>Upcoming</span>
                    </>
                  )
                ) : (
                  <span style={s.chipPending}>No matchup</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={s.eventHeader}>
        <div style={s.eventName}>{currentEvent.name}</div>
        {(currentEvent.prelimsAt ?? currentEvent.scheduledAt) && (
          <div style={s.eventDate}>
            {(() => {
              const d = new Date(currentEvent.prelimsAt ?? currentEvent.scheduledAt);
              return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
            })()}
          </div>
        )}
      </div>

      <div style={s.balanceBar}>
        <div style={s.balanceStat}>
          <span style={s.balanceVal}>{fmtMoney(weeklyBudget)}</span>
          <span style={s.balanceLabel}>Weekly Budget</span>
        </div>
        <div style={s.balanceDivider} />
        <div style={s.balanceStat}>
          <span style={{ ...s.balanceVal, color: liveUsed > 0 ? '#ffd700' : '#555' }}>{fmtMoney(liveUsed)}</span>
          <span style={s.balanceLabel}>At Stake</span>
        </div>
        <div style={s.balanceDivider} />
        <div style={s.balanceStat}>
          <span style={{ ...s.balanceVal, color: liveAvailable < 0 ? '#ff5252' : '#4caf50' }}>{fmtMoney(Math.max(0, liveAvailable))}</span>
          <span style={s.balanceLabel}>Available</span>
        </div>
        <div style={s.balanceDivider} />
        <div style={s.balanceStat}>
          <span style={{ ...s.balanceVal, color: seasonBankroll >= 0 ? '#4caf50' : '#ff5252' }}>
            {seasonBankroll >= 0 ? '+' : ''}{fmtMoney(seasonBankroll)}
          </span>
          <span style={s.balanceLabel}>Season P&L</span>
        </div>
      </div>

      {saveError && <div style={s.errorBanner}>{saveError}</div>}

      <div style={s.body}>
        {/* ── Col 1: Fight cards ────────────────────────────── */}
        <div style={s.col}>
          <div style={{ paddingTop: 24 }}>
          <div style={{ ...s.section, marginTop: 0 }}>
            <div style={s.sectionHeader}>
              <span style={s.sectionTitle}>FIGHTS</span>
              <span style={s.sectionSub}>Click a fighter to add a bet</span>
            </div>

            {mainCard.map((fight) => {
              const fightBets = singles.filter((b) => b.fightId === fight.id);
              const redBetCount = fightBets.filter((b) => b.fighterId === fight.redFighterId).length;
              const blueBetCount = fightBets.filter((b) => b.fighterId === fight.blueFighterId).length;

              return (
                <div key={fight.id} style={s.fightCard}>
                  <div style={s.fightCardHeader}>
                    <span style={s.weightClass}>{fight.weightClassName}</span>
                    {fight.isMainEvent && <span style={s.mainEventBadge}>MAIN EVENT</span>}
                  </div>

                  <div style={s.fighterRow}>
                    <button
                      disabled={locked}
                      style={s.fighterBtn}
                      onClick={() => !locked && addSingle(fight.id, fight.redFighterId)}
                    >
                      {fight.redImageUrl && <img src={fight.redImageUrl} alt="" style={s.fighterImg} />}
                      <div style={s.fighterInfo}>
                        <span style={s.fighterName}>{fight.redFirstName} {fight.redLastName}</span>
                        {fight.redFighterOdds != null && (
                          <span style={{ ...s.oddsTag, color: fight.redFighterOdds < 0 ? '#aaa' : '#4caf50' }}>
                            {fmtOdds(fight.redFighterOdds)}
                          </span>
                        )}
                        {redBetCount > 0 && <span style={s.betCountPill}>{redBetCount} bet{redBetCount !== 1 ? 's' : ''}</span>}
                      </div>
                    </button>

                    <div style={s.vsBlock}><span style={s.vsLabel}>VS</span></div>

                    <button
                      disabled={locked}
                      style={{ ...s.fighterBtn, ...s.fighterBtnRight }}
                      onClick={() => !locked && addSingle(fight.id, fight.blueFighterId)}
                    >
                      <div style={{ ...s.fighterInfo, alignItems: 'flex-end' }}>
                        <span style={s.fighterName}>{fight.blueFirstName} {fight.blueLastName}</span>
                        {fight.blueFighterOdds != null && (
                          <span style={{ ...s.oddsTag, color: fight.blueFighterOdds < 0 ? '#aaa' : '#4caf50' }}>
                            {fmtOdds(fight.blueFighterOdds)}
                          </span>
                        )}
                        {blueBetCount > 0 && <span style={s.betCountPill}>{blueBetCount} bet{blueBetCount !== 1 ? 's' : ''}</span>}
                      </div>
                      {fight.blueImageUrl && <img src={fight.blueImageUrl} alt="" style={s.fighterImg} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* ── Col 2: Bet Slip ───────────────────────────────── */}
        <div style={s.col}>
          <div style={s.stickyCol}>
            <BetSlip {...slipProps} />
          </div>
        </div>

        {/* ── Col 3: Saved Bets ─────────────────────────────── */}
        <div style={s.col}>
          <div style={s.stickyCol}>
            <SavedBetsPanel
              betsData={betsData}
              locked={locked}
              onDeleteSingle={(id) => deleteSavedSingleMutation.mutate(id)}
              onDeleteParlay={(id) => deleteSavedParlayMutation.mutate(id)}
              onClearAll={async () => {
                const pending = (betsData?.singles ?? []).filter((s: any) => s.status === 'pending');
                const parlays = (betsData?.parlays ?? []).filter((p: any) => p.status === 'pending');
                for (const s of pending) await deleteSavedSingleMutation.mutateAsync(s.id);
                for (const p of parlays) await deleteSavedParlayMutation.mutateAsync(p.id);
              }}
            />
          </div>
        </div>
      </div>

      {slipCount > 0 && !locked && (
        <div style={s.mobileSlipBar} onClick={() => setShowSlip((v) => !v)}>
          <span style={s.mobileSlipLabel}>{slipCount} bet{slipCount !== 1 ? 's' : ''} · {fmtMoney(liveUsed)} staked</span>
          <span style={s.mobileSlipAction}>{showSlip ? 'Hide ▼' : 'Bet Slip ▲'}</span>
        </div>
      )}
      {showSlip && <div style={s.mobileSlipDrawer}><BetSlip {...slipProps} /></div>}

      <div style={{ height: 80 }} />
    </div>
  );
}

// ── Bet Slip ──────────────────────────────────────────────────────────────────

interface BetSlipProps {
  mainCard: any[];
  singles: SingleBet[];
  parlayLegs: Record<string, string>;
  parlayStake: string;
  parlayLegCount: number;
  parlayAmericanOdds: number | null;
  parlayPotential: number;
  singlesPotential: number;
  liveUsed: number;
  liveAvailable: number;
  anyUnsaved: boolean;
  isSaving: boolean;
  locked: boolean;
  hasResults: boolean;
  settledSingles: any[];
  settledParlay: any;
  betsData: any;
  onSaveAll: () => void;
  onClearAll: () => void;
  onStakeChange: (clientId: string, value: string) => void;
  onRemoveSingle: (clientId: string) => void;
  onParlayLegChange: (fightId: string, fighterId: string) => void;
  onParlayStakeChange: (value: string) => void;
  onRemoveParlayLeg: (fightId: string) => void;
  onRemoveParlay: () => void;
  onAutoPopulateParlay: (singles: SingleBet[]) => void;
}

function BetSlip({
  mainCard, singles, parlayLegs, parlayStake, parlayLegCount,
  parlayAmericanOdds, parlayPotential, singlesPotential, liveUsed, liveAvailable,
  anyUnsaved, isSaving, locked, hasResults, settledSingles, settledParlay, betsData,
  onSaveAll, onClearAll, onStakeChange, onRemoveSingle,
  onParlayLegChange, onParlayStakeChange, onRemoveParlayLeg, onRemoveParlay,
  onAutoPopulateParlay,
}: BetSlipProps) {
  const [parlayLegsOpen, setParlayLegsOpen] = useState(false);
  const prevUniqueCount = useRef(0);

  const activeSingles = singles.filter(b => b.fighterId);
  const uniqueFightIds = [...new Set(activeSingles.map(b => b.fightId))];
  const uniqueCount = uniqueFightIds.length;

  // Auto-sync parlay legs when unique fight count changes
  useEffect(() => {
    if (uniqueCount !== prevUniqueCount.current) {
      onAutoPopulateParlay(singles);
      // Expand legs when parlay first becomes valid
      if (uniqueCount >= 2 && prevUniqueCount.current < 2) setParlayLegsOpen(true);
      prevUniqueCount.current = uniqueCount;
    }
  }, [uniqueCount]);

  const showParlay = parlayLegCount >= 2;
  const isEmpty = activeSingles.length === 0 && !hasResults;
  const parlayStakeNum = parseFloat(parlayStake) || 0;

  return (
    <div style={sl.slip}>
      {/* Header */}
      <div style={sl.header}>
        <span style={sl.headerTitle}>BET SLIP</span>
        {activeSingles.length > 0 && <span style={sl.badge}>{activeSingles.length}</span>}
        {anyUnsaved && !locked && <span style={sl.unsavedDot} title="Unsaved changes" />}
        {activeSingles.length > 0 && !locked && (
          <button style={sl.clearBtn} onClick={onClearAll}>Clear all</button>
        )}
      </div>

      {isEmpty && (
        <div style={sl.empty}>
          <div style={sl.emptyIcon}>🎯</div>
          <div style={sl.emptyText}>No bets yet</div>
          <div style={sl.emptyHint}>Click a fighter to add a bet</div>
        </div>
      )}

      {/* ── Parlays section ────────────────────────────── */}
      {showParlay && (
        <div style={sl.sectionBlock}>
          <div style={sl.sectionHead}>
            <span style={sl.sectionHeadTitle}>Parlays</span>
            <span style={sl.chevron}>∧</span>
          </div>

          {/* Legs count + combined odds + stake */}
          <div style={sl.parlayMainRow}>
            <div style={sl.parlayLegsInfo}>
              <span style={sl.parlayLegsCount}>{parlayLegCount} Legs</span>
              <span style={sl.parlayCombinedOdds}>
                {parlayAmericanOdds != null ? fmtOdds(parlayAmericanOdds) : '—'}
              </span>
            </div>
            {!locked ? (
              <div style={sl.parlayStakeWrap}>
                <span style={sl.stakeSym}>$</span>
                <input
                  style={sl.parlayStakeIn}
                  type="number" min="1" step="1" placeholder="Stake"
                  value={parlayStake}
                  onChange={(e) => onParlayStakeChange(e.target.value)}
                />
              </div>
            ) : (
              parlayStakeNum > 0 && <span style={sl.stakedAmt}>{fmtMoney(parlayStakeNum)}</span>
            )}
          </div>

          {parlayPotential > 0 && (
            <div style={sl.parlayPayout}>Payout: <span style={sl.parlayPayoutAmt}>{fmtMoney(parlayPotential)}</span></div>
          )}

          {/* Show/hide legs toggle */}
          <button style={sl.hideLegsBtn} onClick={() => setParlayLegsOpen(v => !v)}>
            {parlayLegsOpen ? 'Hide selections ∧' : 'Show selections ∨'}
          </button>

          {/* Parlay leg rows */}
          {parlayLegsOpen && uniqueFightIds.filter(id => parlayLegs[id]).map((fightId) => {
            const fight = mainCard.find(f => f.id === fightId);
            if (!fight) return null;
            const fighterId = parlayLegs[fightId];
            const isRed = fighterId === fight.redFighterId;
            const fighterName = isRed
              ? `${fight.redFirstName} ${fight.redLastName}`
              : `${fight.blueFirstName} ${fight.blueLastName}`;
            const odds = isRed ? fight.redFighterOdds : fight.blueFighterOdds;
            return (
              <div key={fightId} style={sl.legRow}>
                {!locked && (
                  <button style={sl.legRemoveBtn} onClick={() => onRemoveParlayLeg(fightId)}>✕</button>
                )}
                <div style={sl.legInfo}>
                  <div style={sl.legFighterName}>{fighterName}</div>
                  <div style={sl.legMatchup}>{fight.redLastName} vs {fight.blueLastName} · {fight.weightClassName}</div>
                </div>
                {odds != null && (
                  <span style={{ ...sl.legOdds, color: odds < 0 ? '#888' : '#4caf50' }}>{fmtOdds(odds)}</span>
                )}
              </div>
            );
          })}

          {/* Fighter selector per leg (always visible when legs open) */}
          {parlayLegsOpen && uniqueFightIds.filter(id => parlayLegs[id]).map((fightId) => {
            const fight = mainCard.find(f => f.id === fightId);
            if (!fight || locked) return null;
            const selectedId = parlayLegs[fightId];
            return (
              <div key={`sel-${fightId}`} style={sl.legSelectorRow}>
                <button
                  style={{ ...sl.legPickBtn, ...(selectedId === fight.redFighterId ? sl.legPickBtnActive : {}) }}
                  onClick={() => onParlayLegChange(fightId, fight.redFighterId)}
                >
                  {fight.redLastName}
                </button>
                <button
                  style={{ ...sl.legPickBtn, ...(selectedId === fight.blueFighterId ? sl.legPickBtnActive : {}) }}
                  onClick={() => onParlayLegChange(fightId, fight.blueFighterId)}
                >
                  {fight.blueLastName}
                </button>
              </div>
            );
          })}

          {!locked && betsData?.parlay && (
            <button style={sl.removeAllBtn} onClick={onRemoveParlay}>Remove Parlay</button>
          )}
        </div>
      )}

      {/* ── Straights section ──────────────────────────── */}
      {activeSingles.length > 0 && (
        <div style={sl.sectionBlock}>
          <div style={sl.sectionHead}>
            <span style={sl.sectionHeadTitle}>Straights ({activeSingles.length})</span>
            <span style={sl.chevron}>∧</span>
          </div>

          {activeSingles.map((b) => {
            const fight = mainCard.find(f => f.id === b.fightId);
            if (!fight) return null;
            const isRed = b.fighterId === fight.redFighterId;
            const fighterName = isRed
              ? `${fight.redFirstName} ${fight.redLastName}`
              : `${fight.blueFirstName} ${fight.blueLastName}`;
            const odds = isRed ? fight.redFighterOdds : fight.blueFighterOdds;
            const stake = parseFloat(b.stake) || 0;
            const payout = odds != null && stake > 0 ? calcPayout(stake, toDecimalOdds(odds)) : null;

            return (
              <div key={b.clientId} style={sl.straightRow}>
                <div style={sl.straightTop}>
                  {!locked && (
                    <button style={sl.legRemoveBtn} onClick={() => onRemoveSingle(b.clientId)}>✕</button>
                  )}
                  <div style={sl.legInfo}>
                    <div style={sl.legFighterName}>{fighterName}</div>
                    <div style={sl.legMatchup}>{fight.redLastName} vs {fight.blueLastName} · {fight.weightClassName}</div>
                  </div>
                  {odds != null && (
                    <span style={{ ...sl.legOdds, color: odds < 0 ? '#888' : '#4caf50' }}>{fmtOdds(odds)}</span>
                  )}
                </div>
                <div style={sl.straightStakeRow}>
                  {!locked ? (
                    <div style={sl.stakeWrap}>
                      <span style={sl.stakeSym}>$</span>
                      <input
                        style={sl.stakeIn}
                        type="number" min="1" step="1" placeholder="Stake"
                        value={b.stake}
                        onChange={(e) => onStakeChange(b.clientId, e.target.value)}
                      />
                    </div>
                  ) : (
                    <span style={sl.stakedAmt}>{fmtMoney(stake)}</span>
                  )}
                  {payout != null && (
                    <span style={sl.straightPayout}>Payout: {fmtMoney(payout)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Place Bets button ──────────────────────────── */}
      {!locked && (activeSingles.length > 0 || showParlay) && (
        <div style={sl.footer}>
          {(liveUsed > 0 || singlesPotential + parlayPotential > 0) && (
            <div style={sl.footerTotals}>
              {liveUsed > 0 && (
                <div style={sl.footerRow}>
                  <span style={sl.footerLabel}>Total staked</span>
                  <span style={sl.footerVal}>{fmtMoney(liveUsed)}</span>
                </div>
              )}
              {(singlesPotential + parlayPotential) > 0 && (
                <div style={sl.footerRow}>
                  <span style={sl.footerLabel}>Max payout</span>
                  <span style={{ ...sl.footerVal, color: '#4caf50' }}>{fmtMoney(singlesPotential + parlayPotential)}</span>
                </div>
              )}
            </div>
          )}
          {liveAvailable < 0 && (
            <div style={sl.overBudgetWarning}>Exceeds budget by {fmtMoney(Math.abs(liveAvailable))}</div>
          )}
          <button
            style={{ ...sl.placeBtn, opacity: anyUnsaved && liveAvailable >= 0 ? 1 : 0.4 }}
            disabled={!anyUnsaved || isSaving || liveAvailable < 0}
            onClick={onSaveAll}
          >
            {isSaving ? 'Placing Bets…' : anyUnsaved ? 'Place Bets' : 'Bets Placed ✓'}
          </button>
        </div>
      )}

      {/* ── Results ───────────────────────────────────── */}
      {hasResults && (
        <div style={sl.sectionBlock}>
          <div style={sl.sectionHead}>
            <span style={sl.sectionHeadTitle}>Results</span>
          </div>
          {settledSingles.map((bet: any) => (
            <div key={bet.id} style={sl.resultRow}>
              <span style={{ ...sl.resultIcon, color: bet.status === 'won' ? '#4caf50' : '#ff5252' }}>
                {bet.status === 'won' ? '✓' : '✗'}
              </span>
              <span style={sl.resultName}>{bet.fighterFirstName} {bet.fighterLastName}</span>
              <span style={{ ...sl.resultPnl, color: parseFloat(bet.profitLoss) >= 0 ? '#4caf50' : '#ff5252' }}>
                {parseFloat(bet.profitLoss) >= 0 ? '+' : ''}{fmtMoney(parseFloat(bet.profitLoss))}
              </span>
            </div>
          ))}
          {settledParlay && (
            <div style={sl.resultRow}>
              <span style={{ ...sl.resultIcon, color: settledParlay.status === 'won' ? '#4caf50' : '#ff5252' }}>
                {settledParlay.status === 'won' ? '✓' : '✗'}
              </span>
              <span style={sl.resultName}>Parlay ({betsData?.parlayLegs?.length ?? 0} legs)</span>
              <span style={{ ...sl.resultPnl, color: parseFloat(settledParlay.profitLoss) >= 0 ? '#4caf50' : '#ff5252' }}>
                {parseFloat(settledParlay.profitLoss) >= 0 ? '+' : ''}{fmtMoney(parseFloat(settledParlay.profitLoss))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Saved Bets Panel ─────────────────────────────────────────────────────────

function SavedBetsPanel({ betsData, locked, onDeleteSingle, onDeleteParlay, onClearAll }: {
  betsData: any;
  locked: boolean;
  onDeleteSingle: (id: string) => void;
  onDeleteParlay: (id: string) => void;
  onClearAll: () => void;
}) {
  const allSingles: any[] = betsData?.singles ?? [];
  const allParlays: any[] = betsData?.parlays ?? [];
  const pendingSingles = allSingles.filter((s: any) => s.status === 'pending');
  const settledSingles = allSingles.filter((s: any) => s.status !== 'pending');
  const pendingParlays = allParlays.filter((p: any) => p.status === 'pending');
  const settledParlays = allParlays.filter((p: any) => p.status !== 'pending');
  const total = allSingles.length + allParlays.length;

  return (
    <div style={sv.panel}>
      <div style={sv.header}>
        <span style={sv.headerTitle}>SAVED BETS</span>
        {total > 0 && <span style={sv.badge}>{total}</span>}
        {(pendingSingles.length > 0 || pendingParlays.length > 0) && !locked && (
          <button style={sv.clearBtn} onClick={onClearAll}>Clear all</button>
        )}
      </div>

      {total === 0 && (
        <div style={sv.empty}>
          <div style={sv.emptyIcon}>📋</div>
          <div style={sv.emptyText}>No saved bets</div>
          <div style={sv.emptyHint}>Bets appear here after saving</div>
        </div>
      )}

      {(pendingSingles.length > 0 || pendingParlays.length > 0) && (
        <>
          <div style={sv.sectionLabel}>PENDING</div>
          {pendingSingles.map((s: any) => (
            <SavedSingleRow key={s.id} bet={s} canDelete={!locked} onDelete={() => onDeleteSingle(s.id)} />
          ))}
          {pendingParlays.map((p: any) => (
            <SavedParlayRow key={p.id} parlay={p} canDelete={!locked} onDelete={() => onDeleteParlay(p.id)} />
          ))}
        </>
      )}

      {(settledSingles.length > 0 || settledParlays.length > 0) && (
        <>
          <div style={sv.sectionLabel}>SETTLED</div>
          {settledSingles.map((s: any) => (
            <SavedSingleRow key={s.id} bet={s} canDelete={false} onDelete={() => {}} />
          ))}
          {settledParlays.map((p: any) => (
            <SavedParlayRow key={p.id} parlay={p} canDelete={false} onDelete={() => {}} />
          ))}
        </>
      )}
    </div>
  );
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function SavedSingleRow({ bet, canDelete, onDelete }: { bet: any; canDelete: boolean; onDelete: () => void }) {
  const stake = parseFloat(bet.stake) || 0;
  const odds: number | null = bet.odds ?? null;
  const pl = parseFloat(bet.profitLoss);
  const isPending = bet.status === 'pending';
  const potentialPayout = odds != null && stake > 0 ? calcPayout(stake, toDecimalOdds(odds)) : null;

  return (
    <div style={sv.betRow}>
      {canDelete && (
        <button style={sv.deleteBtn} onClick={onDelete} title="Delete bet">✕</button>
      )}
      <div style={sv.betLeft}>
        <div style={sv.betFighter}>{bet.fighterFirstName} {bet.fighterLastName}</div>
        {odds != null && (
          <div style={{ ...sv.betOdds, color: odds < 0 ? '#888' : '#4caf50' }}>{fmtOdds(odds)}</div>
        )}
        <div style={sv.betTs}>{fmtTs(bet.createdAt)}</div>
      </div>
      <div style={sv.betRight}>
        <div style={sv.betStake}>{fmtMoney(stake)}</div>
        {isPending
          ? potentialPayout != null && <div style={sv.betPotential}>Win {fmtMoney(potentialPayout)}</div>
          : <div style={{ ...sv.betPnl, color: pl >= 0 ? '#4caf50' : '#ff5252' }}>
              {bet.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
            </div>
        }
      </div>
    </div>
  );
}

function SavedParlayRow({ parlay, canDelete, onDelete }: { parlay: any; canDelete: boolean; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const legs: any[] = parlay.legs ?? [];
  const stake = parseFloat(parlay.stake) || 0;
  const decOdds = parseFloat(parlay.decimalOdds) || 1;
  const pl = parseFloat(parlay.profitLoss);
  const isPending = parlay.status === 'pending';
  const americanOdds = decOdds <= 1 ? null : decOdds >= 2 ? Math.round((decOdds - 1) * 100) : Math.round(-100 / (decOdds - 1));
  const potentialPayout = stake > 0 && decOdds > 1 ? calcPayout(stake, decOdds) : 0;

  return (
    <div style={sv.parlayRow}>
      <div style={sv.parlayTop}>
        {canDelete && (
          <button style={sv.deleteBtn} onClick={onDelete} title="Delete parlay">✕</button>
        )}
        <div style={sv.betLeft}>
          <div style={sv.betFighter}>{legs.length}-leg parlay</div>
          {americanOdds != null && (
            <div style={{ ...sv.betOdds, color: '#ffd700' }}>{fmtOdds(americanOdds)}</div>
          )}
        </div>
        <div style={sv.betRight}>
          <div style={sv.betStake}>{fmtMoney(stake)}</div>
          {isPending
            ? potentialPayout > 0 && <div style={sv.betPotential}>Win {fmtMoney(potentialPayout)}</div>
            : <div style={{ ...sv.betPnl, color: pl >= 0 ? '#4caf50' : '#ff5252' }}>
                {parlay.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
              </div>
          }
        </div>
      </div>
      <div style={sv.betTs}>{fmtTs(parlay.createdAt)}</div>
      {legs.length > 0 && (
        <>
          <button style={sv.toggleLegsBtn} onClick={() => setOpen(v => !v)}>
            {open ? 'Hide legs ∧' : 'Show legs ∨'}
          </button>
          {open && legs.map((leg: any, i: number) => (
            <div key={i} style={sv.legItem}>
              <span style={{ ...sv.legDot, color: leg.result === 'won' ? '#4caf50' : leg.result === 'lost' ? '#ff5252' : '#444' }}>
                {leg.result === 'won' ? '✓' : leg.result === 'lost' ? '✗' : '·'}
              </span>
              <span style={sv.legName}>{leg.fighterFirstName} {leg.fighterLastName}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', paddingBottom: 40 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  lockedBadge: { background: '#222', color: '#555', fontSize: 12, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  empty: { color: '#555', padding: 48, textAlign: 'center' },

  historyStrip: {
    display: 'flex', gap: 8, overflowX: 'auto', padding: '12px 24px',
    background: '#0d0d0d', borderBottom: '1px solid #1a1a1a',
    scrollbarWidth: 'thin', scrollbarColor: '#2a2a2a transparent',
  },
  historyChip: {
    flexShrink: 0, background: '#141414', border: '1px solid #242424',
    borderRadius: 8, padding: '8px 12px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 90,
  },
  historyChipCurrent: { border: '1px solid #ffd700', background: '#1a1800' },
  historyChipLive: { border: '1px solid #c8102e', background: '#1a0808' },
  historyChipNoMatchup: { opacity: 0.4 },
  chipFinalsBadge: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  chipSemisBadge: { color: '#ff8c42', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  chipNextBadge: { color: '#ffd700', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipLiveBadge: { color: '#c8102e', fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase' },
  chipEvent: { color: '#888', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  chipDate: { color: '#444', fontSize: 10, textAlign: 'center' },
  chipOpp: { color: '#555', fontSize: 10, textAlign: 'center', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipScore: { color: '#fff', fontSize: 14, fontWeight: 700 },
  chipResult: { fontSize: 12, fontWeight: 700 },
  chipPending: { color: '#444', fontSize: 10 },

  eventHeader: { padding: '16px 24px 12px', borderBottom: '1px solid #1a1a1a' },
  eventName: { color: '#fff', fontSize: 18, fontWeight: 700 },
  eventDate: { color: '#555', fontSize: 12, marginTop: 2 },

  balanceBar: { display: 'flex', background: '#111', borderBottom: '1px solid #1e1e1e', padding: '14px 24px' },
  balanceStat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  balanceVal: { color: '#fff', fontSize: 18, fontWeight: 700 },
  balanceLabel: { color: '#444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceDivider: { width: 1, background: '#222', margin: '0 8px' },

  errorBanner: { background: '#2a0a0a', border: '1px solid #c8102e44', color: '#ff6b6b', fontSize: 14, padding: '10px 24px', margin: '12px 24px 0', borderRadius: 8 },

  body: { display: 'flex', gap: 20, alignItems: 'flex-start', padding: '0 24px', maxWidth: 1400, margin: '0 auto' },
  col: { flex: 1, minWidth: 0 },
  stickyCol: { position: 'sticky', top: 16, paddingTop: 56 },

  section: { paddingBottom: 8, marginTop: 24 },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  sectionTitle: { color: '#444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  sectionSub: { color: '#333', fontSize: 12 },

  fightCard: { background: '#141414', border: '1px solid #242424', borderRadius: 12, padding: '14px', marginBottom: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.4)' },
  fightCardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  weightClass: { color: '#444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  mainEventBadge: { background: '#c8102e22', color: '#c8102e', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 3 },

  fighterRow: { display: 'flex', alignItems: 'center' },
  fighterBtn: { flex: 1, background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '8px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'row' as const, alignItems: 'center', gap: 8 },
  fighterBtnRight: { flexDirection: 'row-reverse' as const },
  fighterInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1, alignItems: 'flex-start' },
  fighterImg: { width: 36, height: 44, objectFit: 'cover' as const, objectPosition: 'top center', borderRadius: 4, background: '#111', flexShrink: 0 },
  fighterName: { color: '#ddd', fontSize: 14, fontWeight: 600, lineHeight: 1.2 },
  oddsTag: { fontSize: 12, fontWeight: 700 },
  betCountPill: { background: '#c8102e33', color: '#c8102e', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, marginTop: 2 },
  vsBlock: { display: 'flex', alignItems: 'center', flexShrink: 0, minWidth: 40, justifyContent: 'center' },
  vsLabel: { color: '#444', fontSize: 10, fontWeight: 700, letterSpacing: 1 },

  betEntries: { borderTop: '1px solid #1e1e1e', marginTop: 10, paddingTop: 10, display: 'flex', flexDirection: 'column' as const, gap: 8 },
  betEntry: { display: 'flex', alignItems: 'center', gap: 8, background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 8, padding: '8px 10px' },
  betEntryFighters: { display: 'flex', gap: 5, flex: 1 },
  betFighterBtn: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#666', fontSize: 11, fontWeight: 600, padding: '4px 8px', cursor: 'pointer', whiteSpace: 'nowrap' as const },
  betFighterBtnActive: { border: '1px solid #c8102e88', color: '#fff', background: '#1a0808' },
  betEntryRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  betEntryPayout: { color: '#4caf50', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' as const },
  betRemoveBtn: { background: 'none', border: 'none', color: '#333', fontSize: 12, cursor: 'pointer', padding: '2px 4px' },

  stakeInputWrap: { display: 'flex', alignItems: 'center', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, paddingLeft: 10, height: 38, minWidth: 100 },
  stakeDollar: { color: '#555', fontSize: 14, fontWeight: 700 },
  stakeInput: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 16, fontWeight: 700, width: 80, padding: '0 8px' },

  mobileSlipBar: { display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0, background: '#c8102e', padding: '14px 24px', flexDirection: 'row' as const, justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', zIndex: 100 },
  mobileSlipLabel: { color: '#fff', fontWeight: 700, fontSize: 14 },
  mobileSlipAction: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  mobileSlipDrawer: { display: 'none', padding: '0 24px 24px' },
};

const sl: Record<string, React.CSSProperties> = {
  slip: { background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' },

  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: '#141414', borderBottom: '1px solid #1a1a1a' },
  headerTitle: { color: '#666', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  badge: { background: '#c8102e', color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px', minWidth: 18, textAlign: 'center' },
  unsavedDot: { width: 7, height: 7, borderRadius: '50%', background: '#ffd700', flexShrink: 0 },
  clearBtn: { background: 'none', border: 'none', color: '#444', fontSize: 11, cursor: 'pointer', padding: '2px 0', marginLeft: 4 },

  empty: { padding: '36px 16px', textAlign: 'center' },
  emptyIcon: { fontSize: 28, marginBottom: 10 },
  emptyText: { color: '#444', fontSize: 14, fontWeight: 600 },
  emptyHint: { color: '#333', fontSize: 12, marginTop: 4 },

  // Section blocks (Parlays / Straights)
  sectionBlock: { borderBottom: '1px solid #1a1a1a' },
  sectionHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px', background: '#141414' },
  sectionHeadTitle: { color: '#bbb', fontSize: 13, fontWeight: 700 },
  chevron: { color: '#555', fontSize: 12, cursor: 'pointer' },

  // Parlay main row
  parlayMainRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' },
  parlayLegsInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2 },
  parlayLegsCount: { color: '#888', fontSize: 12 },
  parlayCombinedOdds: { color: '#ffd700', fontSize: 20, fontWeight: 700 },
  parlayStakeWrap: { display: 'flex', alignItems: 'center', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, paddingLeft: 8, height: 36, width: 110 },
  parlayStakeIn: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontWeight: 700, width: '100%', padding: '0 8px' },
  parlayPayout: { color: '#555', fontSize: 12, padding: '0 16px 6px' },
  parlayPayoutAmt: { color: '#4caf50', fontWeight: 700 },
  hideLegsBtn: { display: 'block', background: 'none', border: 'none', color: '#c8102e', fontSize: 12, cursor: 'pointer', padding: '4px 16px 10px', textAlign: 'left' as const },

  // Leg rows (shared by parlay and the future "show legs" feature)
  legRow: { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 16px', borderTop: '1px solid #161616' },
  legRemoveBtn: { background: 'none', border: 'none', color: '#444', fontSize: 12, cursor: 'pointer', padding: '2px 2px', flexShrink: 0, marginTop: 1 },
  legInfo: { flex: 1, minWidth: 0 },
  legFighterName: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  legMatchup: { color: '#555', fontSize: 11, marginTop: 2 },
  legOdds: { fontSize: 13, fontWeight: 700, flexShrink: 0, marginTop: 1 },

  // Leg selector (change fighter for parlay leg)
  legSelectorRow: { display: 'flex', gap: 6, padding: '4px 16px 10px 36px' },
  legPickBtn: { flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#555', fontSize: 11, fontWeight: 600, padding: '4px 0', cursor: 'pointer' },
  legPickBtnActive: { border: '1px solid #c8102e88', color: '#fff', background: '#1a0808' },

  removeAllBtn: { display: 'block', width: '100%', background: 'none', border: 'none', color: '#444', fontSize: 12, cursor: 'pointer', padding: '6px 16px 10px', textAlign: 'left' as const },

  // Straight bet rows
  straightRow: { borderTop: '1px solid #161616', padding: '10px 16px' },
  straightTop: { display: 'flex', alignItems: 'flex-start', gap: 8 },
  straightStakeRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, paddingLeft: 20 },
  straightPayout: { color: '#555', fontSize: 12 },

  stakeWrap: { display: 'flex', alignItems: 'center', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 6, paddingLeft: 6, height: 32, width: 120 },
  stakeSym: { color: '#555', fontSize: 12, fontWeight: 700 },
  stakeIn: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 14, fontWeight: 700, flex: 1, padding: '0 6px' },
  stakedAmt: { color: '#fff', fontSize: 13, fontWeight: 700 },

  // Footer / place bets
  footer: { padding: '12px 16px', background: '#0e0e0e', borderTop: '1px solid #1a1a1a' },
  footerTotals: { marginBottom: 10 },
  footerRow: { display: 'flex', justifyContent: 'space-between', padding: '2px 0' },
  footerLabel: { color: '#555', fontSize: 12 },
  footerVal: { color: '#fff', fontSize: 13, fontWeight: 700 },
  placeBtn: { display: 'block', width: '100%', background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 15, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.3 },
  overBudgetWarning: { color: '#ff5252', fontSize: 12, fontWeight: 600, textAlign: 'center' as const, marginBottom: 8 },

  // Results
  resultRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderTop: '1px solid #161616' },
  resultIcon: { fontSize: 13, fontWeight: 700, flexShrink: 0, minWidth: 14 },
  resultName: { flex: 1, color: '#888', fontSize: 12 },
  resultPnl: { fontSize: 13, fontWeight: 700 },
};

const sv: Record<string, React.CSSProperties> = {
  panel: { background: '#111', border: '1px solid #1e1e1e', borderRadius: 12, overflow: 'hidden' },
  header: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', background: '#141414', borderBottom: '1px solid #1a1a1a' },
  headerTitle: { color: '#666', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  badge: { background: '#222', color: '#888', fontSize: 11, fontWeight: 700, borderRadius: 10, padding: '1px 7px', minWidth: 18, textAlign: 'center' },
  empty: { padding: '36px 16px', textAlign: 'center' },
  emptyIcon: { fontSize: 28, marginBottom: 10 },
  emptyText: { color: '#444', fontSize: 14, fontWeight: 600 },
  emptyHint: { color: '#333', fontSize: 12, marginTop: 4 },
  sectionLabel: { padding: '7px 16px', color: '#333', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', background: '#0d0d0d', borderBottom: '1px solid #161616' },
  betRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '10px 16px', borderBottom: '1px solid #161616' },
  parlayRow: { padding: '10px 16px', borderBottom: '1px solid #161616' },
  parlayTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  betLeft: { flex: 1, minWidth: 0 },
  betRight: { textAlign: 'right' as const, flexShrink: 0 },
  betFighter: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  betOdds: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  betStake: { color: '#fff', fontSize: 13, fontWeight: 700 },
  betPotential: { color: '#555', fontSize: 11, marginTop: 2 },
  betPnl: { fontSize: 13, fontWeight: 700, marginTop: 2 },
  betTs: { color: '#333', fontSize: 10, marginTop: 3 },
  deleteBtn: { background: 'none', border: 'none', color: '#444', fontSize: 13, cursor: 'pointer', padding: '2px 4px', flexShrink: 0, lineHeight: 1 },
  toggleLegsBtn: { background: 'none', border: 'none', color: '#c8102e', fontSize: 11, cursor: 'pointer', padding: '5px 0 2px', display: 'block' },
  clearBtn: { background: 'none', border: 'none', color: '#444', fontSize: 11, cursor: 'pointer', padding: '2px 0', marginLeft: 4 },
  legItem: { display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4, paddingLeft: 2 },
  legDot: { fontSize: 11, fontWeight: 700, flexShrink: 0, width: 12 },
  legName: { color: '#777', fontSize: 11 },
};
