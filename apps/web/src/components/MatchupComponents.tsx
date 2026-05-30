import { Link } from 'react-router-dom';
import { FighterPhoto } from './FighterPhoto';

export type PhotoClickHandler = (url: string, name: string) => void;

export const METHOD_LABELS: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB',
  decision_unanimous: 'DEC (U)', decision_split: 'DEC (S)',
  decision_majority: 'DEC (M)', draw: 'DRAW',
  no_contest: 'NC', disqualification: 'DQ',
  decision: 'DEC',
};

export const PICK_METHOD_LABEL: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB',
  decision: 'DEC', decision_unanimous: 'DEC', decision_split: 'DEC', decision_majority: 'DEC',
  disqualification: 'DQ',
};

// ── Formatters ───────────────────────────────────────────────────────────────

export function fmtOddsAmerican(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}

export function decimalToAmerican(decimal: number): string {
  if (decimal <= 1) return '—';
  const american = decimal >= 2
    ? Math.round((decimal - 1) * 100)
    : Math.round(-100 / (decimal - 1));
  return fmtOddsAmerican(american);
}

export function fmtMoney(n: number): string {
  const abs = Math.abs(n);
  const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '$') + s;
}

export function fmtStakeScore(n: number): string {
  const abs = Math.abs(n);
  const s = abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2);
  return (n < 0 ? '-$' : '+$') + s;
}

export function fmtChipScore(n: number): string {
  const abs = Math.abs(n);
  const s = '$' + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  return n < 0 ? `(${s})` : s;
}

// ── Fight card ───────────────────────────────────────────────────────────────

