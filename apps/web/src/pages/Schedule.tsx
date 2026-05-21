import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

type ScheduleEvent = {
  id: string;
  name: string;
  shortName: string;
  venue: string;
  location: string;
  scheduledAt: string;
  status: string;
  fightCount: number;
  matchupCount: number;
  isScoring: boolean;
};

type AvailableEvent = {
  id: string;
  name: string;
  shortName: string;
  venue: string;
  location: string;
  scheduledAt: string;
  status: string;
  fightCount: number;
  isAdded: boolean;
};

export function SchedulePage() {
  const { leagueId } = useParams<{ leagueId: string }>();
  const { session } = useAuthStore();
  const qc = useQueryClient();
  const [msg, setMsg] = useState('');

  const { data: league } = useQuery<{ commissionerId: string; status: string }>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: schedule = [] } = useQuery<ScheduleEvent[]>({
    queryKey: ['schedule', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule`),
  });

  const { data: available = [] } = useQuery<AvailableEvent[]>({
    queryKey: ['schedule-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule/available`),
  });

  const addMutation = useMutation({
    mutationFn: (eventId: string) =>
      apiClient.post(`/leagues/${leagueId}/schedule`, { eventId, isScoring: true }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['schedule', leagueId] });
      qc.invalidateQueries({ queryKey: ['schedule-available', leagueId] });
      const count = res?.matchupsGenerated?.created ?? 0;
      setMsg(count > 0 ? `Added event and generated ${count} matchups.` : 'Event added to schedule.');
      setTimeout(() => setMsg(''), 4000);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (eventId: string) =>
      apiClient.delete(`/leagues/${leagueId}/schedule/${eventId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule', leagueId] });
      qc.invalidateQueries({ queryKey: ['schedule-available', leagueId] });
    },
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/leagues/${leagueId}/schedule/regenerate-matchups`, {}),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['schedule', leagueId] });
      setMsg(`Regenerated: ${res?.created ?? 0} matchups created.`);
      setTimeout(() => setMsg(''), 4000);
    },
  });

  const isCommissioner = league?.commissionerId === session?.user.id;
  const isActive = league?.status === 'active';

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Schedule</span>
        {isCommissioner && isActive && (
          <button
            style={styles.regenBtn}
            onClick={() => regenMutation.mutate()}
            disabled={regenMutation.isPending}
          >
            {regenMutation.isPending ? 'Regenerating...' : 'Regen Matchups'}
          </button>
        )}
      </nav>

      {msg && <div style={styles.flashMsg}>{msg}</div>}

      <div style={styles.content}>
        {/* Current schedule */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>League Schedule ({schedule.length} events)</h2>
          {schedule.length === 0 ? (
            <p style={styles.empty}>No events on the schedule yet.{isCommissioner ? ' Add events below.' : ''}</p>
          ) : (
            schedule.map((ev) => (
              <div key={ev.id} style={styles.eventCard}>
                <div style={styles.eventInfo}>
                  <div style={styles.eventName}>{ev.name}</div>
                  <div style={styles.eventMeta}>
                    {ev.venue} · {ev.location} · {fmtDate(ev.scheduledAt)}
                  </div>
                  <div style={styles.eventStats}>
                    <span style={ev.status === 'live' ? styles.liveBadge : styles.statusBadge}>
                      {ev.status.toUpperCase()}
                    </span>
                    {ev.matchupCount > 0 && (
                      <span style={styles.stat}>{ev.matchupCount} matchups</span>
                    )}
                  </div>
                </div>
                {isCommissioner && ev.status === 'scheduled' && (
                  <button
                    style={styles.removeBtn}
                    onClick={() => removeMutation.mutate(ev.id)}
                    disabled={removeMutation.isPending}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))
          )}
        </section>

        {/* Add events (commissioner only) */}
        {isCommissioner && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Available Events</h2>
            {available.length === 0 ? (
              <p style={styles.empty}>No upcoming events available.</p>
            ) : (
              available.map((ev) => (
                <div key={ev.id} style={{ ...styles.eventCard, ...(ev.isAdded ? styles.eventCardAdded : {}) }}>
                  <div style={styles.eventInfo}>
                    <div style={styles.eventName}>{ev.name}</div>
                    <div style={styles.eventMeta}>
                      {ev.venue} · {ev.location} · {fmtDate(ev.scheduledAt)}
                    </div>
                    {ev.fightCount > 0 && (
                      <span style={styles.stat}>{ev.fightCount} fights</span>
                    )}
                  </div>
                  {ev.isAdded ? (
                    <span style={styles.addedTag}>Added</span>
                  ) : (
                    <button
                      style={styles.addBtn}
                      onClick={() => addMutation.mutate(ev.id)}
                      disabled={addMutation.isPending}
                    >
                      + Add
                    </button>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#0a0a0a' },
  nav: {
    background: '#111', borderBottom: '1px solid #222',
    padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16,
  },
  back: { color: '#c8102e', textDecoration: 'none', fontSize: 14 },
  title: { color: '#fff', fontWeight: 700, fontSize: 18, flex: 1 },
  regenBtn: { background: '#2a2a2a', border: '1px solid #444', borderRadius: 6, color: '#ccc', padding: '7px 14px', cursor: 'pointer', fontSize: 13 },
  flashMsg: { background: '#1a2a1a', borderBottom: '1px solid #4caf50', padding: '10px 24px', color: '#4caf50', fontSize: 14 },
  content: { maxWidth: 800, margin: '0 auto', padding: 24 },
  section: { marginBottom: 40 },
  sectionTitle: { color: '#888', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 14px' },
  empty: { color: '#555', fontSize: 14, fontStyle: 'italic' },
  eventCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: '16px 20px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 16,
  },
  eventCardAdded: { opacity: 0.6 },
  eventInfo: { flex: 1, minWidth: 0 },
  eventName: { color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 4 },
  eventMeta: { color: '#666', fontSize: 12, marginBottom: 6 },
  eventStats: { display: 'flex', gap: 10, alignItems: 'center' },
  statusBadge: { background: '#2a2a2a', color: '#888', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 },
  stat: { color: '#555', fontSize: 12 },
  addBtn: { background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  addedTag: { color: '#4caf50', fontSize: 13, fontWeight: 700, flexShrink: 0 },
  removeBtn: { background: 'transparent', border: '1px solid #444', borderRadius: 6, color: '#888', padding: '7px 14px', cursor: 'pointer', fontSize: 12, flexShrink: 0 },
};
