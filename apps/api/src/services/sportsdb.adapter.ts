// TheSportsDB free tier API — provides fight results with method, round, and time
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';

export type FightMethod =
  | 'ko_tko'
  | 'submission'
  | 'decision_unanimous'
  | 'decision_split'
  | 'decision_majority'
  | 'no_contest'
  | 'disqualification'
  | 'draw';

export interface ParsedFightResult {
  winnerName: string;
  loserName: string;
  method: FightMethod;
  round: number;
  timeSeconds: number;
  weightClassText: string;
  isDraw: boolean;
  isNC: boolean;
}

export interface SportsDbEvent {
  sportsDbId: string;
  name: string;
  date: string;
  results: ParsedFightResult[];
}

export async function searchEventResults(eventName: string): Promise<SportsDbEvent | null> {
  try {
    const url = `${SPORTSDB_BASE}/searchevents.php?e=${encodeURIComponent(eventName)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const event = data?.event?.[0];
    if (!event) return null;

    const results = parseResultsString(event.strResult ?? '');

    return {
      sportsDbId: event.idEvent,
      name: event.strEvent,
      date: event.strTimestamp,
      results,
    };
  } catch {
    return null;
  }
}

export async function fetchEventResultsById(sportsDbId: string): Promise<SportsDbEvent | null> {
  try {
    const url = `${SPORTSDB_BASE}/lookupevent.php?id=${sportsDbId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;

    const data = await res.json() as any;
    const event = data?.events?.[0];
    if (!event) return null;

    const results = parseResultsString(event.strResult ?? '');

    return {
      sportsDbId: event.idEvent,
      name: event.strEvent,
      date: event.strTimestamp,
      results,
    };
  } catch {
    return null;
  }
}

// Parse the strResult text block format:
// "WeightClass\tWinner\tdef.\tLoser\tMethod\tRound\tTime\n..."
export function parseResultsString(raw: string): ParsedFightResult[] {
  const results: ParsedFightResult[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Skip section headers like "Main card (PPV)" or "Preliminary card"
    if (!line.includes('\t') && !line.includes('def.') && !line.includes('Draw') && !line.includes('NC')) {
      continue;
    }

    const parts = line.split('\t').map((p) => p.trim());

    // Format: WeightClass | Fighter A | def. | Fighter B | Method | Round | Time
    // OR: WeightClass | Fighter A | vs. | Fighter B | Draw | - | -
    if (parts.length < 5) continue;

    const weightClassText = parts[0] ?? '';
    const nameA = parts[1] ?? '';
    const verb = parts[2] ?? '';
    const nameB = parts[3] ?? '';
    const methodRaw = parts[4] ?? '';
    const roundStr = parts[5] ?? '0';
    const timeStr = parts[6] ?? '0:00';

    const round = parseInt(roundStr) || 1;
    const timeSeconds = parseTimeToSeconds(timeStr);

    if (verb === 'def.' || verb.toLowerCase().includes('def')) {
      results.push({
        winnerName: nameA,
        loserName: nameB,
        method: parseMethod(methodRaw),
        round,
        timeSeconds,
        weightClassText,
        isDraw: false,
        isNC: methodRaw.toLowerCase().includes('no contest'),
      });
    } else if (verb === 'vs.' || methodRaw.toLowerCase().includes('draw')) {
      results.push({
        winnerName: nameA,
        loserName: nameB,
        method: methodRaw.toLowerCase().includes('majority') ? 'draw' : 'draw',
        round,
        timeSeconds,
        weightClassText,
        isDraw: true,
        isNC: false,
      });
    }
  }

  return results;
}

function parseMethod(raw: string): FightMethod {
  const s = raw.toLowerCase();

  if (s.includes('no contest')) return 'no_contest';
  if (s.includes('disqualif') || s.includes('dq')) return 'disqualification';
  if (s.includes('draw')) return 'draw';
  if (s.startsWith('ko ') || s.startsWith('ko(') || s === 'ko') return 'ko_tko';
  if (s.startsWith('tko') || s.includes('tko')) return 'ko_tko';
  if (s.startsWith('submission') || s.startsWith('sub')) return 'submission';
  if (s.includes('decision (unanimous)')) return 'decision_unanimous';
  if (s.includes('decision (split)')) return 'decision_split';
  if (s.includes('decision (majority)')) return 'decision_majority';
  if (s.includes('decision')) return 'decision_unanimous';

  return 'decision_unanimous';
}

function parseTimeToSeconds(time: string): number {
  const [min, sec] = time.split(':').map(Number);
  return (min || 0) * 60 + (sec || 0);
}
