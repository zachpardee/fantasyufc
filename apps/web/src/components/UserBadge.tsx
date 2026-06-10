import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { apiClient } from '../api/client';
import { useAuthStore } from '../store/auth.store';

export function UserBadge() {
  const { session } = useAuthStore();
  const location = useLocation();

  const { data: profile } = useQuery<{ username: string; displayName?: string; avatarUrl?: string; avatarColor?: string }>({
    queryKey: ['my-profile'],
    queryFn: () => apiClient.get('/auth/me'),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';
  const isLeaguePage = /^\/league\/[^/]+$/.test(location.pathname);
  if (!session || isAuthPage || isLeaguePage || !profile) return null;

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
    top: 16,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#111',
    border: '1px solid #222',
    borderRadius: 24,
    padding: '5px 12px 5px 5px',
    zIndex: 1000,
    pointerEvents: 'none',
    maxWidth: 240,
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
    objectFit: 'cover',
    flexShrink: 0,
  },
  email: {
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
};
