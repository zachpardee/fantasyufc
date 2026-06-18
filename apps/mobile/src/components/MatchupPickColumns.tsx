import { View, Text, Image, StyleSheet } from 'react-native';

// ── Helpers ───────────────────────────────────────────────────────────────────

const COUNTRY_TO_CODE: Record<string, string> = {
  'Afghanistan': 'AF', 'Albania': 'AL', 'Algeria': 'DZ', 'Argentina': 'AR',
  'Armenia': 'AM', 'Australia': 'AU', 'Austria': 'AT', 'Azerbaijan': 'AZ',
  'Bahrain': 'BH', 'Belarus': 'BY', 'Belgium': 'BE', 'Bolivia': 'BO',
  'Bosnia and Herzegovina': 'BA', 'Brazil': 'BR', 'Bulgaria': 'BG',
  'Cameroon': 'CM', 'Canada': 'CA', 'Chile': 'CL', 'China': 'CN',
  'Colombia': 'CO', 'Costa Rica': 'CR', 'Croatia': 'HR', 'Cuba': 'CU',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Denmark': 'DK',
  'Dominican Republic': 'DO', 'Ecuador': 'EC', 'Egypt': 'EG',
  'England': 'GB', 'Estonia': 'EE', 'Ethiopia': 'ET', 'Finland': 'FI',
  'France': 'FR', 'Georgia': 'GE', 'Germany': 'DE', 'Ghana': 'GH',
  'Great Britain': 'GB', 'Greece': 'GR', 'Hungary': 'HU', 'Iceland': 'IS',
  'India': 'IN', 'Indonesia': 'ID', 'Iran': 'IR', 'Iraq': 'IQ',
  'Ireland': 'IE', 'Israel': 'IL', 'Italy': 'IT', 'Jamaica': 'JM',
  'Japan': 'JP', 'Jordan': 'JO', 'Kazakhstan': 'KZ', 'Kenya': 'KE',
  'Kyrgyzstan': 'KG', 'Latvia': 'LV', 'Lithuania': 'LT', 'Malaysia': 'MY',
  'Mexico': 'MX', 'Moldova': 'MD', 'Mongolia': 'MN', 'Montenegro': 'ME',
  'Morocco': 'MA', 'Netherlands': 'NL', 'New Zealand': 'NZ',
  'Nigeria': 'NG', 'North Macedonia': 'MK', 'Northern Ireland': 'GB',
  'Norway': 'NO', 'Pakistan': 'PK', 'Panama': 'PA', 'Paraguay': 'PY',
  'Peru': 'PE', 'Philippines': 'PH', 'Poland': 'PL', 'Portugal': 'PT',
  'Puerto Rico': 'PR', 'Romania': 'RO', 'Russia': 'RU',
  'Saudi Arabia': 'SA', 'Scotland': 'GB', 'Senegal': 'SN', 'Serbia': 'RS',
  'Slovakia': 'SK', 'Slovenia': 'SI', 'South Africa': 'ZA',
  'South Korea': 'KR', 'Korea': 'KR', 'Spain': 'ES', 'Sweden': 'SE',
  'Switzerland': 'CH', 'Tajikistan': 'TJ', 'Thailand': 'TH',
  'Turkey': 'TR', 'Turkmenistan': 'TM', 'Ukraine': 'UA',
  'United Kingdom': 'GB', 'United States': 'US', 'USA': 'US',
  'Uruguay': 'UY', 'Uzbekistan': 'UZ', 'Venezuela': 'VE', 'Vietnam': 'VN',
  'Wales': 'GB',
};

function countryFlag(nationality: string | null | undefined): string {
  if (!nationality) return '';
  const code = COUNTRY_TO_CODE[nationality];
  if (!code) return '';
  return [...code].map((c) => String.fromCodePoint(0x1F1E6 - 65 + c.charCodeAt(0))).join('');
}

function fmtOdds(n: number | null | undefined): string {
  if (n == null) return '';
  return n >= 0 ? `+${n}` : `${n}`;
}

