// Recursively converts snake_case keys to camelCase and applies
// domain-specific shape fixes (e.g. flat record_wins → nested record.wins).

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

// Postgres NUMERIC columns arrive as strings — coerce known score/stat fields to numbers.
const NUMERIC_FIELDS = new Set([
  'homeScore', 'awayScore', 'totalPoints', 'homePoints', 'awayPoints',
  'averageFantasyPoints', 'memberCount',
  'wins', 'losses', 'ties', 'streak',
  'ranking', 'recordWins', 'recordLosses', 'recordDraws', 'recordNc',
  'fightCount', 'matchupCount',
  // staking fields
  'stake', 'potentialPayout', 'actualPayout', 'profitLoss',
  'stakingBalance', 'balance', 'pendingStake', 'decimalOdds',
  'redFighterOdds', 'blueFighterOdds',
  'redRecordWins', 'redRecordLosses', 'redRecordDraws',
  'blueRecordWins', 'blueRecordLosses', 'blueRecordDraws',
  'koTkoWins', 'submissionWins', 'resultEndingRound',
]);

function transformKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(transformKeys);
  if (obj === null || typeof obj !== 'object') return obj;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
    const camel = toCamel(key);
    const transformed = transformKeys(val);
    out[camel] = NUMERIC_FIELDS.has(camel) && typeof transformed === 'string'
      ? parseFloat(transformed)
      : transformed;
  }
  return out;
}

// After camelCasing, fighters have recordWins/recordLosses/recordDraws/recordNc
// as flat fields. Roll them into a nested record object to match the shared type.
function nestFighterRecord(obj: Record<string, unknown>): Record<string, unknown> {
  if (!('recordWins' in obj)) return obj;
  const { recordWins, recordLosses, recordDraws, recordNc, ...rest } = obj;
  return {
    ...rest,
    record: { wins: recordWins ?? 0, losses: recordLosses ?? 0, draws: recordDraws ?? 0, nc: recordNc ?? 0 },
  };
}

export function transformResponse(data: unknown): unknown {
  const camelCased = transformKeys(data);
  if (Array.isArray(camelCased)) return camelCased.map((item) =>
    typeof item === 'object' && item !== null ? nestFighterRecord(item as Record<string, unknown>) : item,
  );
  if (typeof camelCased === 'object' && camelCased !== null) {
    return nestFighterRecord(camelCased as Record<string, unknown>);
  }
  return camelCased;
}
