import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function UserBadge() {
  const { session } = useAuthStore();
  const location = useLocation();

  const { data: profile } = useQuery<{
    displayName?: string;
    avatarUrl?: string;
    avatarColor?: string;
  }>({
    queryKey: ['my-profile'],
    queryFn: () => apiClient.get('/auth/me'),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isLeaguePage = /^\/league\//.test(location.pathname); // all league pages have their own nav
  const isDashboard = location.pathname === '/'; // dashboard has its own email+logout
  const isAdminPage = location.pathname === '/admin'; // admin header has its own top-right controls
  if (!session || isAuthPage || isLeaguePage || isDashboard || isAdminPage || !profile) return null;

  const email = session.user.email ?? '';
  const label = email.charAt(0).toUpperCase();
  const color = (profile as any).avatarColor ?? '#5555ff';

  return (
    <div style={styles.wrap}>
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={email} style={styles.avatarImg} />
      ) : (
        <div style={{ ...styles.avatar, background: color + '33', borderColor: color, color }}>
          {label}
        </div>
      )}
      <span style={styles.email}>{email}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    top: 0,
    right: 0,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#111',
    borderBottom: '1px solid #222',
    borderLeft: '1px solid #1e1e1e',
    padding: '0 16px 0 12px',
    zIndex: 500,
    pointerEvents: 'none',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
  },
  avatarImg: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    objectFit: 'cover' as const,
    flexShrink: 0,
  },
  email: {
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: 200,
  },
};
