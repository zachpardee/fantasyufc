import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../../../src/api/client';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDecimalOdds(american: number): number {
  return american >= 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}
function calcPayout(stake: number, dec: number): number {
  return Math.round(stake * dec * 100) / 100;
}
function fmtOdds(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  return (n < 0 ? '-$' : '$') + (abs % 1 === 0 ? abs.toFixed(0) : abs.toFixed(2));
}

// ── Pickem constants ──────────────────────────────────────────────────────────

const METHODS = [
  { value: 'ko_tko', label: 'KO/TKO' },
  { value: 'submission', label: 'SUB' },
  { value: 'decision', label: 'DEC' },
  { value: 'disqualification', label: 'DQ' },
] as const;

const METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO',
  submission: 'SUB',
  decision: 'DEC',
  disqualification: 'DQ',
};

type SingleBet = { clientId: string; fightId: string; fighterId: string; stake: string };
type ParlayLegs = Record<string, string>;

// ── Root screen: routes to staking or pickem ──────────────────────────────────

export default function PicksScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const { data: league } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: currentEvent, isLoading: eventLoading } = useQuery<any>({
    queryKey: ['picks-current-event', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/current-event`),
  });

  if (eventLoading)
    return (
      <View style={s.center}>
        <ActivityIndicator color="#c8102e" />
      </View>
    );

  if (!currentEvent) {
    return (
      <View style={s.center}>
        <Text style={s.emptyTitle}>No Upcoming Event</Text>
        <Text style={s.emptySub}>No scoring event is currently scheduled.</Text>
      </View>
    );
  }

  if (league?.leagueFormat === 'staking') {
    return <StakingScreen leagueId={leagueId!} currentEvent={currentEvent} />;
  }

  return <PickemScreen leagueId={leagueId!} currentEvent={currentEvent} />;
}

// ── Staking Screen ────────────────────────────────────────────────────────────

function StakingScreen({ leagueId, currentEvent }: { leagueId: string; currentEvent: any }) {
  const qc = useQueryClient();

  const [singles, setSingles] = useState<SingleBet[]>([]);
  const [parlayLegs, setParlayLegs] = useState<ParlayLegs>({});
  const [parlayStake, setParlayStake] = useState('');
  const [singlesTouched, setSinglesTouched] = useState(false);
  const [parlayTouched, setParlayTouched] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setSingles([]);
    setParlayLegs({});
    setParlayStake('');
    setSinglesTouched(false);
    setParlayTouched(false);
    setSaveError('');
  }, [currentEvent?.id]);

  const { data: betsData, refetch: refetchBets } = useQuery<any>({
    queryKey: ['staking-bets', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/staking/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
  });

  const fights: any[] = betsData?.fights ?? [];
  const weeklyBudget: number = betsData?.weeklyBudget ?? 100;
  const seasonBankroll: number = betsData?.seasonBankroll ?? 0;
  const serverUsed: number = betsData?.usedThisWeek ?? 0;

  const localSinglesTotal = singles.reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
  const localParlayTotal = parseFloat(parlayStake) || 0;
  const liveUsed = serverUsed + localSinglesTotal + localParlayTotal;
  const liveAvailable = weeklyBudget - liveUsed;

  const eventStart = currentEvent?.prelimsAt ?? currentEvent?.scheduledAt;
  const locked =
    currentEvent?.status === 'live' ||
    currentEvent?.status === 'completed' ||
    (!!eventStart && Date.now() >= new Date(eventStart).getTime() - 10 * 60 * 1000);

  // Parlay odds
  const parlayLegEntries = Object.entries(parlayLegs).filter(([, fid]) => !!fid);
  const parlayDecOdds = parlayLegEntries.reduce((prod, [fightId, fighterId]) => {
    const fight = fights.find((f) => f.id === fightId);
    if (!fight) return prod;
    const odds = fight.redFighterId === fighterId ? fight.redFighterOdds : fight.blueFighterOdds;
    return odds != null ? prod * toDecimalOdds(odds) : prod;
  }, 1);
  const parlayLegCount = parlayLegEntries.length;
  const parlayAmericanOdds =
    parlayDecOdds <= 1
      ? null
      : parlayDecOdds >= 2
        ? Math.round((parlayDecOdds - 1) * 100)
        : Math.round(-100 / (parlayDecOdds - 1));
  const parlayPotential =
    localParlayTotal > 0 && parlayLegCount >= 2 ? calcPayout(localParlayTotal, parlayDecOdds) : 0;

  const activeSingles = singles.filter((b) => b.fighterId);
  const uniqueFightIds = [...new Set(activeSingles.map((b) => b.fightId))];

  function addSingle(fightId: string, fighterId: string) {
    setSingles((prev) => [
      ...prev,
      { clientId: `${fightId}-${Date.now()}`, fightId, fighterId, stake: '' },
    ]);
    setSinglesTouched(true);
    // Auto-populate parlay with this fighter
    setParlayLegs((prev) => ({ ...prev, [fightId]: fighterId }));
  }
  function updateSingleStake(clientId: string, stake: string) {
    setSingles((prev) => prev.map((b) => (b.clientId === clientId ? { ...b, stake } : b)));
    setSinglesTouched(true);
  }
  function removeSingle(clientId: string) {
    setSingles((prev) => {
      const next = prev.filter((b) => b.clientId !== clientId);
      // If no more bets for that fight, remove from parlay
      const removedFightId = prev.find((b) => b.clientId === clientId)?.fightId;
      if (removedFightId && !next.some((b) => b.fightId === removedFightId)) {
        setParlayLegs((pl) => {
          const p = { ...pl };
          delete p[removedFightId];
          return p;
        });
      }
      return next;
    });
    setSinglesTouched(true);
  }
  function removeParlayLeg(fightId: string) {
    setParlayLegs((prev) => {
      const p = { ...prev };
      delete p[fightId];
      return p;
    });
    setParlayTouched(true);
  }

  const saveSinglesMutation = useMutation({
    mutationFn: () => {
      const bets = singles
        .map((b) => ({ fightId: b.fightId, fighterId: b.fighterId, stake: parseFloat(b.stake) }))
        .filter((b) => b.fighterId && !isNaN(b.stake) && b.stake > 0);
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent.id}/singles`, { bets });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save bets'),
  });

  const saveParlayMutation = useMutation({
    mutationFn: () => {
      const legs = Object.entries(parlayLegs)
        .filter(([, fid]) => !!fid)
        .map(([fightId, fighterId]) => ({ fightId, fighterId }));
      return apiClient.put(`/leagues/${leagueId}/staking/${currentEvent.id}/parlay`, {
        stake: parseFloat(parlayStake),
        legs,
      });
    },
    onError: (err: any) => setSaveError(err?.message ?? 'Failed to save parlay'),
  });

  const deleteSingleMutation = useMutation({
    mutationFn: (betId: string) =>
      apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent.id}/singles/${betId}`),
    onSuccess: () => refetchBets(),
  });

  const deleteParlayMutation = useMutation({
    mutationFn: (parlayId: string) =>
      apiClient.delete(`/leagues/${leagueId}/staking/${currentEvent.id}/parlays/${parlayId}`),
    onSuccess: () => refetchBets(),
  });

  async function saveAll() {
    setSaveError('');
    try {
      if (singlesTouched) await saveSinglesMutation.mutateAsync();
      if (parlayTouched && parlayLegCount >= 2 && parlayStake) {
        await saveParlayMutation.mutateAsync();
      }
      setSingles([]);
      setParlayLegs({});
      setParlayStake('');
      setSinglesTouched(false);
      setParlayTouched(false);
      refetchBets();
      qc.invalidateQueries({ queryKey: ['staking-bets', leagueId, currentEvent?.id] });
    } catch {
      /* errors handled in onError */
    }
  }

  const isSaving = saveSinglesMutation.isPending || saveParlayMutation.isPending;
  const anyUnsaved = singlesTouched || parlayTouched;

  const savedSingles: any[] = betsData?.singles ?? [];
  const savedParlays: any[] = betsData?.parlays ?? [];
  const pendingSingles = savedSingles.filter((s) => s.status === 'pending');
  const settledSingles = savedSingles.filter((s) => s.status !== 'pending');
  const pendingParlays = savedParlays.filter((p) => p.status === 'pending');
  const settledParlays = savedParlays.filter((p) => p.status !== 'pending');

  const eventName = currentEvent.name;
  const eventDateStr = eventStart
    ? (() => {
        const d = new Date(eventStart);
        return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
      })()
    : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eventName}>{eventName}</Text>
            {eventDateStr && <Text style={s.eventDate}>{eventDateStr}</Text>}
          </View>
          {locked && (
            <View style={st.lockedBadge}>
              <Text style={st.lockedBadgeText}>LOCKED</Text>
            </View>
          )}
        </View>

        {/* Balance bar */}
        <View style={st.balanceBar}>
          <BalanceStat label="Budget" value={fmtMoney(weeklyBudget)} />
          <View style={st.balanceDivider} />
          <BalanceStat
            label="At Stake"
            value={fmtMoney(liveUsed)}
            color={liveUsed > 0 ? '#ffd700' : '#555'}
          />
          <View style={st.balanceDivider} />
          <BalanceStat
            label="Available"
            value={fmtMoney(Math.max(0, liveAvailable))}
            color={liveAvailable < 0 ? '#ff5252' : '#4caf50'}
          />
          <View style={st.balanceDivider} />
          <BalanceStat
            label="Season P&L"
            value={(seasonBankroll >= 0 ? '+' : '') + fmtMoney(seasonBankroll)}
            color={seasonBankroll >= 0 ? '#4caf50' : '#ff5252'}
          />
        </View>

        {saveError ? <Text style={st.errorText}>{saveError}</Text> : null}

        {/* Fight cards */}
        <View style={st.sectionHeaderRow}>
          <Text style={st.sectionTitle}>FIGHTS</Text>
          {!locked && <Text style={st.sectionSub}>Tap a fighter to add a bet</Text>}
        </View>

        {fights.map((fight) => {
          const redBets = singles.filter(
            (b) => b.fightId === fight.id && b.fighterId === fight.redFighterId,
          ).length;
          const blueBets = singles.filter(
            (b) => b.fightId === fight.id && b.fighterId === fight.blueFighterId,
          ).length;
          return (
            <StakingFightCard
              key={fight.id}
              fight={fight}
              redBetCount={redBets}
              blueBetCount={blueBets}
              locked={locked}
              onPickRed={() => addSingle(fight.id, fight.redFighterId)}
              onPickBlue={() => addSingle(fight.id, fight.blueFighterId)}
            />
          );
        })}

        {/* Bet Slip */}
        {(activeSingles.length > 0 || parlayLegCount >= 2) && (
          <View style={st.slipSection}>
            <Text style={st.slipTitle}>BET SLIP</Text>

            {/* Parlay */}
            {parlayLegCount >= 2 && (
              <View style={st.slipBlock}>
                <View style={st.slipBlockHeader}>
                  <Text style={st.slipBlockTitle}>Parlay · {parlayLegCount} legs</Text>
                  {parlayAmericanOdds != null && (
                    <Text style={st.parlayOdds}>{fmtOdds(parlayAmericanOdds)}</Text>
                  )}
                </View>

                {/* Parlay legs */}
                {parlayLegEntries.map(([fightId, fighterId]) => {
                  const fight = fights.find((f) => f.id === fightId);
                  if (!fight) return null;
                  const isRed = fighterId === fight.redFighterId;
                  const name = isRed
                    ? `${fight.redFirstName} ${fight.redLastName}`
                    : `${fight.blueFirstName} ${fight.blueLastName}`;
                  const odds = isRed ? fight.redFighterOdds : fight.blueFighterOdds;
                  return (
                    <View key={fightId} style={st.legRow}>
                      {!locked && (
                        <TouchableOpacity
                          onPress={() => removeParlayLeg(fightId)}
                          style={st.removeBtn}
                        >
                          <Text style={st.removeBtnText}>✕</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={st.legName}>{name}</Text>
                        <Text style={st.legMatchup}>
                          {fight.redLastName} vs {fight.blueLastName}
                        </Text>
                      </View>
                      {odds != null && (
                        <Text style={[st.legOdds, { color: odds < 0 ? '#888' : '#4caf50' }]}>
                          {fmtOdds(odds)}
                        </Text>
                      )}
                    </View>
                  );
                })}

                {/* Parlay stake */}
                {!locked ? (
                  <View style={st.stakeRow}>
                    <View style={st.stakeInputWrap}>
                      <Text style={st.stakeDollar}>$</Text>
                      <TextInput
                        style={st.stakeInput}
                        value={parlayStake}
                        onChangeText={(v) => {
                          setParlayStake(v);
                          setParlayTouched(true);
                        }}
                        keyboardType="decimal-pad"
                        placeholder="Stake"
                        placeholderTextColor="#444"
                      />
                    </View>
                    {parlayPotential > 0 && (
                      <Text style={st.payoutText}>
                        Payout:{' '}
                        <Text style={{ color: '#4caf50' }}>{fmtMoney(parlayPotential)}</Text>
                      </Text>
                    )}
                  </View>
                ) : null}
              </View>
            )}

            {/* Singles */}
            {activeSingles.length > 0 && (
              <View style={st.slipBlock}>
                <Text style={st.slipBlockTitle}>Straights ({activeSingles.length})</Text>
                {activeSingles.map((bet) => {
                  const fight = fights.find((f) => f.id === bet.fightId);
                  if (!fight) return null;
                  const isRed = bet.fighterId === fight.redFighterId;
                  const name = isRed
                    ? `${fight.redFirstName} ${fight.redLastName}`
                    : `${fight.blueFirstName} ${fight.blueLastName}`;
                  const odds = isRed ? fight.redFighterOdds : fight.blueFighterOdds;
                  const stake = parseFloat(bet.stake) || 0;
                  const payout =
                    odds != null && stake > 0 ? calcPayout(stake, toDecimalOdds(odds)) : null;
                  return (
                    <View key={bet.clientId} style={st.legRow}>
                      {!locked && (
                        <TouchableOpacity
                          onPress={() => removeSingle(bet.clientId)}
                          style={st.removeBtn}
                        >
                          <Text style={st.removeBtnText}>✕</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={st.legName}>{name}</Text>
                        <Text style={st.legMatchup}>
                          {fight.redLastName} vs {fight.blueLastName}
                        </Text>
                        <View style={st.stakeRow}>
                          {!locked ? (
                            <View style={st.stakeInputWrap}>
                              <Text style={st.stakeDollar}>$</Text>
                              <TextInput
                                style={st.stakeInput}
                                value={bet.stake}
                                onChangeText={(v) => updateSingleStake(bet.clientId, v)}
                                keyboardType="decimal-pad"
                                placeholder="Stake"
                                placeholderTextColor="#444"
                              />
                            </View>
                          ) : null}
                          {payout != null && (
                            <Text style={st.payoutText}>Win {fmtMoney(payout)}</Text>
                          )}
                        </View>
                      </View>
                      {odds != null && (
                        <Text style={[st.legOdds, { color: odds < 0 ? '#888' : '#4caf50' }]}>
                          {fmtOdds(odds)}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Place Bets button */}
            {!locked && (
              <>
                {liveAvailable < 0 && (
                  <Text style={st.overBudget}>
                    Exceeds budget by {fmtMoney(Math.abs(liveAvailable))}
                  </Text>
                )}
                <TouchableOpacity
                  style={[
                    st.placeBetsBtn,
                    (!anyUnsaved || isSaving || liveAvailable < 0) && st.placeBetsBtnDisabled,
                  ]}
                  onPress={saveAll}
                  disabled={!anyUnsaved || isSaving || liveAvailable < 0}
                >
                  <Text style={st.placeBetsBtnText}>
                    {isSaving ? 'Placing Bets...' : anyUnsaved ? 'Place Bets' : 'Bets Placed'}
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Saved Bets */}
        {(savedSingles.length > 0 || savedParlays.length > 0) && (
          <View style={st.savedSection}>
            <Text style={st.slipTitle}>SAVED BETS</Text>

            {(pendingSingles.length > 0 || pendingParlays.length > 0) && (
              <>
                <Text style={st.savedSectionLabel}>PENDING</Text>
                {pendingSingles.map((bet) => (
                  <SavedSingleRow
                    key={bet.id}
                    bet={bet}
                    canDelete={!locked}
                    onDelete={() => deleteSingleMutation.mutate(bet.id)}
                  />
                ))}
                {pendingParlays.map((parlay) => (
                  <SavedParlayRow
                    key={parlay.id}
                    parlay={parlay}
                    canDelete={!locked}
                    onDelete={() => deleteParlayMutation.mutate(parlay.id)}
                  />
                ))}
              </>
            )}

            {(settledSingles.length > 0 || settledParlays.length > 0) && (
              <>
                <Text style={st.savedSectionLabel}>SETTLED</Text>
                {settledSingles.map((bet) => (
                  <SavedSingleRow key={bet.id} bet={bet} canDelete={false} onDelete={() => {}} />
                ))}
                {settledParlays.map((parlay) => (
                  <SavedParlayRow
                    key={parlay.id}
                    parlay={parlay}
                    canDelete={false}
                    onDelete={() => {}}
                  />
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BalanceStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={st.balanceStat}>
      <Text style={[st.balanceVal, color ? { color } : {}]}>{value}</Text>
      <Text style={st.balanceLabel}>{label}</Text>
    </View>
  );
}

function StakingFightCard({
  fight,
  redBetCount,
  blueBetCount,
  locked,
  onPickRed,
  onPickBlue,
}: {
  fight: any;
  redBetCount: number;
  blueBetCount: number;
  locked: boolean;
  onPickRed: () => void;
  onPickBlue: () => void;
}) {
  return (
    <View style={st.fightCard}>
      <Text style={st.fightCardMeta}>{fight.weightClassName}</Text>
      <View style={st.fightCardRow}>
        <TouchableOpacity style={st.stakeFighterBtn} onPress={onPickRed} disabled={locked}>
          {fight.redImageUrl ? (
            <Image source={{ uri: fight.redImageUrl }} style={st.fighterImg} resizeMode="cover" />
          ) : (
            <View style={st.fighterImgPlaceholder} />
          )}
          <Text style={st.stakeFighterName} numberOfLines={2}>
            {fight.redFirstName} {fight.redLastName}
          </Text>
          {fight.redFighterOdds != null && (
            <Text style={[st.oddsText, { color: fight.redFighterOdds < 0 ? '#999' : '#4caf50' }]}>
              {fmtOdds(fight.redFighterOdds)}
            </Text>
          )}
          {redBetCount > 0 && (
            <Text style={st.betPill}>
              {redBetCount} bet{redBetCount !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={st.vsText}>VS</Text>

        <TouchableOpacity
          style={[st.stakeFighterBtn, { alignItems: 'flex-end' }]}
          onPress={onPickBlue}
          disabled={locked}
        >
          {fight.blueImageUrl ? (
            <Image source={{ uri: fight.blueImageUrl }} style={st.fighterImg} resizeMode="cover" />
          ) : (
            <View style={st.fighterImgPlaceholder} />
          )}
          <Text style={[st.stakeFighterName, { textAlign: 'right' }]} numberOfLines={2}>
            {fight.blueFirstName} {fight.blueLastName}
          </Text>
          {fight.blueFighterOdds != null && (
            <Text style={[st.oddsText, { color: fight.blueFighterOdds < 0 ? '#999' : '#4caf50' }]}>
              {fmtOdds(fight.blueFighterOdds)}
            </Text>
          )}
          {blueBetCount > 0 && (
            <Text style={st.betPill}>
              {blueBetCount} bet{blueBetCount !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SavedSingleRow({
  bet,
  canDelete,
  onDelete,
}: {
  bet: any;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const stake = parseFloat(bet.stake) || 0;
  const odds: number | null = bet.odds ?? null;
  const pl = parseFloat(bet.profitLoss ?? '0');
  const isPending = bet.status === 'pending';
  const payout = odds != null && stake > 0 ? calcPayout(stake, toDecimalOdds(odds)) : null;
  return (
    <View style={st.savedRow}>
      {canDelete && (
        <TouchableOpacity onPress={onDelete} style={st.removeBtn}>
          <Text style={st.removeBtnText}>✕</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={st.savedName}>
          {bet.fighterFirstName} {bet.fighterLastName}
        </Text>
        {odds != null && (
          <Text style={[st.savedOdds, { color: odds < 0 ? '#888' : '#4caf50' }]}>
            {fmtOdds(odds)}
          </Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={st.savedStake}>{fmtMoney(stake)}</Text>
        {isPending ? (
          payout != null && <Text style={st.savedPotential}>Win {fmtMoney(payout)}</Text>
        ) : (
          <Text style={[st.savedPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252' }]}>
            {bet.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}
            {fmtMoney(pl)}
          </Text>
        )}
      </View>
    </View>
  );
}

function SavedParlayRow({
  parlay,
  canDelete,
  onDelete,
}: {
  parlay: any;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const legs: any[] = parlay.legs ?? [];
  const stake = parseFloat(parlay.stake) || 0;
  // Combine per-leg odds (an unpriced leg contributes 1.0), falling back to the stored
  // combined value. Keeps the payout correct for parlays that include an oddsless fight.
  const decOdds = legs.length
    ? legs.reduce(
        (acc: number, l: any) => acc * (l.decimalOdds != null ? parseFloat(l.decimalOdds) || 1 : 1),
        1,
      )
    : parseFloat(parlay.decimalOdds ?? '1') || 1;
  const pl = parseFloat(parlay.profitLoss ?? '0');
  const isPending = parlay.status === 'pending';
  const americanOdds =
    decOdds <= 1
      ? null
      : decOdds >= 2
        ? Math.round((decOdds - 1) * 100)
        : Math.round(-100 / (decOdds - 1));
  const payout = stake > 0 && decOdds > 1 ? calcPayout(stake, decOdds) : 0;
  return (
    <View style={st.savedRow}>
      {canDelete && (
        <TouchableOpacity onPress={onDelete} style={st.removeBtn}>
          <Text style={st.removeBtnText}>✕</Text>
        </TouchableOpacity>
      )}
      <View style={{ flex: 1 }}>
        <Text style={st.savedName}>{legs.length}-leg parlay</Text>
        {americanOdds != null && (
          <Text style={[st.savedOdds, { color: '#ffd700' }]}>{fmtOdds(americanOdds)}</Text>
        )}
        {legs.length > 0 && (
          <TouchableOpacity onPress={() => setOpen((v) => !v)}>
            <Text style={st.toggleLegs}>{open ? 'Hide legs ∧' : 'Show legs ∨'}</Text>
          </TouchableOpacity>
        )}
        {open &&
          legs.map((leg, i) => (
            <Text key={i} style={st.legItem}>
              <Text
                style={{
                  color:
                    leg.result === 'won' ? '#4caf50' : leg.result === 'lost' ? '#ff5252' : '#444',
                }}
              >
                {leg.result === 'won' ? '✓ ' : leg.result === 'lost' ? '✗ ' : '· '}
              </Text>
              {leg.fighterFirstName} {leg.fighterLastName}
            </Text>
          ))}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={st.savedStake}>{fmtMoney(stake)}</Text>
        {isPending ? (
          payout > 0 && <Text style={st.savedPotential}>Win {fmtMoney(payout)}</Text>
        ) : (
          <Text style={[st.savedPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252' }]}>
            {parlay.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}
            {fmtMoney(pl)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ── Pickem Screen ─────────────────────────────────────────────────────────────

function PickemScreen({ leagueId, currentEvent }: { leagueId: string; currentEvent: any }) {
  const qc = useQueryClient();
  const { width } = useWindowDimensions();

  const [localPicks, setLocalPicks] = useState<Record<string, string>>({});
  const [localMethods, setLocalMethods] = useState<Record<string, string>>({});
  const [localChampion, setLocalChampion] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const picksInitialized = useRef(false);
  const championInitialized = useRef(false);

  const { data: picksData } = useQuery<any>({
    queryKey: ['picks', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}`),
    enabled: !!currentEvent?.id,
    refetchInterval: (q) => (q.state.data?.eventStatus === 'live' ? 30_000 : false),
  });

  const { data: championData } = useQuery<any>({
    queryKey: ['picks-champion', leagueId, currentEvent?.id],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/picks/${currentEvent!.id}/champion`),
    enabled: !!currentEvent?.id,
  });

  useEffect(() => {
    if (!picksData?.fights) return;
    if (!picksInitialized.current) {
      picksInitialized.current = true;
      const picks: Record<string, string> = {};
      const methods: Record<string, string> = {};
      for (const f of picksData.fights) {
        if (f.pickedFighterId) picks[f.id] = f.pickedFighterId;
        if (f.pickedMethod) methods[f.id] = f.pickedMethod;
      }
      setLocalPicks(picks);
      setLocalMethods(methods);
      if (picksData.fights.some((f: any) => f.pickedFighterId)) setShowSummary(true);
    }
  }, [picksData]);

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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['picks-champion', leagueId, currentEvent?.id] }),
  });

  const fights: any[] = picksData?.fights ?? [];
  const locked: boolean = picksData?.locked ?? false;
  const totalFights = fights.length;
  const totalComplete = fights.filter((f) => localPicks[f.id] && localMethods[f.id]).length;

  const allFighters = fights.flatMap((fight: any) => [
    {
      id: fight.redFighterId,
      firstName: fight.redFirstName,
      lastName: fight.redLastName,
      imageUrl: fight.redImageUrl,
      fightId: fight.id,
      corner: 'red' as const,
    },
    {
      id: fight.blueFighterId,
      firstName: fight.blueFirstName,
      lastName: fight.blueLastName,
      imageUrl: fight.blueImageUrl,
      fightId: fight.id,
      corner: 'blue' as const,
    },
  ]);

  const eventDate = currentEvent.scheduledAt;

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.eventName}>{currentEvent.name}</Text>
          <Text style={s.eventDate}>
            {new Date(eventDate).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
        <View style={s.pickCount}>
          <Text
            style={[
              s.pickNum,
              { color: totalComplete === totalFights && totalFights > 0 ? '#4caf50' : '#c8102e' },
            ]}
          >
            {totalComplete}
          </Text>
          <Text style={s.pickDen}>/{totalFights}</Text>
        </View>
      </View>

      {locked && (
        <View style={s.lockedBanner}>
          <Text style={s.lockedText}>Locked — event is {picksData?.eventStatus}</Text>
        </View>
      )}

      {showSummary || locked ? (
        <>
          {fights.map((fight) => {
            const pickedId = localPicks[fight.id];
            const pickedRed = pickedId === fight.redFighterId;
            const pickedName = pickedId
              ? pickedRed
                ? `${fight.redFirstName} ${fight.redLastName}`
                : `${fight.blueFirstName} ${fight.blueLastName}`
              : null;
            const method = localMethods[fight.id];
            const isCorrect = fight.isCorrect;
            return (
              <View key={fight.id} style={s.summaryRow}>
                <View style={s.summaryFight}>
                  <Text style={s.summaryFightText}>
                    <Text style={s.redText}>{fight.redLastName}</Text>
                    <Text style={s.vsText}> v </Text>
                    <Text style={s.blueText}>{fight.blueLastName}</Text>
                  </Text>
                  <Text style={s.summaryMeta}>{fight.weightClassName}</Text>
                </View>
                <View style={s.summaryPick}>
                  {pickedName ? (
                    <>
                      <Text
                        style={[s.summaryPickName, { color: pickedRed ? '#e05555' : '#5599dd' }]}
                      >
                        {pickedName}
                      </Text>
                      {method && (
                        <Text style={s.summaryMethod}>{METHOD_LABEL[method] ?? method}</Text>
                      )}
                    </>
                  ) : (
                    <Text style={s.noPickText}>—</Text>
                  )}
                </View>
                {locked && (
                  <View style={s.summaryResult}>
                    {isCorrect === true && (
                      <Text style={s.correctText}>✓ +{(+fight.pointsEarned || 0).toFixed(0)}</Text>
                    )}
                    {isCorrect === false && <Text style={s.wrongText}>✗</Text>}
                    {isCorrect === null && pickedId && <Text style={s.pendingText}>–</Text>}
                  </View>
                )}
              </View>
            );
          })}

          {(championData || localChampion) && (
            <View style={s.champSummaryCard}>
              <Text style={s.champSummaryLabel}>★ Event Champion</Text>
              {championData ? (
                <View style={s.champSummaryRow}>
                  <Text style={s.champSummaryName}>
                    {championData.firstName} {championData.lastName}
                  </Text>
                  {locked &&
                    (championData.pointsEarned > 0 ? (
                      <Text style={s.champCorrectText}>+30 pts</Text>
                    ) : championData.resultWinnerId === null ? (
                      <Text style={s.champPendingText}>Pending</Text>
                    ) : (
                      <Text style={s.champWrongText}>✗ 0 pts</Text>
                    ))}
                </View>
              ) : (
                <Text style={s.noPickText}>No pick yet</Text>
              )}
            </View>
          )}

          {!locked && (
            <TouchableOpacity style={s.editBtn} onPress={() => setShowSummary(false)}>
              <Text style={s.editBtnText}>Edit Picks</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        <>
          {(() => {
            const earlyPrelims = fights.filter((f: any) => f.cardSegment === 'early_prelims');
            const prelims = fights.filter((f: any) => f.cardSegment === 'prelims');
            const mainCard = fights.filter(
              (f: any) => f.cardSegment !== 'early_prelims' && f.cardSegment !== 'prelims',
            );
            const segments = [
              { label: 'MAIN CARD', fights: mainCard },
              { label: 'PRELIMS', fights: prelims },
              { label: 'EARLY PRELIMS', fights: earlyPrelims },
            ].filter((seg) => seg.fights.length > 0);
            return segments.map((seg) => (
              <View key={seg.label}>
                {segments.length > 1 && (
                  <View style={s.segmentHeader}>
                    <Text style={s.segmentLabel}>{seg.label}</Text>
                  </View>
                )}
                {seg.fights.map((fight: any) => (
                  <FightCard
                    key={fight.id}
                    fight={fight}
                    picked={localPicks[fight.id]}
                    pickedMethod={localMethods[fight.id]}
                    locked={locked}
                    onPick={(fighterId) => setLocalPicks((p) => ({ ...p, [fight.id]: fighterId }))}
                    onMethod={(method) => setLocalMethods((p) => ({ ...p, [fight.id]: method }))}
                  />
                ))}
              </View>
            ));
          })()}

          {allFighters.length > 0 && (
            <View style={s.champSection}>
              <Text style={s.champTitle}>★ Event Champion</Text>
              <Text style={s.champSub}>Pick one fighter — +30 pts if they win</Text>
              <View style={[s.champGrid, { width: width - 32 }]}>
                {allFighters.map((fighter) => {
                  const isSelected = localChampion === fighter.id;
                  return (
                    <TouchableOpacity
                      key={fighter.id}
                      style={[s.champFighterBtn, isSelected && s.champFighterBtnSelected]}
                      onPress={() => {
                        if (locked) return;
                        const newId = isSelected ? null : fighter.id;
                        setLocalChampion(newId);
                        if (newId) championMutation.mutate(newId);
                      }}
                      disabled={locked}
                    >
                      {fighter.imageUrl ? (
                        <Image
                          source={{ uri: fighter.imageUrl }}
                          style={s.champFighterImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.champFighterImgPlaceholder} />
                      )}
                      <Text
                        style={[
                          s.champFighterName,
                          { color: fighter.corner === 'red' ? '#e05555' : '#5599dd' },
                          isSelected && s.champFighterNameSelected,
                        ]}
                        numberOfLines={2}
                      >
                        {fighter.firstName} {fighter.lastName}
                      </Text>
                      {isSelected && <Text style={s.champSelectedTag}>★ CHAMP</Text>}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[s.saveBtn, saveMutation.isPending && s.saveBtnDisabled]}
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Text style={s.saveBtnText}>
              {saveMutation.isPending
                ? 'Saving...'
                : `Save Picks (${totalComplete}/${totalFights})`}
            </Text>
          </TouchableOpacity>
          {saveMutation.isError && (
            <Text style={s.errorText}>Failed to save — please try again</Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

function FightCard({
  fight,
  picked,
  pickedMethod,
  locked,
  onPick,
  onMethod,
}: {
  fight: any;
  picked?: string;
  pickedMethod?: string;
  locked: boolean;
  onPick: (id: string) => void;
  onMethod: (m: string) => void;
}) {
  const winnerId = fight.resultWinnerId;
  const isCompleted = fight.status === 'completed' || winnerId != null;
  const methodRequired = !!picked && !pickedMethod && !locked && !isCompleted;
  return (
    <View style={s.fightCard}>
      {fight.isTitleFight && <Text style={s.titleTag}>TITLE FIGHT</Text>}
      <Text style={s.fightMeta}>
        {fight.weightClassName} · {fight.scheduledRounds}R
      </Text>
      <View style={s.matchup}>
        <FighterBtn
          name={`${fight.redFirstName} ${fight.redLastName}`}
          imageUrl={fight.redImageUrl}
          ranking={fight.redRanking}
          isChampion={fight.redIsChampion}
          odds={fight.redFighterOdds}
          corner="red"
          isPicked={picked === fight.redFighterId}
          isWinner={isCompleted && winnerId === fight.redFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.redFighterId}
          isCorrect={picked === fight.redFighterId ? fight.isCorrect : null}
          pointsEarned={fight.pointsEarned}
          locked={locked}
          onPress={() => onPick(fight.redFighterId)}
        />
        <Text style={s.vsText}>VS</Text>
        <FighterBtn
          name={`${fight.blueFirstName} ${fight.blueLastName}`}
          imageUrl={fight.blueImageUrl}
          ranking={fight.blueRanking}
          isChampion={fight.blueIsChampion}
          odds={fight.blueFighterOdds}
          corner="blue"
          isPicked={picked === fight.blueFighterId}
          isWinner={isCompleted && winnerId === fight.blueFighterId}
          isLoser={isCompleted && winnerId != null && winnerId !== fight.blueFighterId}
          isCorrect={picked === fight.blueFighterId ? fight.isCorrect : null}
          pointsEarned={fight.pointsEarned}
          locked={locked}
          onPress={() => onPick(fight.blueFighterId)}
        />
      </View>
      {picked && (
        <View style={s.methodRow}>
          {methodRequired && <Text style={s.methodRequired}>Choose method:</Text>}
          {METHODS.map((m) => {
            const isSelected = pickedMethod === m.value;
            const isOutcomeMatch =
              fight.resultOutcome &&
              (m.value === 'ko_tko'
                ? fight.resultOutcome === 'ko_tko'
                : m.value === 'submission'
                  ? fight.resultOutcome === 'submission'
                  : m.value === 'decision'
                    ? ['decision_unanimous', 'decision_split', 'decision_majority'].includes(
                        fight.resultOutcome,
                      )
                    : fight.resultOutcome === 'disqualification');
            return (
              <TouchableOpacity
                key={m.value}
                style={[
                  s.methodBtn,
                  isSelected && s.methodBtnSelected,
                  !!isOutcomeMatch && !isSelected && s.methodBtnMatch,
                ]}
                onPress={() => !locked && onMethod(isSelected ? '' : m.value)}
                disabled={locked}
              >
                <Text style={[s.methodBtnText, isSelected && s.methodBtnTextSelected]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      {fight.resultOutcome && (
        <Text style={s.resultOutcome}>
          {formatOutcome(fight.resultOutcome)} · R{fight.resultEndingRound ?? '?'}
        </Text>
      )}
    </View>
  );
}

function FighterBtn({
  name,
  imageUrl,
  ranking,
  isChampion,
  odds,
  corner,
  isPicked,
  isWinner,
  isLoser,
  isCorrect,
  pointsEarned,
  locked,
  onPress,
}: {
  name: string;
  imageUrl?: string | null;
  ranking?: number | null;
  isChampion?: boolean;
  odds?: number | null;
  corner: 'red' | 'blue';
  isPicked: boolean;
  isWinner: boolean;
  isLoser: boolean;
  isCorrect: boolean | null;
  pointsEarned?: number;
  locked: boolean;
  onPress: () => void;
}) {
  const borderColor = isPicked
    ? isCorrect === true
      ? '#4caf50'
      : isCorrect === false
        ? '#ff5252'
        : corner === 'red'
          ? '#c8102e'
          : '#1565c0'
    : isWinner
      ? '#4caf50'
      : '#2a2a2a';
  const isFavorite = odds != null && odds < 0;
  const oddsLabel = odds != null ? (odds > 0 ? `+${odds}` : `${odds}`) : null;
  return (
    <TouchableOpacity
      style={[
        s.fighterBtn,
        {
          borderColor,
          opacity: isLoser ? 0.35 : 1,
          backgroundColor: isPicked ? '#1a1a2e' : '#141414',
        },
      ]}
      onPress={onPress}
      disabled={locked}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={s.fighterBtnImg} resizeMode="cover" />
      ) : (
        <View style={s.fighterBtnImgPlaceholder} />
      )}
      <Text
        style={[s.fighterBtnName, { color: corner === 'red' ? '#e05555' : '#5599dd' }]}
        numberOfLines={2}
      >
        {name}
      </Text>
      <Text style={s.fighterRank}>{isChampion ? 'C' : ranking ? `#${ranking}` : 'NR'}</Text>
      {oddsLabel && (
        <Text style={[s.fighterOdds, { color: isFavorite ? '#888' : '#4ade80' }]}>{oddsLabel}</Text>
      )}
      {isPicked && isCorrect === true && (
        <Text style={s.pickResult}>✓ +{(+(pointsEarned ?? 0)).toFixed(0)}</Text>
      )}
      {isPicked && isCorrect === false && (
        <Text style={[s.pickResult, { color: '#ff5252' }]}>✗</Text>
      )}
      {isPicked && isCorrect === null && !locked && <Text style={s.pickedTag}>YOUR PICK</Text>}
    </TouchableOpacity>
  );
}

