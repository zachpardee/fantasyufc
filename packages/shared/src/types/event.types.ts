export type EventStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type FightStatus = 'scheduled' | 'live' | 'completed' | 'cancelled';
export type CardSegment = 'main' | 'prelim' | 'early_prelim';

export type FightOutcome =
  | 'ko_tko'
  | 'submission'
  | 'decision_unanimous'
  | 'decision_split'
  | 'decision_majority'
  | 'no_contest'
  | 'disqualification'
  | 'draw';

export interface UFCEvent {
  id: string;
  ufcEventId?: string;
  name: string;
  shortName?: string;
  eventType: 'numbered' | 'fight_night' | 'ppv';
  venue?: string;
  location?: string;
  scheduledAt: string;
  mainCardAt?: string;
  prelimsAt?: string;
  earlyPrelimsAt?: string;
  status: EventStatus;
  posterUrl?: string;
  isScoringEvent: boolean;
  fights?: Fight[];
  createdAt: string;
  updatedAt: string;
}

export interface Fight {
  id: string;
  ufcFightId?: string;
  eventId: string;
  redFighterId: string;
  blueFighterId: string;
  weightClassId: string;
  isTitleFight: boolean;
  isMainEvent: boolean;
  isCoMain: boolean;
  cardSegment: CardSegment;
  scheduledRounds: 3 | 5;
  boutOrder: number;
  status: FightStatus;
  result?: FightResult;
  createdAt: string;
  updatedAt: string;
}

export interface FightResult {
  id: string;
  fightId: string;
  winnerId?: string;
  winnerSide?: 'red' | 'blue';
  outcome: FightOutcome;
  endingRound: number;
  endingTimeSeconds: number;
  winnerStats?: FighterFightStats;
  loserStats?: FighterFightStats;
  performanceOfNight: boolean;
  fightOfNight: boolean;
  recordedAt: string;
}

export interface FighterFightStats {
  sigStrikesLanded?: number;
  sigStrikesAttempted?: number;
  totalStrikesLanded?: number;
  takedownsLanded?: number;
  takedownsAttempted?: number;
  submissionAttempts?: number;
  knockdowns?: number;
}
