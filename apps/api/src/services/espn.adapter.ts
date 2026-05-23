const ESPN_SITE = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc';
const ESPN_CORE = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';

export interface EspnAthlete {
  espnId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  weightLbs?: number;
  heightInches?: number;
  reachInches?: number;
  dateOfBirth?: string;
  country?: string;
  weightClassSlug?: string;
  imageUrl?: string;
}

export interface EspnEvent {
  espnEventId: string;
  espnCompetitionId: string;
  name: string;
  scheduledAt: string;
  status: 'pre' | 'in' | 'post';
  completed: boolean;
  venueName?: string;
  venueCity?: string;
  venueCountry?: string;
  fights: EspnFight[];
}

export interface EspnFight {
  espnFightId: string;
  weightClassText: string;
  scheduledRounds: number;
  completed: boolean;
  clockSeconds: number;
  period: number;
  redCorner: EspnFighter;
  blueCorner: EspnFighter;
  redOdds?: number;
  blueOdds?: number;
  boutOrder: number;
  isMainEvent: boolean;
  isCoMain: boolean;
  cardSegment: 'main' | 'prelims' | 'early_prelims';
}

export interface EspnFighter {
  espnAthleteId: string;
  displayName: string;
  record?: string;
  isWinner: boolean;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'FantasyUFC/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ESPN fetch failed: ${res.status} ${url}`);
  return res.json();
}

export async function fetchUpcomingEvents(): Promise<EspnEvent[]> {
  const data = await fetchJson(`${ESPN_SITE}/scoreboard`) as any;
  return (data.events ?? []).map(parseEvent).filter(Boolean) as EspnEvent[];
}

export async function fetchEventsByDate(yyyymmdd: string): Promise<EspnEvent[]> {
  const data = await fetchJson(`${ESPN_SITE}/scoreboard?dates=${yyyymmdd}`) as any;
  return (data.events ?? []).map(parseEvent).filter(Boolean) as EspnEvent[];
}

export async function fetchAthletes(page = 1, limit = 100): Promise<{ athletes: EspnAthlete[]; hasMore: boolean }> {
  const data = await fetchJson(`${ESPN_CORE}/athletes?limit=${limit}&page=${page}`) as any;
  const refs: string[] = (data.items ?? []).map((item: any) => item.$ref);

  const athletes: EspnAthlete[] = [];
  // Fetch in batches of 10 to avoid hammering ESPN
  for (let i = 0; i < refs.length; i += 10) {
    const batch = refs.slice(i, i + 10);
    const results = await Promise.allSettled(batch.map((ref) => fetchAthleteByRef(ref)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) athletes.push(r.value);
    }
    if (i + 10 < refs.length) await sleep(500);
  }

  const totalPages = data.pageCount ?? 1;
  return { athletes, hasMore: page < totalPages };
}

async function fetchAthleteByRef(ref: string): Promise<EspnAthlete | null> {
  try {
    const data = await fetchJson(ref) as any;
    const slug = data.weightClass?.slug as string | undefined;
    return {
      espnId: String(data.id),
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      displayName: data.displayName ?? '',
      weightLbs: data.weight,
      heightInches: data.height,
      reachInches: data.reach,
      dateOfBirth: data.dateOfBirth,
      country: data.citizenshipCountry?.name,
      weightClassSlug: slug ? normalizeWeightClassSlug(slug) : undefined,
      imageUrl: data.headshot?.href,
    };
  } catch {
    return null;
  }
}

