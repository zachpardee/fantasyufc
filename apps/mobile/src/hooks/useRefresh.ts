import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Pull-to-refresh helper. Returns a `refreshing` flag and an `onRefresh` handler that
 * refetches the screen's active queries. Pass the query keys to refetch; with no keys it
 * refetches every active query on the screen.
 *
 *   const { refreshing, onRefresh } = useRefresh([['leagues'], ['standings', leagueId]]);
 *   <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#c8102e" />}>
 */
export function useRefresh(keys?: unknown[][]) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (keys && keys.length) {
        await Promise.all(keys.map((key) => qc.refetchQueries({ queryKey: key })));
      } else {
        await qc.refetchQueries({ type: 'active' });
      }
    } finally {
      setRefreshing(false);
    }
    // keys is intentionally spread so callers can pass an inline array without memoizing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, JSON.stringify(keys)]);

  return { refreshing, onRefresh };
}
