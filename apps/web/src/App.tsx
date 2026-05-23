import { useEffect, Component, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './api/supabase';
import { useAuthStore } from './store/auth.store';
import { LoginPage } from './pages/Login';
import { RegisterPage } from './pages/Register';
import { DashboardPage } from './pages/Dashboard';
import { LeagueHomePage } from './pages/LeagueHome';
import { DraftRoomPage } from './pages/DraftRoom';
import { RosterPage } from './pages/Roster';
import { MatchupPage } from './pages/Matchup';
import { StandingsPage } from './pages/Standings';
import { FighterBrowserPage } from './pages/FighterBrowser';
import { TradesPage } from './pages/Trades';
import { SchedulePage } from './pages/Schedule';
import { CreateLeaguePage } from './pages/CreateLeague';
import { PicksPage } from './pages/Picks';
import { TeamPage } from './pages/TeamPage';
import { LeagueRulesPage } from './pages/LeagueRules';
import { LeagueSubLayout } from './components/LeagueSubLayout';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null };
  static getDerivedStateFromError(err: Error) { return { error: err.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #c8102e', borderRadius: 10, padding: 32, maxWidth: 480 }}>
            <p style={{ color: '#c8102e', fontWeight: 700, marginBottom: 8 }}>Something went wrong</p>
            <p style={{ color: '#888', fontSize: 13, fontFamily: 'monospace' }}>{this.state.error}</p>
            <button onClick={() => window.location.reload()}
              style={{ marginTop: 16, background: '#c8102e', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 20px', cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuthStore();
  if (loading) return <div style={{ minHeight: '100vh', background: '#0a0a0a' }} />;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { setSession, setLoading } = useAuthStore();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setSession(session);

      // Complete profile creation after email confirmation redirect
      if (session) {
        const pending = sessionStorage.getItem('pending_profile');
        if (pending) {
          sessionStorage.removeItem('pending_profile');
          try {
            const { username, displayName } = JSON.parse(pending);
            await import('./api/client').then(({ apiClient }) =>
              apiClient.post('/auth/register', { username, displayName: displayName || undefined }),
            );
          } catch {
            // Profile may already exist — ignore
          }
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [setSession]);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/league/create" element={<RequireAuth><CreateLeaguePage /></RequireAuth>} />
        <Route path="/league/:leagueId" element={<RequireAuth><LeagueHomePage /></RequireAuth>} />
        <Route element={<RequireAuth><LeagueSubLayout /></RequireAuth>}>
          <Route path="/league/:leagueId/draft" element={<DraftRoomPage />} />
          <Route path="/league/:leagueId/roster" element={<RosterPage />} />
          <Route path="/league/:leagueId/matchup" element={<MatchupPage />} />
          <Route path="/league/:leagueId/standings" element={<StandingsPage />} />
          <Route path="/league/:leagueId/trades" element={<TradesPage />} />
          <Route path="/league/:leagueId/schedule" element={<SchedulePage />} />
          <Route path="/league/:leagueId/picks" element={<PicksPage />} />
          <Route path="/league/:leagueId/team/:memberId" element={<TeamPage />} />
          <Route path="/league/:leagueId/rules" element={<LeagueRulesPage />} />
        </Route>
        <Route path="/fighters" element={<RequireAuth><FighterBrowserPage /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
