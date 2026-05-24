export type LeagueStatus = 'setup' | 'drafting' | 'active' | 'playoffs' | 'completed';
export type DraftType = 'snake' | 'auction';

export interface League {
  id: string;
  name: string;
  description?: string;
  commissionerId: string;
  inviteCode: string;
  maxTeams: number;
  rosterSize: number;
  starterSlots: number;
  benchSlots: number;
  draftType: DraftType;
  draftScheduledAt?: string;
  draftPickTimeSeconds: number;
  tradeDeadlineDays: number;
  status: LeagueStatus;
  isPublic: boolean;
  seasonYear: number;
  memberCount?: number;
  scoringSettings?: ScoringSettings;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  teamName: string;
  draftPosition?: number;
  totalPoints: number;
  wins: number;
  losses: number;
  ties: number;
  streak: number;
  auctionBudget?: number;
  isActive: boolean;
  isChampion?: boolean;
  joinedAt: string;
  user?: {
    username: string;
    displayName?: string;
    avatarUrl?: string;
  };
}

export interface ScoringSettings {
  id: string;
  leagueId: string;
  ptsWin: number;
  ptsKoTko: number;
  ptsSubmission: number;
  ptsDecision: number;
  ptsDraw: number;
  ptsNoContest: number;
  ptsFinishRd1: number;
  ptsFinishRd2: number;
  ptsFinishRd3: number;
  ptsFinishRd4: number;
  ptsFinishRd5: number;
  ptsKnockdown: number;
  ptsSigStrikeLanded: number;
  ptsSigStrikeAttempted: number;
  ptsTotalStrikeLanded: number;
  ptsTakedownLanded: number;
  ptsTakedownAttempted: number;
  ptsSubmissionAttempt: number;
  ptsPerformanceOfNight: number;
  ptsFightOfNight: number;
  ptsLoss: number;
  ptsKoLossPenalty: number;
  titleFightMultiplier: number;
  scorePrelims: boolean;
  scoreEarlyPrelims: boolean;
}
