import { create } from 'zustand';
import type { DraftState, DraftPick } from '@fantasy-ufc/shared';

interface DraftStoreState {
  draftState: DraftState | null;
  setDraftState: (state: DraftState | null) => void;
  addPick: (pick: DraftPick) => void;
  myQueue: string[];
  addToQueue: (fighterId: string) => void;
  removeFromQueue: (fighterId: string) => void;
}

export const useDraftStore = create<DraftStoreState>((set) => ({
  draftState: null,
  myQueue: [],
  setDraftState: (draftState) => set({ draftState }),
  addPick: (pick) =>
    set((state) => {
      if (!state.draftState) return state;
      return {
        draftState: {
          ...state.draftState,
          picks: [...state.draftState.picks, pick],
          availableFighters: state.draftState.availableFighters.filter(
            (f) => f.id !== pick.fighterId,
          ),
        },
      };
    }),
  addToQueue: (fighterId) =>
    set((state) => ({ myQueue: [...state.myQueue, fighterId] })),
  removeFromQueue: (fighterId) =>
    set((state) => ({ myQueue: state.myQueue.filter((id) => id !== fighterId) })),
}));