function formatOutcome(outcome: string) {
  const map: Record<string, string> = {
    ko_tko: 'KO/TKO',
    submission: 'SUB',
    decision_unanimous: 'DEC (U)',
    decision_split: 'DEC (S)',
    decision_majority: 'DEC (M)',
    draw: 'DRAW',
    no_contest: 'NC',
    disqualification: 'DQ',
  };
  return map[outcome] ?? outcome;
}

// ── Staking styles ─────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  lockedBadge: {
    backgroundColor: '#222',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  lockedBadgeText: { color: '#555', fontSize: 11, fontWeight: '700' },
  errorText: { color: '#ff6b6b', fontSize: 13, margin: 16, textAlign: 'center' },

  balanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  balanceStat: { flex: 1, alignItems: 'center', gap: 3 },
  balanceVal: { color: '#fff', fontSize: 14, fontWeight: '700' },
  balanceLabel: { color: '#444', fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  balanceDivider: { width: 1, height: 32, backgroundColor: '#222' },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: { color: '#444', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  sectionSub: { color: '#333', fontSize: 11 },

  fightCard: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#242424',
    borderRadius: 10,
    padding: 14,
    marginHorizontal: 12,
    marginBottom: 10,
  },
  fightCardMeta: {
    color: '#444',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  fightCardRow: { flexDirection: 'row', alignItems: 'center' },
  stakeFighterBtn: { flex: 1, padding: 8, borderRadius: 8, backgroundColor: '#1a1a1a' },
  fighterImg: { width: 40, height: 50, borderRadius: 4, backgroundColor: '#111', marginBottom: 6 },
  fighterImgPlaceholder: {
    width: 40,
    height: 50,
    borderRadius: 4,
    backgroundColor: '#111',
    marginBottom: 6,
  },
  stakeFighterName: { color: '#ddd', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  oddsText: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  betPill: {
    backgroundColor: '#c8102e33',
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '700',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  vsText: { color: '#333', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginHorizontal: 8 },

  slipSection: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
  },
  slipTitle: {
    color: '#555',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    padding: 14,
    backgroundColor: '#141414',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  slipBlock: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a', paddingBottom: 10 },
  slipBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingBottom: 8,
  },
  slipBlockTitle: { color: '#bbb', fontSize: 13, fontWeight: '700', padding: 12, paddingBottom: 4 },
  parlayOdds: { color: '#ffd700', fontSize: 18, fontWeight: '700', paddingRight: 12 },

  legRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#161616',
  },
  removeBtn: { padding: 4, marginTop: 2 },
  removeBtnText: { color: '#444', fontSize: 12 },
  legName: { color: '#ddd', fontSize: 13, fontWeight: '600' },
  legMatchup: { color: '#555', fontSize: 11, marginTop: 2 },
  legOdds: { fontSize: 13, fontWeight: '700', marginTop: 2 },

  stakeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  stakeInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 6,
    paddingLeft: 6,
    height: 32,
    width: 120,
  },
  stakeDollar: { color: '#555', fontSize: 12, fontWeight: '700' },
  stakeInput: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '700', paddingHorizontal: 6 },
  payoutText: { color: '#555', fontSize: 12 },

  overBudget: { color: '#ff5252', fontSize: 12, textAlign: 'center', paddingVertical: 6 },
  placeBetsBtn: {
    margin: 12,
    backgroundColor: '#c8102e',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  placeBetsBtnDisabled: { opacity: 0.4 },
  placeBetsBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  savedSection: {
    margin: 12,
    marginTop: 4,
    backgroundColor: '#111',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    overflow: 'hidden',
  },
  savedSectionLabel: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    color: '#333',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    backgroundColor: '#0d0d0d',
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#161616',
  },
  savedName: { color: '#ddd', fontSize: 13, fontWeight: '600' },
  savedOdds: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  savedStake: { color: '#fff', fontSize: 13, fontWeight: '700' },
  savedPotential: { color: '#555', fontSize: 11, marginTop: 2 },
  savedPnl: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  toggleLegs: { color: '#c8102e', fontSize: 11, marginTop: 4 },
  legItem: { color: '#777', fontSize: 11, marginTop: 3, paddingLeft: 4 },
});

