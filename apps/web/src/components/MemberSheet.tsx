import React from 'react';

export function hasBelt(member: any, members: any[], league: any): boolean {
  const anyChampion = members.some((m) => m.isChampion);
  return member.isChampion || (!anyChampion && member.userId === league?.commissionerId);
}

export function hasBmfBelt(member: any, league: any): boolean {
  return !!league?.bmfBeltHolderId && member.id === league.bmfBeltHolderId;
}

export function BeltHalo({ size, variant = 'ufc', position = 'top', offset = 0 }: {
  size: number; variant?: 'ufc' | 'bmf'; position?: 'top' | 'bottom'; offset?: number;
}) {
  const w = size * 1.9;
  const h = size * 0.3;
  const isBmf = variant === 'bmf';
  const rivetColor = isBmf ? '#333' : '#7a5a00';
  const strapEdge = isBmf ? '#222' : '#6a4a00';
  const sideOuter = isBmf ? '#0a0a0a' : '#111';
  const sideRing1Fill = isBmf ? '#1a1a1a' : '#8a6500';
  const sideRing1Stroke = isBmf ? '#333' : '#c8a000';
  const sideRing2 = isBmf ? '#222' : '#b8900a';
  const sideHighlight = isBmf ? 'rgba(255,255,255,0.03)' : 'rgba(255,215,0,0.3)';
  const centerOuter = isBmf ? '#0a0a0a' : '#c8c8c8';
  const centerOuterStroke = isBmf ? '#222' : '#e8e8e8';
  const centerMid = isBmf ? '#111' : '#b8860b';
  const centerInner = isBmf ? '#181818' : '#d4a017';
  const centerHighlight = isBmf ? 'rgba(255,255,255,0.03)' : 'rgba(255,215,0,0.3)';
  const textColor = isBmf ? '#c8a000' : '#1a0800';
  const label = isBmf ? 'BMF' : 'UFC';
  return (
    <div style={{ position: 'absolute', ...(position === 'bottom' ? { top: size * 1.04 + offset } : { top: -(size * 0.34) + offset }), left: '50%', transform: 'translateX(-50%)', width: w, height: h, pointerEvents: 'none', zIndex: 2, filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.9))' }}>
      <svg viewBox="0 0 200 32" width={w} height={h} xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="11" width="200" height="10" fill="#111"/>
        <rect x="0" y="11" width="200" height="1.2" fill={strapEdge}/>
        <rect x="0" y="19.8" width="200" height="1.2" fill={strapEdge}/>
        <circle cx="6" cy="14.5" r="1" fill={rivetColor}/><circle cx="6" cy="17.5" r="1" fill={rivetColor}/>
        <circle cx="11" cy="14.5" r="1" fill={rivetColor}/><circle cx="11" cy="17.5" r="1" fill={rivetColor}/>
        <circle cx="16" cy="14.5" r="1" fill={rivetColor}/><circle cx="16" cy="17.5" r="1" fill={rivetColor}/>
        <circle cx="184" cy="14.5" r="1" fill={rivetColor}/><circle cx="184" cy="17.5" r="1" fill={rivetColor}/>
        <circle cx="189" cy="14.5" r="1" fill={rivetColor}/><circle cx="189" cy="17.5" r="1" fill={rivetColor}/>
        <circle cx="194" cy="14.5" r="1" fill={rivetColor}/><circle cx="194" cy="17.5" r="1" fill={rivetColor}/>
        <polygon points="37,1 57,1 63,7 63,25 57,31 37,31 31,25 31,7" fill={sideOuter} stroke={rivetColor} strokeWidth="0.8"/>
        <polygon points="38,3 56,3 61,8 61,24 56,29 38,29 33,24 33,8" fill={sideRing1Fill} stroke={sideRing1Stroke} strokeWidth="0.5"/>
        <polygon points="39,5 55,5 59,10 59,22 55,27 39,27 35,22 35,10" fill={sideRing2}/>
        <rect x="39" y="5" width="20" height="7" rx="1" fill={sideHighlight}/>
        <polygon points="80,0 120,0 131,9 131,23 120,32 80,32 69,23 69,9" fill={centerOuter} stroke={centerOuterStroke} strokeWidth="0.5"/>
        <polygon points="83,3 117,3 127,11 127,21 117,29 83,29 73,21 73,11" fill={centerMid}/>
        <polygon points="85,5 115,5 124,13 124,19 115,27 85,27 76,19 76,13" fill={centerInner}/>
        <rect x="86" y="5" width="28" height="8" rx="1" fill={centerHighlight}/>
        <text x="100" y="22" textAnchor="middle" fontSize="9" fontWeight="900" fill={textColor} fontFamily="Arial Black, Arial, sans-serif" letterSpacing="1.5">{label}</text>
        <polygon points="143,1 163,1 169,7 169,25 163,31 143,31 137,25 137,7" fill={sideOuter} stroke={rivetColor} strokeWidth="0.8"/>
        <polygon points="144,3 162,3 167,8 167,24 162,29 144,29 139,24 139,8" fill={sideRing1Fill} stroke={sideRing1Stroke} strokeWidth="0.5"/>
        <polygon points="145,5 161,5 165,10 165,22 161,27 145,27 141,22 141,10" fill={sideRing2}/>
        <rect x="145" y="5" width="20" height="7" rx="1" fill={sideHighlight}/>
      </svg>
    </div>
  );
}