export function MatchupFightList({ fights, onPhotoClick }: { fights: any[]; onPhotoClick?: PhotoClickHandler }) {
  if (fights.length === 0) return null;
  return (
    <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {fights.map((fight) => {
        const hasResult = !!fight.resultWinnerId || ['draw', 'no_contest', 'cancelled'].includes(fight.resultOutcome);
        const redWon = !!fight.resultWinnerId && fight.resultWinnerId === fight.redFighterId;
        const blueWon = !!fight.resultWinnerId && fight.resultWinnerId === fight.blueFighterId;
        const isVoidResult = ['draw', 'no_contest', 'cancelled'].includes(fight.resultOutcome);
        const voidLabel = fight.resultOutcome === 'draw' ? 'DRAW' : fight.resultOutcome === 'no_contest' ? 'NC' : 'CNCL';
        const fmtO = (n: number) => n >= 0 ? `+${n}` : `${n}`;
        return (
          <div key={fight.id} style={mb.fightCard}>
            <div style={mb.fightCardMeta}>
              <span style={mb.weightLabel}>{fight.weightClassName}</span>
              {hasResult && fight.resultOutcome && !isVoidResult && (
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
                  <div style={{ ...mb.fighterName, color: redWon ? '#fff' : '#ccc' }}>{fight.redFirstName}</div>
                  <div style={{ ...mb.fighterName, color: redWon ? '#fff' : '#ccc' }}>{fight.redLastName}</div>
                  {fight.redFighterOdds != null && <div style={mb.fighterOdds}>{fmtO(fight.redFighterOdds)}</div>}
                </div>
              </div>
              {isVoidResult
                ? <div style={mb.vsLabel}><span style={{ color: '#ffd700', fontSize: 8, fontWeight: 700, letterSpacing: 0.5 }}>{voidLabel}</span></div>
                : <div style={mb.vsLabel}>VS</div>
              }
              <div
                style={{ ...mb.fighterSide, flexDirection: 'row-reverse', opacity: hasResult && !blueWon ? 0.3 : 1, cursor: fight.blueImageUrl ? 'zoom-in' : 'default' }}
                onClick={() => fight.blueImageUrl && onPhotoClick?.(fight.blueImageUrl, `${fight.blueFirstName} ${fight.blueLastName}`)}
              >
                <FighterPhoto imageUrl={fight.blueImageUrl} name={`${fight.blueFirstName} ${fight.blueLastName}`} style={mb.photo} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...mb.fighterName, color: blueWon ? '#fff' : '#ccc' }}>{fight.blueFirstName}</div>
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

// ── Staking bet rows ─────────────────────────────────────────────────────────

export function MatchupParlayRow({ parlay }: { parlay: any }) {
  const stake = parseFloat(parlay.stake) || 0;
  const isPending = parlay.status === 'pending';
  const isVoidParlay = parlay.status === 'void';
  const pl = parseFloat(parlay.profitLoss);
  const potentialPayout = parseFloat(parlay.potentialPayout) || 0;
  const decimalOdds = parseFloat(parlay.decimalOdds) || 0;
  const legs: any[] = parlay.legs ?? [];
  const rowBg = !isPending && !isVoidParlay ? (parlay.status === 'won' ? 'rgba(76,175,80,0.08)' : 'rgba(255,82,82,0.08)') : undefined;

  return (
    <div style={{ ...mb.betRow, flexDirection: 'column', gap: 6, background: rowBg }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={mb.betLeft}>
          <div style={{ ...mb.betFighter, color: isPending ? '#ddd' : isVoidParlay ? '#555' : parlay.status === 'won' ? '#4caf50' : '#ff5252' }}>
            Parlay <span style={{ color: '#555', fontWeight: 400 }}>({legs.length} legs)</span>
          </div>
          {decimalOdds > 0 && (
            <div style={{ ...mb.betOdds, color: '#4caf50' }}>{decimalToAmerican(decimalOdds)}</div>
          )}
        </div>
        <div style={mb.betRight}>
          <div style={mb.betStake}>{fmtMoney(stake)}</div>
          {isPending
            ? <div style={mb.betPotential}>Win {fmtMoney(potentialPayout)}</div>
            : isVoidParlay
              ? <div style={{ ...mb.betPnl, color: '#555' }}>VOID</div>
              : <div style={{ ...mb.betPnl, color: pl >= 0 ? '#4caf50' : '#ff5252' }}>
                  {parlay.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
                </div>
          }
        </div>
      </div>
      {legs.map((leg: any, i: number) => (
        <div key={i} style={{ ...mb.parlayLeg, opacity: leg.result === 'void' ? 0.4 : 1 }}>
          <span style={{ ...mb.parlayLegName, textDecoration: leg.result === 'void' ? 'line-through' : 'none' }}>
            {leg.fighterFirstName} {leg.fighterLastName}
          </span>
          {leg.result === 'void'
            ? <span style={{ ...mb.parlayLegOdds, color: '#555' }}>VOID</span>
            : <span style={mb.parlayLegOdds}>{decimalToAmerican(parseFloat(leg.decimalOdds) || 0)}</span>
          }
        </div>
      ))}
    </div>
  );
}

export function MatchupBetRow({ bet }: { bet: any }) {
  const stake = parseFloat(bet.stake) || 0;
  const odds: number | null = bet.odds != null ? +bet.odds : null;
  const isPending = bet.status === 'pending';
  const isVoid = bet.status === 'void';
  const pl = parseFloat(bet.profitLoss);
  const potentialPayout = parseFloat(bet.potentialPayout) || 0;
  const rowBg = !isPending && !isVoid ? (bet.status === 'won' ? 'rgba(76,175,80,0.08)' : 'rgba(255,82,82,0.08)') : undefined;

  return (
    <div style={{ ...mb.betRow, background: rowBg }}>
      <div style={mb.betLeft}>
        <div style={{ ...mb.betFighter, color: isPending ? '#ddd' : isVoid ? '#555' : bet.status === 'won' ? '#4caf50' : '#ff5252' }}>
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
          : isVoid
            ? <div style={{ ...mb.betPnl, color: '#555' }}>VOID</div>
            : <div style={{ ...mb.betPnl, color: pl >= 0 ? '#4caf50' : '#ff5252' }}>
                {bet.status === 'won' ? '✓' : '✗'} {pl >= 0 ? '+' : ''}{fmtMoney(pl)}
              </div>
        }
      </div>
    </div>
  );
}

// ── Bet panel ────────────────────────────────────────────────────────────────

export function MatchupBetPanel({ teamName, singles, parlays, isLocked, isOwn, leagueId, isEventLive }: {
  teamName: string; singles: any[]; parlays: any[]; isLocked: boolean;
  isOwn?: boolean; leagueId?: string; isEventLive?: boolean;
}) {
  const pendingSingles = singles.filter((s: any) => s.status === 'pending');
  const settledSingles = singles.filter((s: any) => s.status !== 'pending');
  const pendingParlays = parlays.filter((p: any) => p.status === 'pending');
  const settledParlays = parlays.filter((p: any) => p.status !== 'pending');
  const totalStaked = [...singles, ...parlays].reduce((sum, b) => sum + (parseFloat(b.stake) || 0), 0);
  const totalPotential = [...pendingSingles, ...pendingParlays].reduce((sum, b) => sum + (parseFloat(b.potentialPayout) || 0), 0);
  const totalPnl = [...settledSingles, ...settledParlays].reduce((sum, b) => sum + (parseFloat(b.profitLoss) || 0), 0);
  const totalBets = singles.length + parlays.length;
  const showTotals = !isLocked && totalBets > 0;
  const hasSettled = settledSingles.length > 0 || settledParlays.length > 0;
  const hasPending = pendingSingles.length > 0 || pendingParlays.length > 0;

  return (
    <div style={mb.panel}>
      <div style={mb.header}>
        <span style={mb.headerTitle}>{teamName} Betslip</span>
        {totalBets > 0 && <span style={mb.badge}>{totalBets}</span>}
        {isOwn && leagueId && !isEventLive && (
          <Link to={`/league/${leagueId}/staking`} style={mb.editLink}>Edit Bets</Link>
        )}
      </div>
      {isLocked ? (
        <div style={mb.locked}>
          <div style={{ fontSize: 20, marginBottom: 6 }}>🔒</div>
          <div style={{ color: '#333', fontSize: 11, fontStyle: 'italic' }}>Revealed at event start</div>
        </div>
      ) : totalBets === 0 ? (
        <div style={mb.empty}>No bets placed</div>
      ) : (
        <>
          {hasPending && (
            <>
              <div style={mb.sectionLabel}>PENDING</div>
              {pendingSingles.map((s: any) => <MatchupBetRow key={s.id} bet={s} />)}
              {pendingParlays.map((p: any) => <MatchupParlayRow key={p.id} parlay={p} />)}
            </>
          )}
          {hasSettled && (
            <>
              <div style={mb.sectionLabel}>SETTLED</div>
              {settledSingles.map((s: any) => <MatchupBetRow key={s.id} bet={s} />)}
              {settledParlays.map((p: any) => <MatchupParlayRow key={p.id} parlay={p} />)}
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
          {hasPending && totalPotential > 0 && (
            <div style={mb.totalItem}>
              <span style={mb.totalLabel}>To win</span>
              <span style={{ ...mb.totalVal, color: '#4caf50' }}>{fmtMoney(totalPotential)}</span>
            </div>
          )}
          {hasSettled && (
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

// ── Pick panel ───────────────────────────────────────────────────────────────

export function MatchupPickPanel({ teamName, fights, champion, isLocked, isOwn, leagueId, locked }: {
  teamName: string; fights: any[]; champion: any; isLocked: boolean;
  isOwn?: boolean; leagueId?: string; locked?: boolean;
}) {
  const pickedCount = fights.filter((f) => f.pickedFighterId).length;

  return (
    <div style={mb.panel}>
      <div style={mb.header}>
        <span style={mb.headerTitle}>{teamName} Betslip</span>
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

// ── Staking bets section ─────────────────────────────────────────────────────

export function StakingBetsSection({ fights, homeStaking, awayStaking, homeTeamName, awayTeamName, isMeHome, isMeAway, isEventLive, leagueId, onPhotoClick }: {
  fights: any[]; homeStaking: any; awayStaking: any;
  homeTeamName: string; awayTeamName: string;
  isMeHome: boolean; isMeAway: boolean;
  isEventLive: boolean; leagueId?: string; onPhotoClick?: PhotoClickHandler;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <MatchupBetPanel
        teamName={homeTeamName}
        singles={homeStaking?.singles ?? []}
        parlays={homeStaking?.parlays ?? []}
        isLocked={!isMeHome && !isEventLive}
        isOwn={isMeHome}
        leagueId={leagueId}
        isEventLive={isEventLive}
      />
      <MatchupFightList fights={fights} onPhotoClick={onPhotoClick} />
      <MatchupBetPanel
        teamName={awayTeamName}
        singles={awayStaking?.singles ?? []}
        parlays={awayStaking?.parlays ?? []}
        isLocked={!isMeAway && !isEventLive}
        isOwn={isMeAway}
        leagueId={leagueId}
        isEventLive={isEventLive}
      />
    </div>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

export const mb: Record<string, React.CSSProperties> = {
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
  parlayLeg: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 10, borderLeft: '2px solid #222' },
  parlayLegName: { color: '#777', fontSize: 11 },
  parlayLegOdds: { color: '#444', fontSize: 10, fontWeight: 700 },
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
  fighterFirstName: { fontSize: 9, fontWeight: 400, lineHeight: 1.2, color: '#666' },
  fighterName: { fontSize: 11, fontWeight: 700, lineHeight: 1.2 },
  fighterOdds: { color: '#555', fontSize: 10 },
  vsLabel: { color: '#333', fontSize: 9, fontWeight: 700, flexShrink: 0, padding: '0 2px' },
};
