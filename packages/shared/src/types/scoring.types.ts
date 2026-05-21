export interface ScoreBreakdown {
  fighterId: string;
  matchupId: string;
  fightId: string;
  isStarter: boolean;
  ptsWin: number;
  ptsFinish: number;
  ptsRoundBonus: number;
  ptsSigStrikes: number;
  ptsTotalStrikes: number;
  ptsKnockdowns: number;
  ptsTakedowns: number;
  ptsSubmissions: number;
  ptsBonuses: number;
  titleMultiplier: number;
  totalPoints: number;
  scoredAt?: string;
}

export interface MatchupScore {
  id: string;
  matchupId: string;
  rosterId: string;
  fightId?: string;
  fighter: {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl?: string;
  };
  breakdown: Omit<ScoreBreakdown, 'fighterId' | 'matchupId' | 'fightId'>;
}
