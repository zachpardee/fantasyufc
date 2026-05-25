import type { ScoringSettings } from '../types/league.types';

export const DEFAULT_SCORING_SETTINGS: Omit<ScoringSettings, 'id' | 'leagueId'> = {
  ptsWin: 20,
  ptsKoTko: 10,
  ptsSubmission: 10,
  ptsDecision: 5,
  scorePrelims: true,
  scoreEarlyPrelims: false,
};
