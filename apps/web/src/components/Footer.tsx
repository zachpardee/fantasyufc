export function Footer() {
  return <footer style={styles.footer}>© 2026 Fantasy Fighter League. All rights reserved.</footer>;
}

const styles: Record<string, React.CSSProperties> = {
  footer: {
    background: '#0a0a0a',
    borderTop: '1px solid #1a1a1a',
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    padding: '16px 24px',
  },
};
