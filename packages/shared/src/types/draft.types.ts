export type DraftStatus = 'pending' | 'active' | 'paused' | 'completed';
export type PickStatus = 'pending' | 'picked' | 'auto_picked' | 'skipped';

export interface DraftSession {
  id: string;
  leagueId: string;
  draftType: 'snake' | 'auction';
  status: DraftStatus;
  currentRound: number;
  currentPick: number;
  currentTeamId?: string;
  totalRounds: number;
  pickTimeSeconds: number;
  currentPickDeadline?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DraftPick {
  id: string;
  draftSessionId: string;
  leagueMemberId: string;
  fighterId?: string;
  overallPick: number;
  roundNumber: number;
  pickInRound: number;
  status: PickStatus;
  autoPicked: boolean;
  pickDurationSeconds?: number;
  pickedAt?: string;
  createdAt: string;
  fighter?: {
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    imageUrl?: string;
    weightClassId: string;
    averageFantasyPoints?: number;
  };
  team?: {
    id: string;
    teamName: string;
    userId: string;
  };
}

export interface DraftOrder {
  id: string;
  draftSessionId: string;
  leagueMemberId: string;
  position: number;
}

export interface DraftState {
  session: DraftSession;
  picks: DraftPick[];
  order: DraftOrder[];
  availableFighters: Array<{
    id: string;
    firstName: string;
    lastName: string;
    nickname?: string;
    weightClassId: string;
    averageFantasyPoints?: number;
    ranking?: number;
    isChampion: boolean;
  }>;
  myQueue: string[];
}