const METHOD_LABELS: Record<string, string> = {
  ko_tko: 'KO/TKO', submission: 'SUB', decision_unanimous: 'DEC',
  decision_split: 'SDEC', decision_majority: 'MDEC',
  disqualification: 'DQ', no_contest: 'NC', draw: 'DRAW',
};

// ── Fighter photo (with silhouette fallback) ──────────────────────────────────

function FighterPhoto({ imageUrl, flipped }: { imageUrl?: string | null; flipped?: boolean }) {
  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[s.photo, flipped && s.photoFlipped]}
        resizeMode="cover"
      />
    );
  }
  return <View style={[s.photo, s.photoFallback, flipped && s.photoFlipped]} />;
}

// ── Main fight card ───────────────────────────────────────────────────────────

function FightCard({ fight, homePick, awayPick, locked, showPicks = true, highlightMine = false }: {
  fight: any; homePick: any; awayPick: any; locked: boolean; showPicks?: boolean; highlightMine?: boolean;
}) {
  const hasResult = !!fight.resultWinnerId || ['draw', 'no_contest', 'cancelled'].includes(fight.resultOutcome);
  const redWon = fight.resultWinnerId === fight.redFighterId;
  const blueWon = fight.resultWinnerId === fight.blueFighterId;
  const isVoid = ['draw', 'no_contest', 'cancelled'].includes(fight.resultOutcome);
  const resultLabel = isVoid
    ? (METHOD_LABELS[fight.resultOutcome] ?? fight.resultOutcome?.toUpperCase())
    : hasResult
      ? [METHOD_LABELS[fight.resultOutcome], fight.resultEndingRound != null ? `R${fight.resultEndingRound}` : null].filter(Boolean).join(' · ')
      : null;

  const homePickedId = homePick?.pickedFighterId ?? null;
  const awayPickedId = awayPick?.pickedFighterId ?? null;
  const homePickedRed = homePickedId === fight.redFighterId;
  const awayPickedRed = awayPickedId === fight.redFighterId;

  const redFlag = countryFlag(fight.redNationality);
  const blueFlag = countryFlag(fight.blueNationality);

  return (
    <View style={s.fightCard}>
      {/* Weight class + result */}
      <View style={s.fightMeta}>
        <Text style={s.weightClass}>{fight.weightClassName ?? ''}</Text>
        {resultLabel != null && (
          <Text style={[s.resultLabel, isVoid && { color: '#ffd700' }]}>{resultLabel}</Text>
        )}
      </View>

      {/* Fighter row: photo + name + odds + flag */}
      <View style={s.fightersRow}>
        {/* Red corner */}
        <View style={[s.fighterSide, hasResult && !redWon && !isVoid && s.fighterDimmed]}>
          <FighterPhoto imageUrl={fight.redImageUrl} />
          <View style={s.fighterInfo}>
            <Text style={[s.fighterFirst, redWon && s.fighterWon]} numberOfLines={1}>{fight.redFirstName ?? ''}</Text>
            <Text style={[s.fighterLast, redWon && s.fighterWon]} numberOfLines={1}>{fight.redLastName ?? ''}</Text>
            <View style={s.fighterOddsRow}>
              {fight.redFighterOdds != null && (
                <Text style={[s.odds, fight.redFighterOdds >= 0 && s.oddsUnderdog]}>{fmtOdds(fight.redFighterOdds)}</Text>
              )}
              {redFlag ? <Text style={s.flag}>{redFlag}</Text> : null}
            </View>
          </View>
        </View>

        {/* VS / result center */}
        <View style={s.vsBlock}>
          {hasResult && !isVoid
            ? <Text style={s.vsText}>–</Text>
            : <Text style={s.vsText}>VS</Text>}
        </View>

        {/* Blue corner */}
        <View style={[s.fighterSide, s.fighterSideBlue, hasResult && !blueWon && !isVoid && s.fighterDimmed]}>
          <View style={[s.fighterInfo, s.fighterInfoRight]}>
            <Text style={[s.fighterFirst, blueWon && s.fighterWon, { textAlign: 'right' }]} numberOfLines={1}>{fight.blueFirstName ?? ''}</Text>
            <Text style={[s.fighterLast, blueWon && s.fighterWon, { textAlign: 'right' }]} numberOfLines={1}>{fight.blueLastName ?? ''}</Text>
            <View style={[s.fighterOddsRow, s.fighterOddsRowRight]}>
              {blueFlag ? <Text style={s.flag}>{blueFlag}</Text> : null}
              {fight.blueFighterOdds != null && (
                <Text style={[s.odds, fight.blueFighterOdds >= 0 && s.oddsUnderdog]}>{fmtOdds(fight.blueFighterOdds)}</Text>
              )}
            </View>
          </View>
          <FighterPhoto imageUrl={fight.blueImageUrl} flipped />
        </View>
      </View>

      {/* Pick row */}
      {showPicks && (
        <View style={s.pickRow}>
          <PickBadge
            pick={homePick}
            pickedRed={homePickedRed}
            fight={fight}
            locked={locked}
            align="left"
            mine={highlightMine}
          />
          <PickBadge
            pick={awayPick}
            pickedRed={awayPickedRed}
            fight={fight}
            locked={locked}
            align="right"
          />
        </View>
      )}
    </View>
  );
}

