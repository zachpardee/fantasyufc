export interface UserProfile {
  id: string;
  displayName?: string;
  avatarUrl?: string;
  favoriteFighterId?: string;
  timezone: string;
  notificationPrefs: {
    tradeOffers: boolean;
    fightResults: boolean;
    draftPicks: boolean;
    eventStarting: boolean;
  };
  createdAt: string;
  updatedAt: string;
}
