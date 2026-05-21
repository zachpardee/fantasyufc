export type FighterStatus = 'active' | 'retired' | 'released' | 'suspended';
export type Stance = 'orthodox' | 'southpaw' | 'switch';

export interface WeightClass {
  id: string;
  name: string;
  slug: string;
  weightLimitLbs: number;
  gender: 'male' | 'female';
  displayOrder: number;
}

export interface Fighter {
  id: string;
  ufcFighterId?: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  weightClassId: string;
  weightClass?: WeightClass;
  nationality?: string;
  team?: string;
  record: {
    wins: number;
    losses: number;
    draws: number;
    noContests: number;
  };
  ranking?: number;
  isChampion: boolean;
  isInterimChamp: boolean;
  status: FighterStatus;
  imageUrl?: string;
  reachInches?: number;
  heightInches?: number;
  stance?: Stance;
  dob?: string;
  averageFantasyPoints?: number;
  createdAt: string;
  updatedAt: string;
}

export interface FighterStats {
  fighterId: string;
  sigStrikesLanded?: number;
  sigStrikesAttempted?: number;
  totalStrikesLanded?: number;
  takedownsLanded?: number;
  takedownsAttempted?: number;
  submissionAttempts?: number;
  knockdowns?: number;
}