// ── Pickem styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a',
    padding: 32,
  },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySub: { color: '#666', fontSize: 14, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerLeft: { flex: 1 },
  eventName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  eventDate: { color: '#666', fontSize: 12, marginTop: 2 },
  pickCount: { flexDirection: 'row', alignItems: 'baseline' },
  pickNum: { fontSize: 26, fontWeight: '800' },
  pickDen: { color: '#444', fontSize: 16, fontWeight: '700' },
  lockedBanner: {
    backgroundColor: '#1a1400',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  lockedText: { color: '#888', fontSize: 13, textAlign: 'center' },
  fightCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#1e1e1e',
    borderRadius: 10,
    padding: 14,
    margin: 12,
    marginBottom: 0,
  },
  segmentHeader: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 6 },
  segmentLabel: { color: '#c8102e', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  titleTag: {
    color: '#ffd700',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 4,
  },
  fightMeta: { color: '#555', fontSize: 12, marginBottom: 10 },
  matchup: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  vsText: { color: '#333', fontWeight: '700', fontSize: 12, alignSelf: 'center' },
  fighterBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
    minHeight: 120,
  },
  fighterBtnImg: { width: 56, height: 64, borderRadius: 6, marginBottom: 6 },
  fighterBtnImgPlaceholder: {
    width: 56,
    height: 64,
    borderRadius: 6,
    backgroundColor: '#2a2a2a',
    marginBottom: 6,
  },
  fighterBtnName: { fontSize: 12, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  fighterRank: { color: '#555', fontSize: 11, fontWeight: '600', marginTop: 2 },
  fighterOdds: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  pickedTag: {
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  pickResult: { color: '#4caf50', fontSize: 11, fontWeight: '700', marginTop: 4 },
  methodRequired: {
    color: '#c8102e',
    fontSize: 10,
    fontWeight: '700',
    width: '100%',
    marginBottom: 4,
    textAlign: 'center',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 5,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    minWidth: 60,
  },
  methodBtnSelected: { borderColor: '#c8102e', backgroundColor: '#1a0a0a' },
  methodBtnMatch: { borderColor: '#4caf5044' },
  methodBtnText: { color: '#666', fontSize: 12, fontWeight: '700' },
  methodBtnTextSelected: { color: '#c8102e' },
  resultOutcome: { color: '#555', fontSize: 11, textAlign: 'center', marginTop: 10 },
  champSection: {
    margin: 12,
    marginTop: 16,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2000',
  },
  champTitle: {
    color: '#ffd700',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  champSub: { color: '#555', fontSize: 11, marginBottom: 12 },
  champGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  champFighterBtn: {
    width: '31%',
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
  },
  champFighterBtnSelected: { borderColor: '#ffd700', backgroundColor: '#1a1600' },
  champFighterImg: { width: 44, height: 44, borderRadius: 22, marginBottom: 6 },
  champFighterImgPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2a2a2a',
    marginBottom: 6,
  },
  champFighterName: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 13,
    color: '#bbb',
  },
  champFighterNameSelected: { color: '#ffd700' },
  champSelectedTag: { color: '#ffd700', fontSize: 9, fontWeight: '800', marginTop: 2 },
  champSummaryCard: {
    margin: 12,
    marginTop: 8,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2000',
  },
  champSummaryLabel: {
    color: '#ffd700',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  champSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  champSummaryName: { color: '#ddd', fontSize: 14, fontWeight: '700' },
  champCorrectText: { color: '#4caf50', fontWeight: '700', fontSize: 13 },
  champWrongText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
  champPendingText: { color: '#888', fontSize: 12 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  summaryFight: { flex: 2 },
  summaryFightText: { fontSize: 13, fontWeight: '700' },
  redText: { color: '#c8102e' },
  blueText: { color: '#4488cc' },
  summaryMeta: { color: '#444', fontSize: 11, marginTop: 2 },
  summaryPick: { flex: 2, paddingHorizontal: 8 },
  summaryPickName: { fontSize: 13, fontWeight: '700' },
  summaryMethod: { color: '#666', fontSize: 11, marginTop: 2 },
  summaryResult: { flex: 1, alignItems: 'flex-end' },
  correctText: { color: '#4caf50', fontWeight: '700', fontSize: 13 },
  wrongText: { color: '#ff5252', fontWeight: '700', fontSize: 13 },
  pendingText: { color: '#555', fontSize: 13 },
  noPickText: { color: '#333', fontSize: 13 },
  editBtn: {
    margin: 16,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  editBtnText: { color: '#888', fontSize: 14, fontWeight: '600' },
  saveBtn: {
    margin: 16,
    backgroundColor: '#c8102e',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  errorText: { color: '#ff6b6b', fontSize: 13, textAlign: 'center', marginBottom: 16 },
});
