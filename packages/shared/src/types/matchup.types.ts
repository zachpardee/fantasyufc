export interface Matchup {
  id: string;
  leagueId: string;
  eventId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  winnerId?: string;
  isPlayoffs: boolean;
  event?: {
    id: string;
    name: string;
    scheduledAt: string;
    status: string;
  };
  homeTeam?: {
    id: string;
    teamName: string;
    userId: string;
  };
  awayTeam?: {
    id: string;
    teamName: string;
    userId: string;
  };
  homeScores?: import('./scoring.types').MatchupScore[];
  awayScores?: import('./scoring.types').MatchupScore[];
  createdAt: string;
  updatedAt: string;
}

export interface RosterFighter {
  id: string;
  rosterId: string;
  fighterId: string;
  slotType: 'starter' | 'bench' | 'ir';
  slotPosition: number;
  acquiredVia: 'draft' | 'waiver' | 'trade' | 'free_agent';
  acquiredAt: string;
  fighter?: import('./fighter.types').Fighter;
}

export interface Roster {
  id: string;
  leagueMemberId: string;
  fighters: RosterFighter[];
  createdAt: string;
  updatedAt: string;
}
