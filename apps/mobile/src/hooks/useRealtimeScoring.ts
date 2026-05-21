import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../api/supabase';

export function useRealtimeScoring(matchupId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!matchupId) return;

    const channel = supabase
      .channel(`matchup-scores:${matchupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matchup_scores',
          filter: `matchup_id=eq.${matchupId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['matchup', matchupId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchupId, queryClient]);
}
