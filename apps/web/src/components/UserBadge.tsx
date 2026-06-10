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
  if (!session || isAuthPage || !profile) return null;

  const label = (profile.displayName || profile.username || '?').charAt(0).toUpperCase();
  const color = (profile as any).avatarColor ?? '#5555ff';
  const name = profile.displayName || profile.username;

  return (
    <div style={styles.wrap}>
      {profile.avatarUrl ? (
        <img src={profile.avatarUrl} alt={name} style={styles.avatarImg} />
      ) : (
        <div style={{ ...styles.avatar, background: color + '33', borderColor: color, color }}>
          {label}
        </div>
      )}
      <span style={styles.username}>{name}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    position: 'fixed',
    bottom: 24,
    left: 24,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    background: '#111',
    border: '1px solid #222',
    borderRadius: 24,
    padding: '6px 12px 6px 6px',
    zIndex: 1000,
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
    objectFit: 'cover',
    flexShrink: 0,
  },
  username: {
    color: '#888',
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
