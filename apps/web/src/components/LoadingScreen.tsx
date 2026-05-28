// Inject keyframes once (pulse + spin share the same tag check)
if (typeof document !== 'undefined' && !document.getElementById('ffl-keyframes')) {
  const s = document.createElement('style');
  s.id = 'ffl-keyframes';
  s.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes ffl-pulse { 0%,100% { opacity: 0.35 } 50% { opacity: 0.7 } }
  `;
  document.head.appendChild(s);
}

/** Generic pulsing gray block */
export function Skeleton({ width = '100%', height = 16, radius = 6, style }: {
  width?: number | string; height?: number | string; radius?: number; style?: React.CSSProperties;
}) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: '#1e1e1e',
      animation: 'ffl-pulse 1.6s ease-in-out infinite',
      flexShrink: 0,
      ...style,
    }} />
  );
}

/** Skeleton for a league card on the dashboard */
export function SkeletonLeagueCard() {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Skeleton height={18} width="60%" />
      <Skeleton height={12} width="35%" />
      <Skeleton height={20} width={64} radius={10} />
    </div>
  );
}

/** Skeleton for the event banner card */
export function SkeletonEventCard() {
  return (
    <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
      <Skeleton height={10} width={80} />
      <Skeleton height={22} width="55%" />
      <Skeleton height={14} width="40%" />
    </div>
  );
}

/** Skeleton for a single fight card row */
export function SkeletonFightRow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #141414' }}>
      <Skeleton width={68} height={36} radius={4} />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Skeleton width={44} height={54} radius={4} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton height={13} width="60%" />
          <Skeleton height={10} width="30%" />
        </div>
        <Skeleton width={32} height={32} radius={4} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <Skeleton height={13} width="60%" />
          <Skeleton height={10} width="30%" />
        </div>
        <Skeleton width={44} height={54} radius={4} />
      </div>
      <Skeleton width={68} height={36} radius={4} />
    </div>
  );
}

/** Skeleton for the league home header section */
export function SkeletonLeagueHeader() {
  return (
    <div style={{ padding: '20px 24px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <Skeleton height={24} width={200} />
      <Skeleton height={14} width={140} />
      <Skeleton height={14} width={100} />
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div style={styles.page}>
      <div style={styles.spinner} />
    </div>
  );
}

export function LoadingInline({ label = 'Loading...' }: { label?: string }) {
  return (
    <div style={styles.inline}>
      <div style={styles.dot} />
      <span style={styles.label}>{label}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', background: '#0a0a0a',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  spinner: {
    width: 36, height: 36, borderRadius: '50%',
    border: '3px solid #222', borderTopColor: '#c8102e',
    animation: 'spin 0.7s linear infinite',
  },
  inline: { display: 'flex', alignItems: 'center', gap: 10, padding: '40px 24px' },
  dot: {
    width: 18, height: 18, borderRadius: '50%',
    border: '2px solid #222', borderTopColor: '#c8102e',
    animation: 'spin 0.7s linear infinite', flexShrink: 0,
  },
  label: { color: '#555', fontSize: 14 },
};

