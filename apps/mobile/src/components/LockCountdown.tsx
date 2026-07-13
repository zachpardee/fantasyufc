import { useEffect, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';

// Live "Picks lock in 2h 14m" label. Lock time = prelims start (or event start
// when no prelims time is set) minus the server's 10-minute buffer. Renders
// nothing once the lock has passed — the LOCKED banner takes over.
export function LockCountdown({
  scheduledAt,
  prelimsAt,
  style,
}: {
  scheduledAt?: string;
  prelimsAt?: string | null;
  style?: StyleProp<TextStyle>;
}) {
  const target = prelimsAt ?? scheduledAt;
  const lockMs = target ? new Date(target).getTime() - 10 * 60 * 1000 : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (lockMs === null) return null;
  const remaining = lockMs - now;
  if (remaining <= 0) return null;

  const totalMinutes = Math.floor(remaining / 60_000);
  const d = Math.floor(totalMinutes / (24 * 60));
  const h = Math.floor((totalMinutes % (24 * 60)) / 60);
  const m = totalMinutes % 60;
  const text =
    d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : totalMinutes >= 1 ? `${m}m` : 'less than 1m';

  return (
    <Text style={[{ color: '#e0a000', fontSize: 12, fontWeight: '700' }, style]}>
      Picks lock in {text}
    </Text>
  );
}
