import axios from 'axios';
import { supabase } from './supabase';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

export const apiClient = axios.create({ baseURL: API_BASE });

apiClient.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => transformResponse(res.data),
  (err) => Promise.reject(err.response?.data ?? err),
);

function toCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

const NUMERIC_FIELDS = new Set([
  'homeScore', 'awayScore', 'totalPoints', 'homePoints', 'awayPoints',
  'averageFantasyPoints', 'memberCount',
  'wins', 'losses', 'ties', 'streak',
  'ranking', 'recordWins', 'recordLosses', 'recordDraws', 'recordNc',
  'fightCount', 'matchupCount',
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

function nestFighterRecord(obj: Record<string, unknown>): Record<string, unknown> {
  if (!('recordWins' in obj)) return obj;
  const { recordWins, recordLosses, recordDraws, recordNc, ...rest } = obj;
  return {
    ...rest,
    record: { wins: recordWins ?? 0, losses: recordLosses ?? 0, draws: recordDraws ?? 0, nc: recordNc ?? 0 },
  };
}

function transformResponse(data: unknown): unknown {
  const camelCased = transformKeys(data);
  if (Array.isArray(camelCased)) return camelCased.map((item) =>
    typeof item === 'object' && item !== null ? nestFighterRecord(item as Record<string, unknown>) : item,
  );
  if (typeof camelCased === 'object' && camelCased !== null) {
    return nestFighterRecord(camelCased as Record<string, unknown>);
  }
  return camelCased;
}
