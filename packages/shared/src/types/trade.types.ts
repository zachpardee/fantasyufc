export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
export type WaiverStatus = 'pending' | 'processed' | 'approved' | 'denied';

export interface TradeItem {
  id: string;
  tradeId: string;
  fromTeamId: string;
  toTeamId: string;
  fighterId: string;
  fighter?: {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl?: string;
    weightClassId: string;
  };
}

export interface Trade {
  id: string;
  leagueId: string;
  proposingTeamId: string;
  receivingTeamId: string;
  status: TradeStatus;
  message?: string;
  proposedAt: string;
  respondedAt?: string;
  expiresAt: string;
  processedAt?: string;
  items?: TradeItem[];
  proposingTeam?: {
    id: string;
    teamName: string;
  };
  receivingTeam?: {
    id: string;
    teamName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WaiverClaim {
  id: string;
  leagueId: string;
  claimingTeamId: string;
  fighterId: string;
  dropFighterId?: string;
  priority: number;
  status: WaiverStatus;
  submittedAt: string;
  processedAt?: string;
  denialReason?: string;
  fighter?: {
    id: string;
    firstName: string;
    lastName: string;
    imageUrl?: string;
  };
  dropFighter?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}