function PickBadge({ pick, pickedRed, fight, locked, align, mine = false }: {
  pick: any; pickedRed: boolean; fight: any; locked: boolean; align: 'left' | 'right'; mine?: boolean;
}) {
  if (!pick?.pickedFighterId) {
    return (
      <View style={[s.pickBadge, align === 'right' && s.pickBadgeRight, mine && s.pickBadgeMine]}>
        {mine && <Text style={[s.pickMineLabel, { textAlign: align }]}>YOUR PICK</Text>}
        <Text style={s.pickNone}>—</Text>
      </View>
    );
  }

  const firstName = pickedRed ? (fight.redFirstName ?? '') : (fight.blueFirstName ?? '');
  const lastName = pickedRed ? (fight.redLastName ?? '') : (fight.blueLastName ?? '');
  const isCorrect = pick.isCorrect;
  const pts = +(pick.pointsEarned ?? 0);

  const badgeColor = locked
    ? isCorrect === true ? '#4caf5022' : isCorrect === false ? '#ff525222' : '#ffffff0a'
    : '#ffffff0a';
  const borderColor = mine
    ? '#c8102e'
    : locked
      ? isCorrect === true ? '#4caf5066' : isCorrect === false ? '#ff525244' : '#2a2a2a'
      : '#2a2a2a';

  return (
    <View style={[s.pickBadge, align === 'right' && s.pickBadgeRight, mine && s.pickBadgeMine, { backgroundColor: badgeColor, borderColor }]}>
      {mine && <Text style={[s.pickMineLabel, { textAlign: align }]}>YOUR PICK</Text>}
      <Text style={[s.pickName, { textAlign: align }, mine && s.pickNameMine, locked && isCorrect === false && s.pickWrong]} numberOfLines={1}>
        {firstName} {lastName}
      </Text>
      {locked && isCorrect === true && <Text style={[s.pickResult, s.pickCorrect, { textAlign: align }]}>+{pts.toFixed(0)}</Text>}
      {locked && isCorrect === false && <Text style={[s.pickResult, s.pickWrong, { textAlign: align }]}>✗</Text>}
      {locked && isCorrect === null && <Text style={[s.pickResult, { color: '#555', textAlign: align }]}>–</Text>}
    </View>
  );
}

// ── Pickem columns ────────────────────────────────────────────────────────────

