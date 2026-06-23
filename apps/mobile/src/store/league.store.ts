import { create } from 'zustand';

interface LeagueState {
  // The league the user most recently opened — used so the "Current Event"
  // tab follows the league you're actually in, not just the first active one.
  currentLeagueId: string | null;
  setCurrentLeagueId: (id: string) => void;
}

export const useLeagueStore = create<LeagueState>((set) => ({
  currentLeagueId: null,
  setCurrentLeagueId: (id) => set({ currentLeagueId: id }),
}));
