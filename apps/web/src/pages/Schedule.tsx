import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../api/client';

type ScheduleEvent = {
  id: string;
  name: string;
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
  venue: string;
  location: string;
  scheduledAt: string;
  status: string;
  fightCount: number;
  isAdded: boolean;
};

export function SchedulePage() {
  const { leagueId } = useParams<{ leagueId: string }>();

  const { data: schedule = [], isLoading: loadingSchedule } = useQuery<ScheduleEvent[]>({
    queryKey: ['schedule', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule`),
  });

  const { data: available = [], isLoading: loadingAvailable } = useQuery<AvailableEvent[]>({
    queryKey: ['schedule-available', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/schedule/available`),
  });

  const isLoading = loadingSchedule || loadingAvailable;

  // Build a merged list: schedule events (have matchup data) take precedence over available.
  // Filter out completed/cancelled and events >24h past their scheduled date.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const scheduleIds = new Set(schedule.map((e) => e.id));

  // All events already on the league schedule (completed shown muted, live/upcoming highlighted)
  const scheduleRows = schedule
    .filter((ev) => ev.status !== 'cancelled')
    .filter((ev) => {
      // Keep completed events that are genuinely on the schedule
      if (ev.status === 'completed') return true;
      if (ev.status === 'live') return true;
      // Drop stale "scheduled" rows whose date is >24h past
      return new Date(ev.scheduledAt) > cutoff;
    })
    .map((ev) => ({ ...ev, isOnSchedule: true, matchupCount: ev.matchupCount }));

  // Upcoming UFC events not yet added to this league
  const availableRows = available
    .filter((ev) => !scheduleIds.has(ev.id))
    .map((ev) => ({ ...ev, isOnSchedule: false, matchupCount: 0 }));

  const sorted = [...scheduleRows, ...availableRows]
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // Only the first live event is active; only the first non-completed schedule event
  // shows the "On Schedule" badge — subsequent league events show as plain upcoming.
  let seenLive = false;
  let seenOnSchedule = false;
  const upcoming = sorted.map((ev) => {
    if (ev.status === 'live') {
      if (seenLive) return { ...ev, status: 'scheduled', isOnSchedule: false };
      seenLive = true;
      return ev;
    }
    if (ev.isOnSchedule && ev.status !== 'completed') {
      if (seenOnSchedule) return { ...ev, isOnSchedule: false };
      seenOnSchedule = true;
    }
    return ev;
  });

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <Link to={`/league/${leagueId}`} style={styles.back}>← League</Link>
        <span style={styles.title}>Schedule</span>
      </nav>

      <div style={styles.content}>
        {isLoading && <div style={styles.empty}>Loading...</div>}

        {!isLoading && upcoming.length === 0 && (
          <div style={styles.empty}>No upcoming events found.</div>
        )}

        {upcoming.map((ev) => {
          const isLive = ev.status === 'live';
          const isDone = ev.status === 'completed';
          return (
            <div key={ev.id} style={{ ...styles.eventCard, ...(isLive ? styles.eventCardLive : {}), ...(isDone ? styles.eventCardDone : {}) }}>
              <div style={styles.eventInfo}>
                <div style={{ ...styles.eventName, ...(isLive ? styles.eventNameLive : {}), ...(isDone ? styles.eventNameDone : {}) }}>
                  {ev.name}
                </div>
                <div style={styles.eventMeta}>
                  {[ev.venue, ev.location].filter(Boolean).join(' · ')} · {fmtDate(ev.scheduledAt)}
                </div>
                <div style={styles.eventStats}>
                  {isLive && <span style={styles.liveBadge}>LIVE</span>}
                  {isDone && <span style={styles.doneBadge}>COMPLETED</span>}
                  {ev.isOnSchedule && !isLive && !isDone && <span style={styles.onScheduleBadge}>On Schedule</span>}
                  {ev.matchupCount > 0 && <span style={styles.stat}>{ev.matchupCount} matchups</span>}
                  {ev.fightCount > 0 && <span style={styles.stat}>{ev.fightCount} fights</span>}
                </div>
              </div>
            </div>
          );
        })}

        <div style={styles.note}>
          Events are added to your league automatically 2 days after each event ends.
        </div>
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
  title: { color: '#fff', fontWeight: 700, fontSize: 18 },
  content: { maxWidth: 700, margin: '0 auto', padding: 24 },
  empty: { color: '#555', fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: '40px 0' },
  eventCard: {
    background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10,
    padding: '16px 20px', marginBottom: 8,
  },
  eventCardLive: { border: '1px solid #c8102e', background: '#1a0808' },
  eventInfo: {},
  eventName: { color: '#fff', fontSize: 15, fontWeight: 600, marginBottom: 4 },
  eventNameLive: { fontWeight: 800 },
  eventMeta: { color: '#666', fontSize: 12, marginBottom: 6 },
  eventStats: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  eventCardDone: { opacity: 0.45 },
  eventNameDone: { color: '#888' },
  liveBadge: { background: '#c8102e', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 },
  doneBadge: { background: '#1a1a1a', color: '#555', border: '1px solid #333', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 },
  onScheduleBadge: { background: '#1a2a1a', color: '#4caf50', border: '1px solid #2a4a2a', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4 },
  stat: { color: '#555', fontSize: 12 },
  note: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 24 },
};
