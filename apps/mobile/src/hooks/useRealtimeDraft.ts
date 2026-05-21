import { useEffect } from 'react';
import { supabase } from '../api/supabase';
import { useDraftStore } from '../store/draft.store';
import type { DraftPick } from '@fantasy-ufc/shared';

export function useRealtimeDraft(leagueId: string | undefined) {
  const { addPick, setDraftState, draftState } = useDraftStore();

  useEffect(() => {
    if (!leagueId) return;

    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('broadcast', { event: 'pick_made' }, ({ payload }) => {
        addPick(payload.pick as DraftPick);
      })
      .on('broadcast', { event: 'auto_pick' }, ({ payload }) => {
        addPick(payload as DraftPick);
      })
      .on('broadcast', { event: 'draft_started' }, ({ payload }) => {
        if (draftState) {
          setDraftState({
            ...draftState,
            session: { ...draftState.session, ...payload },
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId, addPick, setDraftState, draftState]);
}
