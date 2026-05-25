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

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('ffl-spin')) {
  const s = document.createElement('style');
  s.id = 'ffl-spin';
  s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
  document.head.appendChild(s);
}
