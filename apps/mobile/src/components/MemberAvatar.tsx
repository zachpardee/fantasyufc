import { View, Text, Image, StyleSheet } from 'react-native';
import { BeltHalo } from './BeltHalo';

interface MemberAvatarProps {
  name: string;
  color?: string;
  size?: number;
  avatarUrl?: string | null;
  /** Show the gold UFC/League champion belt above the avatar. */
  ufcBelt?: boolean;
  /** Show the black BMF belt above (or below the UFC belt, if both) the avatar. */
  bmfBelt?: boolean;
}

export function MemberAvatar({
  name,
  color,
  size = 36,
  avatarUrl,
  ufcBelt = false,
  bmfBelt = false,
}: MemberAvatarProps) {
  const accent = color ?? '#5555ff';

  const inner = avatarUrl ? (
    <Image
      source={{ uri: avatarUrl }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 2,
        borderColor: accent,
        backgroundColor: '#1a1a1a',
      }}
      resizeMode="cover"
    />
  ) : (
    <View
      style={[
        styles.fallback,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: accent },
      ]}
    >
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>
        {(name ?? '?')[0].toUpperCase()}
      </Text>
    </View>
  );

  if (!ufcBelt && !bmfBelt) return inner;

  // Belts overflow the avatar box, so wrap in a same-size relative container they can
  // sit outside of. On these small avatars both belts stack ABOVE the icon (BMF nearest
  // the head, UFC above it) so neither collides with the name/score beneath.
  const both = ufcBelt && bmfBelt;
  return (
    <View style={{ width: size, height: size }}>
      {inner}
      {bmfBelt && <BeltHalo size={size} variant="bmf" position="top" />}
      {ufcBelt && <BeltHalo size={size} variant="ufc" position="top" offset={both ? -size * 0.32 : 0} />}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
});
