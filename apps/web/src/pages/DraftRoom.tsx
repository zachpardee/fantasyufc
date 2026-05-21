import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { supabase } from '../api/supabase';
import type { DraftState } from '@fantasy-ufc/shared';

export function DraftRoomPage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  const { refetch } = useQuery<DraftState>({
    queryKey: ['draft', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/draft`),
    onSuccess: setDraftState,
  } as any);

  // Real-time draft updates
  useEffect(() => {
    if (!leagueId) return;
    const channel = supabase
      .channel(`draft:${leagueId}`)
      .on('broadcast', { event: 'pick_made' }, () => refetch())
      .on('broadcast', { event: 'auto_pick' }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leagueId, refetch]);

  // Countdown timer
  useEffect(() => {
    if (!draftState?.session.currentPickDeadline) return;
    const id = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor(
        (new Date(draftState.session.currentPickDeadline!).getTime() - Date.now()) / 1000
      )));
    }, 1000);
    return () => clearInterval(id);
  }, [draftState?.session.currentPickDeadline]);

  const pickMutation = useMutation({
    mutationFn: (fighterId: string) =>
      apiClient.post(`/leagues/${leagueId}/draft/pick`, { fighterId }),
    onSuccess: () => refetch(),
  });

  if (!draftState) return <div style={styles.loading}>Loading draft...</div>;

  const roundPicks = Array.from({ length: draftState.session.totalRounds }, (_, r) =>
    draftState.picks.filter((p) => p.roundNumber === r + 1)
  );

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.roundLabel}>Round {draftState.session.currentRound} / {draftState.session.totalRounds}</div>
          <div style={styles.pickLabel}>Overall Pick #{draftState.session.currentPick}</div>
        </div>
        <div style={[styles.timer, timeLeft <= 10 && styles.timerUrgent] as any}>
          {timeLeft}s
        </div>
        <div style={styles.statusBadge}>{draftState.session.status.toUpperCase()}</div>
      </div>

      <div style={styles.layout}>
        <div style={styles.board}>
          <h3 style={styles.panelTitle}>Draft Board</h3>
          {roundPicks.map((picks, r) => (
            <div key={r} style={styles.round}>
              <div style={styles.roundHeader}>Round {r + 1}</div>
              <div style={styles.picksRow}>
                {picks.map((pick) => (
                  <div key={pick.id} style={styles.pickSlot}>
                    <div style={styles.pickTeam}>{pick.team?.teamName}</div>
                    <div style={styles.pickFighter}>
                      {pick.fighter ? `${pick.fighter.firstName} ${pick.fighter.lastName}` : '...'}
                    </div>
                    {pick.autoPicked && <div style={styles.autoTag}>AUTO</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.sidebar}>
          <h3 style={styles.panelTitle}>Available Fighters</h3>
          <div style={styles.fighterList}>
            {draftState.availableFighters.map((f) => (
              <div
                key={f.id}
                style={styles.fighterRow}
                onClick={() => pickMutation.mutate(f.id)}
              >
                <div>
                  {f.isChampion && <span style={styles.champ}>C</span>}
                  <span style={styles.fighterName}>{f.firstName} {f.lastName}</span>
                </div>
                <div style={styles.fighterMeta}>
                  <span style={styles.ranking}>{f.ranking ? `#${f.ranking}` : 'NR'}</span>
                  <span style={styles.pts}>{f.averageFantasyPoints?.toFixed(1) ?? '--'} pts</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column' },
  loading: { color: '#888', padding: 40, textAlign: 'center' },
  header: {
    background: '#111', borderBottom: '1px solid #222',
    padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 24,
  },
  roundLabel: { color: '#888', fontSize: 12, fontWeight: 600 },
  pickLabel: { color: '#fff', fontSize: 20, fontWeight: 800 },
  timer: {
    background: '#333', borderRadius: '50%', width: 60, height: 60,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, fontWeight: 800, color: '#fff',
  },
  timerUrgent: { background: '#c8102e' },
  statusBadge: { background: '#222', color: '#aaa', fontSize: 11, padding: '4px 10px', borderRadius: 4, fontWeight: 700 },
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  board: { flex: 1, overflow: 'auto', padding: 16 },
  sidebar: { width: 340, background: '#111', borderLeft: '1px solid #222', overflow: 'auto', padding: 16 },
  panelTitle: { color: '#888', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },
  round: { marginBottom: 16 },
  roundHeader: { color: '#555', fontSize: 11, fontWeight: 700, marginBottom: 6 },
  picksRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  pickSlot: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6,
    padding: '8px 12px', minWidth: 120, position: 'relative',
  },
  pickTeam: { color: '#666', fontSize: 10, marginBottom: 3 },
  pickFighter: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  autoTag: { position: 'absolute', top: 4, right: 4, background: '#444', color: '#888', fontSize: 9, padding: '1px 4px', borderRadius: 2 },
  fighterList: { display: 'flex', flexDirection: 'column', gap: 4 },
  fighterRow: {
    background: '#1a1a1a', borderRadius: 6, padding: '10px 12px',
    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    border: '1px solid #252525',
  },
  champ: { background: '#2a2400', color: '#ffd700', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3, marginRight: 6 },
  fighterName: { color: '#ddd', fontSize: 13, fontWeight: 600 },
  fighterMeta: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 },
  ranking: { color: '#c8102e', fontWeight: 700, fontSize: 12 },
  pts: { color: '#666', fontSize: 11 },
};
