interface Props {
  teamName: string;
  color: string;
  size: number;
  avatarUrl?: string;
  borderWidth?: number;
  title?: string;
  onClick?: () => void;
}

export function MemberAvatar({
  teamName,
  color,
  size,
  avatarUrl,
  borderWidth = 2,
  title,
  onClick,
}: Props) {
  const base: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `${borderWidth}px solid ${color}`,
    flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
  };

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={teamName}
        title={title}
        style={{ ...base, objectFit: 'cover' }}
        onClick={onClick}
      />
    );
  }

  return (
    <div
      style={{
        ...base,
        background: color + '33',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.4)),
        fontWeight: 700,
        color: '#fff',
      }}
      title={title}
      onClick={onClick}
    >
      {teamName.charAt(0).toUpperCase()}
    </div>
  );
}