export function MemberSheet({ member, members, league, onClose }: {
  member: any; members: any[]; league: any; onClose: () => void;
}) {
  const color = member.avatarColor ?? '#5555ff';
  const streak = member.streak ?? 0;
  const standingRank = members.findIndex((m: any) => m.id === member.id) + 1;
  const belt = hasBelt(member, members, league);
  const bmf = hasBmfBelt(member, league);
  const isStaking = league?.leagueFormat === 'staking';
  const bankroll = +(member.stakingBalance ?? 0);
  const fmtBankroll = (n: number) => {
    const abs = Math.abs(n);
    return (n < 0 ? '-$' : '+$') + (abs % 1 < 0.005 ? abs.toFixed(0) : abs.toFixed(2));
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>Player</span>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles.body}>
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <div style={{ ...styles.avatar, background: color + '33', borderColor: color }}>
              {member.teamName.charAt(0).toUpperCase()}
            </div>
            {belt && <BeltHalo size={72} offset={8} />}
            {bmf && <BeltHalo size={72} variant="bmf" position={belt ? 'bottom' : 'top'} />}
          </div>
          <div style={styles.name}>{member.teamName}</div>
          <div style={styles.username}>@{member.username}</div>
          {standingRank > 0 && <div style={styles.rank}>#{standingRank} in standings</div>}
          <div style={styles.stats}>
            <div style={styles.stat}>
              <span style={{ ...styles.statVal, color: isStaking ? (bankroll >= 0 ? '#4caf50' : '#ff5252') : '#fff' }}>
                {isStaking ? fmtBankroll(bankroll) : (+(member.totalPoints ?? 0)).toFixed(0)}
              </span>
              <span style={styles.statLabel}>{isStaking ? 'Bankroll' : 'Season Pts'}</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.stat}>
              <span style={styles.statVal}>{member.wins}</span>
              <span style={styles.statLabel}>Wins</span>
            </div>
            <div style={styles.statDivider} />
            <div style={styles.stat}>
              <span style={styles.statVal}>{member.losses}</span>
              <span style={styles.statLabel}>Losses</span>
            </div>
            {member.ties > 0 && <>
              <div style={styles.statDivider} />
              <div style={styles.stat}>
                <span style={styles.statVal}>{member.ties}</span>
                <span style={styles.statLabel}>Ties</span>
              </div>
            </>}
          </div>
          {streak !== 0 && (
            <div style={{ ...styles.streak, color: streak > 0 ? '#4caf50' : '#ff5252' }}>
              {streak > 0 ? `W${streak} streak` : `L${Math.abs(streak)} streak`}
            </div>
          )}
          {(belt || bmf) && (
            <div style={styles.bragRow}>
              {belt && bmf ? (
                <div style={styles.bragBoth}>🏆 League Champion &amp; BMF Champion</div>
              ) : belt ? (
                <div style={styles.bragUfc}>🏆 League Champion</div>
              ) : (
                <div style={styles.bragBmf}>BMF Champion</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sheet: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, width: '90%', maxWidth: 420, maxHeight: '85vh', overflowY: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 0' },
  title: { color: '#fff', fontWeight: 700, fontSize: 16 },
  close: { background: 'none', border: 'none', color: '#555', fontSize: 18, cursor: 'pointer' },
  body: { padding: '24px 24px 36px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  avatar: { width: 72, height: 72, borderRadius: '50%', border: '3px solid', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 },
  name: { color: '#fff', fontSize: 20, fontWeight: 700 },
  username: { color: '#555', fontSize: 13 },
  rank: { color: '#555', fontSize: 12, marginTop: 2 },
  stats: { display: 'flex', alignItems: 'center', gap: 0, marginTop: 20, background: '#111', border: '1px solid #222', borderRadius: 12, overflow: 'hidden', width: '100%' },
  stat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 0' },
  statVal: { color: '#fff', fontSize: 22, fontWeight: 800 },
  statLabel: { color: '#555', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  statDivider: { width: 1, height: 40, background: '#222', flexShrink: 0 },
  streak: { fontSize: 13, fontWeight: 700, marginTop: 4 },
  bragRow: { marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  bragUfc: { background: '#2a2000', border: '1px solid #ffd70066', borderRadius: 8, color: '#ffd700', fontSize: 13, fontWeight: 700, padding: '8px 18px' },
  bragBmf: { background: '#0f0f0f', border: '1px solid #c8a00066', borderRadius: 8, color: '#c8a000', fontSize: 13, fontWeight: 700, padding: '8px 18px', letterSpacing: 0.5 },
  bragBoth: { background: '#1a1000', border: '1px solid #ffd70066', borderRadius: 8, color: '#ffd700', fontSize: 13, fontWeight: 700, padding: '8px 18px', textAlign: 'center' },
};