export function PicksColumns({ homePicks, awayPicks, homeChampion, awayChampion, locked, showPicks = true, highlightMine = false }: {
  homePicks: any[]; awayPicks: any[];
  homeChampion: any; awayChampion: any;
  locked: boolean;
  showPicks?: boolean;
  highlightMine?: boolean;
}) {
  const fights = homePicks.length > 0 ? homePicks : awayPicks;
  if (fights.length === 0) {
    return (
      <View style={s.emptyPicks}>
        <Text style={s.emptyPicksText}>
          {showPicks ? (locked ? 'No picks for this event' : 'Picks hidden until event starts') : 'No fights posted yet'}
        </Text>
      </View>
    );
  }

  return (
    <>
      {fights.map((fight: any, i: number) => (
        <FightCard key={fight.id ?? i} fight={fight} homePick={homePicks[i]} awayPick={awayPicks[i]} locked={locked} showPicks={showPicks} highlightMine={highlightMine} />
      ))}

      {showPicks && (homeChampion || awayChampion) && (
        <View style={s.champCard}>
          <Text style={s.champCardLabel}>★ Event Champion</Text>
          <View style={s.champCardRow}>
            <View style={s.champSide}>
              <ChampionDisplay champion={homeChampion} />
            </View>
            <Text style={s.champVs}>vs</Text>
            <View style={[s.champSide, s.champSideRight]}>
              <ChampionDisplay champion={awayChampion} align="right" />
            </View>
          </View>
        </View>
      )}
    </>
  );
}

function ChampionDisplay({ champion, align = 'left' }: { champion: any; align?: 'left' | 'right' }) {
  if (!champion) return <Text style={s.champNoPick}>—</Text>;
  return (
    <>
      <Text style={[s.champName, { textAlign: align }]}>{champion.firstName} {champion.lastName}</Text>
      {champion.pointsEarned > 0
        ? <Text style={[s.champWon, { textAlign: align }]}>+30 pts</Text>
        : champion.resultWinnerId === null
          ? <Text style={[s.champPending, { textAlign: align }]}>Pending</Text>
          : <Text style={[s.champLost, { textAlign: align }]}>✗</Text>}
    </>
  );
}

// ── Staking columns ───────────────────────────────────────────────────────────

export function StakingColumns({ homeStaking, awayStaking }: { homeStaking: any; awayStaking: any }) {
  if (!homeStaking && !awayStaking) {
    return (
      <View style={s.emptyPicks}>
        <Text style={s.emptyPicksText}>No bet data available</Text>
      </View>
    );
  }

  return (
    <View style={s.stakingContainer}>
      <StakingSide staking={homeStaking} align="left" />
      <View style={s.stakingDivider} />
      <StakingSide staking={awayStaking} align="right" />
    </View>
  );
}

