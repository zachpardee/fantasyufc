import { View, Text, Image, StyleSheet } from 'react-native';

interface MemberAvatarProps {
  name: string;
  color?: string;
  size?: number;
  avatarUrl?: string | null;
}

export function MemberAvatar({ name, color, size = 36, avatarUrl }: MemberAvatarProps) {
  const accent = color ?? '#5555ff';

  if (avatarUrl) {
    return (
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
    );
  }

  return (
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
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontWeight: '700' },
});