function parseEvent(e: any): EspnEvent | null {
  try {
    const competitions = e.competitions ?? [];
    if (!competitions.length) return null;

    const firstComp = competitions[0];
    const statusType = firstComp.status?.type ?? {};
    const statusState: 'pre' | 'in' | 'post' = statusType.state ?? 'pre';

    const fights = competitions
      .map((c: any, i: number) => parseFight(c, i, competitions.length))
      .filter(Boolean) as EspnFight[];

    return {
      espnEventId: String(e.id),
      espnCompetitionId: String(firstComp.id),
      name: e.name ?? '',
      scheduledAt: e.date ?? '',
      status: statusState,
      completed: statusType.completed ?? false,
      venueName: firstComp.venue?.fullName,
      venueCity: firstComp.venue?.address?.city,
      venueCountry: firstComp.venue?.address?.country,
      fights,
    };
  } catch {
    return null;
  }
}

function parseFight(c: any, index: number, total: number): EspnFight | null {
  try {
    const comps: any[] = c.competitors ?? [];
    if (comps.length < 2) return null;

    const [red, blue] = comps;
    const status = c.status ?? {};
    const scheduledRounds = c.format?.regulation?.periods ?? 3;

    // ESPN provides c.order (1-based); fall back to array position
    // Higher order = later on the card = main event last
    const boutOrder: number = typeof c.order === 'number' ? c.order : index + 1;

    // Check notes array for "Main Event" / "Co-Main Event" labels
    const notes: string[] = (c.notes ?? []).map((n: any) =>
      (n.headline ?? n.type ?? '').toLowerCase(),
    );
    const isMainEvent = notes.some((n) => n.includes('main event') && !n.includes('co'));
    const isCoMain = notes.some((n) => n.includes('co-main') || n.includes('co main'));

    // Infer card segment from bout order relative to card size
    // Rough split: top third = main, middle = prelims, bottom = early prelims
    let cardSegment: 'main' | 'prelims' | 'early_prelims' = 'main';
    if (total >= 9) {
      const rank = boutOrder / total; // 0–1; higher = later on card
      if (rank <= 0.33) cardSegment = 'early_prelims';
      else if (rank <= 0.67) cardSegment = 'prelims';
    }

    // Try to extract moneyline odds from competition-level odds block
    const oddsBlock = c.odds?.[0];
    const redOdds = parseMoneyline(oddsBlock?.homeTeamOdds?.moneyLine ?? red.odds?.moneyLine);
    const blueOdds = parseMoneyline(oddsBlock?.awayTeamOdds?.moneyLine ?? blue.odds?.moneyLine);

    return {
      espnFightId: String(c.id),
      weightClassText: c.type?.text ?? c.type?.abbreviation ?? '',
      scheduledRounds,
      completed: status.type?.completed ?? false,
      clockSeconds: status.clock ?? 0,
      period: status.period ?? 0,
      redCorner: parseFighter(red),
      blueCorner: parseFighter(blue),
      redOdds,
      blueOdds,
      boutOrder,
      isMainEvent,
      isCoMain,
      cardSegment,
    };
  } catch {
    return null;
  }
}

function parseMoneyline(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return isNaN(n) ? undefined : n;
}

function parseFighter(comp: any): EspnFighter {
  const recordStr = comp.records?.find((r: any) => r.type === 'total')?.summary ?? '';
  return {
    espnAthleteId: String(comp.id),
    displayName: comp.athlete?.displayName ?? '',
    record: recordStr || undefined,
    isWinner: comp.winner ?? false,
  };
}

// Map ESPN weight class slugs to our DB slugs
function normalizeWeightClassSlug(espnSlug: string): string {
  const map: Record<string, string> = {
    'flyweight': 'flyweight',
    'bantamweight': 'bantamweight',
    'featherweight': 'featherweight',
    'lightweight': 'lightweight',
    'welterweight': 'welterweight',
    'middleweight': 'middleweight',
    'light-heavyweight': 'light-heavyweight',
    'heavyweight': 'heavyweight',
    'womens-strawweight': 'womens-strawweight',
    'womens-flyweight': 'womens-flyweight',
    'womens-bantamweight': 'womens-bantamweight',
    'womens-featherweight': 'womens-featherweight',
    'strawweight': 'womens-strawweight',
  };
  return map[espnSlug] ?? espnSlug;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
