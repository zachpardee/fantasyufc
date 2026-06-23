/**
 * The fantasy year runs three fixed seasons, shaped around the UFC calendar
 * so each finale lands on a numbered PPV and the mid-December -> January
 * gap is the offseason:
 *
 *   Winter: Jan 2  - Apr 19   playoffs target the May PPV (~May 9)
 *   Summer: May 11 - Aug 23   playoffs target the September PPV (~Sep 12)
 *   Fall:   Sep 14 - Nov 29   playoffs target the December PPV (~Dec 12)
 *
 * `regularEndsAt` is the league's season_ends_at. The semis are the event
 * after the regular season ends; the finals are the PPV nearest finalsTarget.
 */

export type SeasonSlug = 'winter' | 'summer' | 'fall';

export interface SeasonInfo {
  slug: SeasonSlug;
  name: string;
  year: number;
  label: string; // "Winter 2026"
  startsAt: Date; // regular season opens
  regularEndsAt: Date; // regular season closes (= league season_ends_at)
  finalsTarget: Date; // ideal finals (PPV) date
}

const SEASON_DEFS: Array<{
  slug: SeasonSlug;
  name: string;
  start: [number, number];
  regEnd: [number, number];
  finals: [number, number];
}> = [
  { slug: 'winter', name: 'Winter', start: [0, 2], regEnd: [3, 19], finals: [4, 9] },
  { slug: 'summer', name: 'Summer', start: [4, 11], regEnd: [7, 23], finals: [8, 12] },
  { slug: 'fall', name: 'Fall', start: [8, 14], regEnd: [10, 29], finals: [11, 12] },
];

function utc(year: number, [month, day]: [number, number], endOfDay = false): Date {
  return new Date(
    Date.UTC(year, month, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0),
  );
}

export function seasonsOfYear(year: number): SeasonInfo[] {
  return SEASON_DEFS.map((d) => ({
    slug: d.slug,
    name: d.name,
    year,
    label: `${d.name} ${year}`,
    startsAt: utc(year, d.start),
    regularEndsAt: utc(year, d.regEnd, true),
    finalsTarget: utc(year, d.finals),
  }));
}

/**
 * The season a newly started league should join: the season whose regular
 * window contains `now` with at least `minRemainingDays` left, otherwise the
 * next season to start.
 */
export function currentOrNextSeason(now: Date = new Date(), minRemainingDays = 21): SeasonInfo {
  const candidates = [
    ...seasonsOfYear(now.getUTCFullYear()),
    ...seasonsOfYear(now.getUTCFullYear() + 1),
  ];
  const msLeftNeeded = minRemainingDays * 24 * 60 * 60 * 1000;
  for (const s of candidates) {
    if (now >= s.startsAt && s.regularEndsAt.getTime() - now.getTime() >= msLeftNeeded) return s;
    if (now < s.startsAt) return s;
  }
  return candidates[candidates.length - 1];
}

/** Match a season by its regular-season end date (a league's season_ends_at). */
export function seasonByRegularEnd(regularEndsAt: Date, toleranceDays = 3): SeasonInfo | null {
  const tol = toleranceDays * 24 * 60 * 60 * 1000;
  for (const year of [
    regularEndsAt.getUTCFullYear() - 1,
    regularEndsAt.getUTCFullYear(),
    regularEndsAt.getUTCFullYear() + 1,
  ]) {
    for (const s of seasonsOfYear(year)) {
      if (Math.abs(s.regularEndsAt.getTime() - regularEndsAt.getTime()) <= tol) return s;
    }
  }
  return null;
}
