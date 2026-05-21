export interface UserProfile {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  favoriteFighterId?: string;
  timezone: string;
  notificationPrefs: {
    tradeOffers: boolean;
    fightResults: boolean;
    draftPicks: boolean;
    eventStarting: boolean;
    waiverResults: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
