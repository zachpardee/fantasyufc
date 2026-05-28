import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../api/client';

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

type SingleLocal = { fighterId: string; stake: string };
type ParlayLegs = Record<string, string>; // fightId → fighterId

export function StakingPicksPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const qc = useQueryClient();

  const [singles, setSingles] = useState<Record<string, SingleLocal>>({});
  const [parlayLegs, setParlayLegs] = useState<ParlayLegs>({});
  const [parlayStake, setParlayStake] = useState('');
  const [singlesTouched, setSinglesTouched] = useState(false);
  const [parlayTouched, setParlayTouched] = useState(false);
  const [saveError, setSaveError] = useState('');
  const initialized = useRef(false);

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

  // Seed local state from server once
  useEffect(() => {
    if (!betsData || initialized.current) return;
    initialized.current = true;

    const initSingles: Record<string, SingleLocal> = {};
    for (const s of betsData.singles ?? []) {
      initSingles[s.fightId] = { fighterId: s.fighterId, stake: parseFloat(s.stake).toFixed(2) };
    }
    setSingles(initSingles);

    if (betsData.parlay) {
      setParlayStake(parseFloat(betsData.parlay.stake).toFixed(2));
    }
    const initLegs: ParlayLegs = {};
    for (const leg of betsData.parlayLegs ?? []) {
      initLegs[leg.fightId] = leg.fighterId;
    }
    setParlayLegs(initLegs);
  }, [betsData]);

  // Reset on event change
  useEffect(() => {
    initialized.current = false;
    setSingles({});
    setParlayLegs({});
    setParlayStake('');
    setSinglesTouched(false);
    setParlayTouched(false);
    setSaveError('');
  }, [currentEvent?.id]);

  const saveSinglesMutation = useMutation({
    mutationFn: () => {
      const bets = Object.entries(singles)
        .map(([fightId, v]) => ({ fightId, fighterId: v.fighterId, stake: parseFloat(v.stake) }))
        .filter((b) => b.fighterId && !isNaN(b.stake) && b.stake > 0);
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent!.id}/singles`, { bets });
    },
    onSuccess: () => {
      setSinglesTouched(false);
      setSaveError('');
      refetchBets();
      qc.invalidateQueries({ queryKey: ['staking-bets', leagueId, currentEvent?.id] });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save bets'),
  });

  const saveParlayMutation = useMutation({
    mutationFn: () => {
      const legs = Object.entries(parlayLegs).map(([fightId, fighterId]) => ({ fightId, fighterId }));
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent!.id}/parlay`, {
        stake: parseFloat(parlayStake),
        legs,
      });
    },
    onSuccess: () => {
      setParlayTouched(false);
      setSaveError('');
      refetchBets();
      qc.invalidateQueries({ queryKey: ['staking-bets', leagueId, currentEvent?.id] });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save parlay'),
  });

  const removeParlayMutation = useMutation({
    mutationFn: () => apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent!.id}/parlay`),
    onSuccess: () => {
      setParlayLegs({});
      setParlayStake('');
      setParlayTouched(false);
      refetchBets();
    },
  });

  const mainCard: any[] = betsData?.fights ?? [];
  const locked: boolean = picksData?.locked ?? false;

  const weeklyBudget: number = betsData?.weeklyBudget ?? 100;
  const seasonBankroll: number = betsData?.seasonBankroll ?? 0;

  const localSinglesTotal = Object.values(singles)
    .reduce((sum, v) => sum + (parseFloat(v.stake) || 0), 0);
  const localParlayTotal = parseFloat(parlayStake) || 0;
  const liveUsed = localSinglesTotal + localParlayTotal;
  const liveAvailable = weeklyBudget - liveUsed;

  // Parlay combined odds
  const parlayDecOdds = Object.entries(parlayLegs).reduce((prod, [fightId, fighterId]) => {
    const fight = mainCard.find((f) => f.id === fightId);
    if (!fight) return prod;
    const odds = fight.redFighterId === fighterId ? fight.redFighterOdds : fight.blueFighterOdds;
    return odds != null ? prod * toDecimalOdds(odds) : prod;
  }, 1);
  const parlayLegCount = Object.keys(parlayLegs).length;
  const parlayPotential = localParlayTotal > 0 && parlayLegCount >= 2
    ? calcPayout(localParlayTotal, parlayDecOdds) : 0;
  const parlayAmericanOdds = parlayDecOdds <= 1 ? null
    : parlayDecOdds >= 2
      ? Math.round((parlayDecOdds - 1) * 100)
      : Math.round(-100 / (parlayDecOdds - 1));

  if (!currentEvent) {
    return (
      <div style={s.page}>
        <nav style={s.nav}>
          <Link to={`/league/${leagueId}`} style={s.back}>← League</Link>
          <span style={s.navTitle}>Staking</span>
        </nav>
        <div style={s.empty}>No upcoming event to bet on.</div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <Link to={`/league/${leagueId}`} style={s.back}>← League</Link>
        <span style={s.navTitle}>Staking</span>
        {locked && <span style={s.lockedBadge}>LOCKED</span>}
      </nav>

      {/* Event header */}
      <div style={s.eventHeader}>
        <div style={s.eventName}>{currentEvent.name}</div>
        {currentEvent.scheduledAt && (
          <div style={s.eventDate}>
            {new Date(currentEvent.scheduledAt).toLocaleDateString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
            })}
          </div>
        )}
      </div>

      {/* Balance bar */}
      <div style={s.balanceBar}>
        <div style={s.balanceStat}>
          <span style={s.balanceVal}>{fmtMoney(weeklyBudget)}</span>
          <span style={s.balanceLabel}>Budget</span>
        </div>
        <div style={s.balanceDivider} />
        <div style={s.balanceStat}>
          <span style={{ ...s.balanceVal, color: liveUsed > 0 ? '#ffd700' : '#555' }}>
            {fmtMoney(liveUsed)}
          </span>
          <span style={s.balanceLabel}>At Stake</span>
        </div>
        <div style={s.balanceDivider} />
        <div style={s.balanceStat}>
          <span style={{ ...s.balanceVal, color: liveAvailable < 0 ? '#ff5252' : '#4caf50' }}>
            {fmtMoney(Math.max(0, liveAvailable))}
          </span>
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

      {saveError && (
        <div style={s.errorBanner}>{saveError}</div>
      )}

      {/* Singles */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>SINGLES</span>
          <span style={s.sectionSub}>Pick a fighter + stake per fight</span>
        </div>

        {mainCard.map((fight) => {
          const single = singles[fight.id];
          const selectedId = single?.fighterId;
          const redOdds = fight.redFighterOdds;
          const blueOdds = fight.blueFighterOdds;
          const selectedOdds = selectedId === fight.redFighterId ? redOdds : selectedId === fight.blueFighterId ? blueOdds : null;
          const potPayout = selectedOdds != null && single?.stake && parseFloat(single.stake) > 0
            ? calcPayout(parseFloat(single.stake), toDecimalOdds(selectedOdds)) : null;
          const inParlay = !!parlayLegs[fight.id];

          const selectRed = () => {
            if (locked) return;
            setSingles((prev) => {
              if (prev[fight.id]?.fighterId === fight.redFighterId) { const n = { ...prev }; delete n[fight.id]; return n; }
              return { ...prev, [fight.id]: { fighterId: fight.redFighterId, stake: prev[fight.id]?.stake ?? '' } };
            });
            setSinglesTouched(true);
          };
          const selectBlue = () => {
            if (locked) return;
            setSingles((prev) => {
              if (prev[fight.id]?.fighterId === fight.blueFighterId) { const n = { ...prev }; delete n[fight.id]; return n; }
              return { ...prev, [fight.id]: { fighterId: fight.blueFighterId, stake: prev[fight.id]?.stake ?? '' } };
            });
            setSinglesTouched(true);
          };

          return (
            <div key={fight.id} style={s.fightCard}>
              <div style={s.fightCardHeader}>
                <span style={s.weightClass}>{fight.weightClassName}</span>
                {fight.isMainEvent && <span style={s.mainEventBadge}>MAIN EVENT</span>}
                {inParlay && <span style={s.parlayTag}>+ PARLAY</span>}
              </div>

              <div style={s.fighterRow}>
                {/* Red corner */}
                <button disabled={locked} style={{ ...s.fighterBtn, ...(selectedId === fight.redFighterId ? s.fighterBtnSelected : {}) }} onClick={selectRed}>
                  {fight.redImageUrl && <img src={fight.redImageUrl} alt="" style={s.fighterImg} />}
                  <div style={s.fighterInfo}>
                    <span style={s.fighterName}>{fight.redFirstName} {fight.redLastName}</span>
                    {redOdds != null && <span style={{ ...s.oddsTag, color: redOdds < 0 ? '#aaa' : '#4caf50' }}>{fmtOdds(redOdds)}</span>}
                  </div>
                </button>

                <div style={s.vsBlock}>
                  <span style={s.vsLabel}>VS</span>
                  <span style={s.vsWeight}>{fight.weightClassName}</span>
                </div>

                {/* Blue corner */}
                <button disabled={locked} style={{ ...s.fighterBtn, ...s.fighterBtnRight, ...(selectedId === fight.blueFighterId ? s.fighterBtnSelected : {}) }} onClick={selectBlue}>
                  <div style={{ ...s.fighterInfo, alignItems: 'flex-end' }}>
                    <span style={s.fighterName}>{fight.blueFirstName} {fight.blueLastName}</span>
                    {blueOdds != null && <span style={{ ...s.oddsTag, color: blueOdds < 0 ? '#aaa' : '#4caf50' }}>{fmtOdds(blueOdds)}</span>}
                  </div>
                  {fight.blueImageUrl && <img src={fight.blueImageUrl} alt="" style={s.fighterImg} />}
                </button>
              </div>

              {/* Stake row */}
              {selectedId && (
                <div style={s.stakeRow}>
                  <div style={s.stakeInputWrap}>
                    <span style={s.stakeDollar}>$</span>
                    <input
                      style={s.stakeInput}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="0"
                      value={single?.stake ?? ''}
                      disabled={locked}
                      onChange={(e) => {
                        setSingles((prev) => ({
                          ...prev,
                          [fight.id]: { ...prev[fight.id], stake: e.target.value },
                        }));
                        setSinglesTouched(true);
                      }}
                    />
                  </div>
                  {potPayout != null && (
                    <div style={s.payoutPreview}>
                      win → <span style={s.payoutAmt}>{fmtMoney(potPayout)}</span>
                      <span style={s.payoutProfit}>(+{fmtMoney(potPayout - parseFloat(single.stake))})</span>
                    </div>
                  )}
                </div>
              )}

              {/* Parlay toggle */}
              {!locked && (
                <button
                  style={{ ...s.parlayToggle, ...(inParlay ? s.parlayToggleActive : {}) }}
                  onClick={() => {
                    setParlayLegs((prev) => {
                      if (prev[fight.id]) {
                        const next = { ...prev };
                        delete next[fight.id];
                        return next;
                      }
                      // Default to the selected fighter for the single, or no selection
                      const defaultFighter = selectedId ?? '';
                      return { ...prev, [fight.id]: defaultFighter };
                    });
                    setParlayTouched(true);
                  }}
                >
                  {inParlay ? '✓ In Parlay' : '+ Add to Parlay'}
                </button>
              )}
            </div>
          );
        })}

        {!locked && (
          <button
            style={{ ...s.saveBtn, opacity: singlesTouched ? 1 : 0.4 }}
            disabled={!singlesTouched || saveSinglesMutation.isPending}
            onClick={() => saveSinglesMutation.mutate()}
          >
            {saveSinglesMutation.isPending ? 'Saving…' : 'Save Singles'}
          </button>
        )}
      </div>

      {/* Parlay slip */}
      <div style={s.section}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>PARLAY SLIP</span>
          <span style={s.sectionSub}>{parlayLegCount < 2 ? 'Add 2+ fights to build a parlay' : `${parlayLegCount} legs`}</span>
        </div>

        {parlayLegCount === 0 ? (
          <div style={s.parlayEmpty}>Use "+ Add to Parlay" on any fight above to build your slip.</div>
        ) : (
          <>
            {Object.entries(parlayLegs).map(([fightId, fighterId]) => {
              const fight = mainCard.find((f) => f.id === fightId);
              if (!fight) return null;
              const isRed = fighterId === fight.redFighterId;
              const odds = isRed ? fight.redFighterOdds : fight.blueFighterOdds;

              return (
                <div key={fightId} style={s.parlayLeg}>
                  <div style={s.parlayLegLeft}>
                    <div style={s.parlayLegFight}>{fight.redLastName} vs {fight.blueLastName}</div>
                    {/* Fighter selector for this leg */}
                    <div style={s.parlayLegFighters}>
                      <button
                        style={{ ...s.parlayFighterBtn, ...(fighterId === fight.redFighterId ? s.parlayFighterBtnSelected : {}) }}
                        disabled={locked}
                        onClick={() => { setParlayLegs((p) => ({ ...p, [fightId]: fight.redFighterId })); setParlayTouched(true); }}
                      >
                        {fight.redLastName} {fight.redFighterOdds != null ? fmtOdds(fight.redFighterOdds) : ''}
                      </button>
                      <button
                        style={{ ...s.parlayFighterBtn, ...(fighterId === fight.blueFighterId ? s.parlayFighterBtnSelected : {}) }}
                        disabled={locked}
                        onClick={() => { setParlayLegs((p) => ({ ...p, [fightId]: fight.blueFighterId })); setParlayTouched(true); }}
                      >
                        {fight.blueLastName} {fight.blueFighterOdds != null ? fmtOdds(fight.blueFighterOdds) : ''}
                      </button>
                    </div>
                  </div>
                  {odds != null && (
                    <div style={{ ...s.parlayLegOdds, color: odds < 0 ? '#aaa' : '#4caf50' }}>{fmtOdds(odds)}</div>
                  )}
                  {!locked && (
                    <button style={s.parlayRemove} onClick={() => {
                      setParlayLegs((p) => { const n = { ...p }; delete n[fightId]; return n; });
                      setParlayTouched(true);
                    }}>✕</button>
                  )}
                </div>
              );
            })}

            {parlayLegCount >= 2 && (
              <div style={s.parlayOddsBar}>
                <div style={s.parlayOddsLabel}>Combined odds</div>
                <div style={s.parlayOddsVal}>
                  {parlayAmericanOdds != null ? fmtOdds(parlayAmericanOdds) : '—'}
                  <span style={s.parlayOddsDecimal}>({parlayDecOdds.toFixed(2)}x)</span>
                </div>
              </div>
            )}

            {parlayLegCount >= 2 && !locked && (
              <div style={s.stakeRow}>
                <div style={s.stakeInputWrap}>
                  <span style={s.stakeDollar}>$</span>
                  <input
                    style={s.stakeInput}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="0"
                    value={parlayStake}
                    onChange={(e) => { setParlayStake(e.target.value); setParlayTouched(true); }}
                  />
                </div>
                {parlayPotential > 0 && (
                  <div style={s.payoutPreview}>
                    win → <span style={s.payoutAmt}>{fmtMoney(parlayPotential)}</span>
                    <span style={s.payoutProfit}>(+{fmtMoney(parlayPotential - localParlayTotal)})</span>
                  </div>
                )}
              </div>
            )}

            {!locked && (
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button
                  style={{ ...s.saveBtn, flex: 1, opacity: parlayTouched && parlayLegCount >= 2 ? 1 : 0.4 }}
                  disabled={!parlayTouched || parlayLegCount < 2 || !parlayStake || Object.values(parlayLegs).some((id) => !id) || saveParlayMutation.isPending}
                  onClick={() => saveParlayMutation.mutate()}
                >
                  {saveParlayMutation.isPending ? 'Saving…' : 'Save Parlay'}
                </button>
                {betsData?.parlay && (
                  <button
                    style={s.removeBtn}
                    disabled={removeParlayMutation.isPending}
                    onClick={() => removeParlayMutation.mutate()}
                  >
                    Remove
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Settled bets */}
      {(betsData?.singles?.some((s: any) => s.status !== 'pending') || (betsData?.parlay != null && betsData.parlay.status !== 'pending')) && (
        <div style={s.section}>
          <div style={s.sectionHeader}>
            <span style={s.sectionTitle}>RESULTS</span>
          </div>
          {(betsData?.singles ?? []).filter((s: any) => s.status !== 'pending').map((s: any) => (
            <div key={s.id} style={s2.resultRow}>
              <span style={s2.resultFighter}>{s.fighterFirstName} {s.fighterLastName}</span>
              <span style={{ ...s2.resultPnl, color: parseFloat(s.profitLoss) >= 0 ? '#4caf50' : '#ff5252' }}>
                {parseFloat(s.profitLoss) >= 0 ? '+' : ''}{fmtMoney(parseFloat(s.profitLoss))}
              </span>
              <span style={s2.resultStatus}>{s.status === 'won' ? 'Won' : 'Lost'}</span>
            </div>
          ))}
          {betsData?.parlay && betsData.parlay.status !== 'pending' && (
            <div style={s2.resultRow}>
              <span style={s2.resultFighter}>Parlay ({betsData.parlayLegs?.length ?? 0} legs)</span>
              <span style={{ ...s2.resultPnl, color: parseFloat(betsData.parlay.profitLoss) >= 0 ? '#4caf50' : '#ff5252' }}>
                {parseFloat(betsData.parlay.profitLoss) >= 0 ? '+' : ''}{fmtMoney(parseFloat(betsData.parlay.profitLoss))}
              </span>
              <span style={s2.resultStatus}>{betsData.parlay.status === 'won' ? 'Won' : 'Lost'}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', paddingBottom: 40 },
  nav: { background: '#111', borderBottom: '1px solid #222', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16 },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  navTitle: { color: '#fff', fontWeight: 700, flex: 1 },
  lockedBadge: { background: '#222', color: '#555', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4 },
  empty: { color: '#555', padding: 48, textAlign: 'center' },

  eventHeader: { padding: '16px 24px 12px', borderBottom: '1px solid #1a1a1a' },
  eventName: { color: '#fff', fontSize: 18, fontWeight: 800 },
  eventDate: { color: '#555', fontSize: 12, marginTop: 2 },

  balanceBar: { display: 'flex', background: '#111', borderBottom: '1px solid #1e1e1e', padding: '14px 24px', gap: 0 },
  balanceStat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 },
  balanceVal: { color: '#fff', fontSize: 18, fontWeight: 800 },
  balanceLabel: { color: '#444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceDivider: { width: 1, background: '#222', margin: '0 8px' },

  errorBanner: { background: '#2a0a0a', border: '1px solid #c8102e44', color: '#ff6b6b', fontSize: 13, padding: '10px 24px', margin: '12px 24px 0', borderRadius: 8 },

  section: { padding: '0 24px 8px', marginTop: 24 },
  sectionHeader: { display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 },
  sectionTitle: { color: '#444', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 },
  sectionSub: { color: '#333', fontSize: 11 },

  fightCard: { background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '14px', marginBottom: 10 },
  fightCardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  weightClass: { color: '#444', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  mainEventBadge: { background: '#c8102e22', color: '#c8102e', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5 },
  parlayTag: { background: '#ffd70022', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.5 },

  fighterRow: { display: 'flex', alignItems: 'center', gap: 0 },
  fighterBtn: {
    flex: 1, background: 'transparent', border: '1px solid transparent', borderRadius: 8,
    padding: '8px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'row' as const,
    alignItems: 'center', gap: 8,
  },
  fighterBtnRight: { flexDirection: 'row-reverse' as const },
  fighterBtnSelected: { border: '1px solid #c8102e44', background: '#1a0808' },
  fighterInfo: { display: 'flex', flexDirection: 'column' as const, gap: 2, flex: 1, alignItems: 'flex-start' },
  fighterImg: { width: 36, height: 44, objectFit: 'cover' as const, objectPosition: 'top center', borderRadius: 4, background: '#111', flexShrink: 0 },
  fighterName: { color: '#ddd', fontSize: 13, fontWeight: 600, lineHeight: 1.2, textAlign: 'left' as const },
  oddsTag: { fontSize: 11, fontWeight: 700 },
  vsBlock: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 2, flexShrink: 0, width: 44 },
  vsLabel: { color: '#333', fontSize: 10, fontWeight: 800, letterSpacing: 1 },
  vsWeight: { display: 'none' },

  stakeRow: { display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, padding: '10px 0 4px', borderTop: '1px solid #1a1a1a' },
  stakeInputWrap: { display: 'flex', alignItems: 'center', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, paddingLeft: 10, height: 38, minWidth: 100 },
  stakeDollar: { color: '#555', fontSize: 14, fontWeight: 700 },
  stakeInput: { background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: 16, fontWeight: 700, width: 80, padding: '0 8px' },
  payoutPreview: { color: '#555', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 },
  payoutAmt: { color: '#4caf50', fontWeight: 700, fontSize: 14 },
  payoutProfit: { color: '#388e3c', fontSize: 11 },

  parlayToggle: { marginTop: 10, width: '100%', background: 'transparent', border: '1px dashed #2a2a2a', borderRadius: 6, color: '#444', fontSize: 11, fontWeight: 700, padding: '6px', cursor: 'pointer', letterSpacing: 0.5 },
  parlayToggleActive: { border: '1px solid #ffd70055', color: '#ffd700', background: '#1a1800' },

  parlayEmpty: { color: '#333', fontSize: 13, padding: '16px 0', fontStyle: 'italic' },
  parlayLeg: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid #1a1a1a' },
  parlayLegLeft: { flex: 1 },
  parlayLegFight: { color: '#555', fontSize: 11, marginBottom: 6 },
  parlayLegFighters: { display: 'flex', gap: 6 },
  parlayFighterBtn: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#888', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer' },
  parlayFighterBtnSelected: { border: '1px solid #c8102e', color: '#fff', background: '#1a0808' },
  parlayLegOdds: { fontSize: 14, fontWeight: 800, flexShrink: 0 },
  parlayRemove: { background: 'none', border: 'none', color: '#333', fontSize: 14, cursor: 'pointer', padding: '4px 6px' },

  parlayOddsBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #1a1a1a', marginTop: 4 },
  parlayOddsLabel: { color: '#555', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  parlayOddsVal: { color: '#ffd700', fontSize: 18, fontWeight: 800 },
  parlayOddsDecimal: { color: '#555', fontSize: 12, fontWeight: 400, marginLeft: 6 },

  saveBtn: { width: '100%', background: '#c8102e', color: '#fff', border: 'none', borderRadius: 8, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 14 },
  removeBtn: { background: '#1a1a1a', color: '#666', border: '1px solid #2a2a2a', borderRadius: 8, padding: '13px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 14 },
};

// Second style object to avoid name collision in results section
const s2: Record<string, React.CSSProperties> = {
  resultRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #111' },
  resultFighter: { flex: 1, color: '#888', fontSize: 13, fontWeight: 600 },
  resultPnl: { fontSize: 14, fontWeight: 800, minWidth: 60, textAlign: 'right' },
  resultStatus: { color: '#444', fontSize: 11, minWidth: 30 },
};