function StakingSide({ staking, align }: { staking: any; align: 'left' | 'right' }) {
  const singles: any[] = staking?.singles ?? [];
  const parlays: any[] = staking?.parlays ?? [];

  if (singles.length === 0 && parlays.length === 0) {
    return (
      <View style={s.stakingSide}>
        <Text style={[s.noBets, { textAlign: align }]}>No bets</Text>
      </View>
    );
  }

  return (
    <View style={s.stakingSide}>
      {singles.map((bet: any) => {
        const pl = +(bet.profitLoss ?? 0);
        const isPending = bet.status === 'pending';
        return (
          <View key={bet.id} style={[s.betRow, align === 'right' && s.betRowRight]}>
            <Text style={[s.betFighter, { textAlign: align }]} numberOfLines={1}>
              {bet.fighterFirstName} {bet.fighterLastName}
            </Text>
            <Text style={[s.betStake, { textAlign: align }]}>${(+(bet.stake ?? 0)).toFixed(0)}</Text>
            {isPending
              ? <Text style={[s.betPending, { textAlign: align }]}>Pending</Text>
              : <Text style={[s.betPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252', textAlign: align }]}>
                  {pl >= 0 ? '+' : ''}{pl >= 0 ? '$' : '-$'}{Math.abs(pl).toFixed(0)}
                </Text>
            }
          </View>
        );
      })}
      {parlays.map((parlay: any) => {
        const legs: any[] = parlay.legs ?? [];
        const pl = +(parlay.profitLoss ?? 0);
        const isPending = parlay.status === 'pending';
        return (
          <View key={parlay.id} style={[s.betRow, align === 'right' && s.betRowRight]}>
            <Text style={[s.betFighter, { textAlign: align }]}>{legs.length}-leg parlay</Text>
            <Text style={[s.betStake, { textAlign: align }]}>${(+(parlay.stake ?? 0)).toFixed(0)}</Text>
            {isPending
              ? <Text style={[s.betPending, { textAlign: align }]}>Pending</Text>
              : <Text style={[s.betPnl, { color: pl >= 0 ? '#4caf50' : '#ff5252', textAlign: align }]}>
                  {pl >= 0 ? '+' : ''}{pl >= 0 ? '$' : '-$'}{Math.abs(pl).toFixed(0)}
                </Text>
            }
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // Fight card
  fightCard: {
    borderBottomWidth: 1, borderBottomColor: '#111',
    paddingVertical: 6,
  },
  fightMeta: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, marginBottom: 4,
  },
  weightClass: { color: '#444', fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
  resultLabel: { color: '#888', fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  fightersRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },

  fighterSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fighterSideBlue: { flexDirection: 'row-reverse' },
  fighterDimmed: { opacity: 0.3 },

  photo: { width: 40, height: 50, borderRadius: 4, backgroundColor: '#181818' },
  photoFlipped: { transform: [{ scaleX: -1 }] },
  photoFallback: { backgroundColor: '#181818' },

  fighterInfo: { flex: 1, gap: 1 },
  fighterInfoRight: { alignItems: 'flex-end' },
  fighterFirst: { color: '#888', fontSize: 10, lineHeight: 13 },
  fighterLast: { color: '#ddd', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  fighterWon: { color: '#4caf50' },
  fighterOddsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fighterOddsRowRight: { justifyContent: 'flex-end' },
  odds: { color: '#555', fontSize: 10, fontWeight: '600' },
  oddsUnderdog: { color: '#4caf50' },
  flag: { fontSize: 12, lineHeight: 14 },

  vsBlock: { width: 30, alignItems: 'center' },
  vsText: { color: '#2a2a2a', fontSize: 10, fontWeight: '800' },

  // Pick badges
  pickRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, marginTop: 5 },
  pickBadge: {
    flex: 1, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: '#2a2a2a',
    backgroundColor: '#ffffff0a',
  },
  pickBadgeRight: {},
  pickBadgeMine: { backgroundColor: '#c8102e14', borderColor: '#c8102e' },
  pickMineLabel: { color: '#c8102e', fontSize: 8, fontWeight: '800', letterSpacing: 0.5, marginBottom: 1 },
  pickNone: { color: '#2a2a2a', fontSize: 12, textAlign: 'center' },
  pickName: { color: '#bbb', fontSize: 12, fontWeight: '600' },
  pickNameMine: { color: '#fff' },
  pickWrong: { color: '#ff5252' },
  pickResult: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  pickCorrect: { color: '#4caf50' },

  // Empty state
  emptyPicks: { padding: 24, alignItems: 'center' },
  emptyPicksText: { color: '#444', fontSize: 13, textAlign: 'center' },

  // Champion
  champCard: {
    margin: 12, backgroundColor: '#0d0d00', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#2a2200',
  },
  champCardLabel: { color: '#ffd700', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginBottom: 10 },
  champCardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  champSide: { flex: 1 },
  champSideRight: { alignItems: 'flex-end' },
  champVs: { color: '#333', fontSize: 11, fontWeight: '700', paddingHorizontal: 10, marginTop: 2 },
  champName: { color: '#ddd', fontSize: 13, fontWeight: '700' },
  champWon: { color: '#4caf50', fontSize: 12, fontWeight: '700', marginTop: 2 },
  champLost: { color: '#ff5252', fontSize: 12, fontWeight: '700', marginTop: 2 },
  champPending: { color: '#888', fontSize: 11, marginTop: 2 },
  champNoPick: { color: '#333', fontSize: 13 },

  // Staking
  stakingContainer: { flexDirection: 'row', padding: 12 },
  stakingDivider: { width: 1, backgroundColor: '#1a1a1a', marginHorizontal: 8 },
  stakingSide: { flex: 1 },
  noBets: { color: '#333', fontSize: 12, padding: 8 },
  betRow: { marginBottom: 10 },
  betRowRight: { alignItems: 'flex-end' },
  betFighter: { color: '#bbb', fontSize: 12, fontWeight: '600' },
  betStake: { color: '#555', fontSize: 11, marginTop: 1 },
  betPending: { color: '#444', fontSize: 11, marginTop: 1 },
  betPnl: { fontSize: 12, fontWeight: '700', marginTop: 1 },
});
