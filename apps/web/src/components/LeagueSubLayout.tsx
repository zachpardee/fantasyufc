import { Outlet, Link, useParams } from 'react-router-dom';

export function LeagueSubLayout() {
  const { leagueId } = useParams<{ leagueId: string }>();

  return (
    <>
      <Outlet />
      <Link to={`/league/${leagueId}`} style={styles.homeBtn} title="League Home">
        ⌂
      </Link>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  homeBtn: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: '#c8102e',
    color: '#fff',
    fontSize: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    boxShadow: '0 2px 12px rgba(200,16,46,0.4)',
    zIndex: 1000,
    lineHeight: 1,
  },
};
