import React from 'react';

interface FighterPhotoProps {
  imageUrl?: string | null;
  name?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function FighterPhoto({ imageUrl, name, style, onClick }: FighterPhotoProps) {
  if (imageUrl) {
    return <img src={imageUrl} alt={name ?? ''} style={style} onClick={onClick} />;
  }

  const { width, height, borderRadius, flexShrink, objectFit, objectPosition, background, ...rest } = style ?? {};

  return (
    <div
      style={{
        width, height, borderRadius, flexShrink,
        background: '#181818',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        overflow: 'hidden',
        ...rest,
      }}
      onClick={onClick}
    >
      <svg
        viewBox="0 0 44 54"
        width="100%"
        height="88%"
        preserveAspectRatio="xMidYMax meet"
      >
        {/* Head */}
        <circle cx="22" cy="14" r="8" fill="#2a2a2a" />
        {/* Shoulders / torso silhouette */}
        <path d="M4 54 C4 34 40 34 40 54 Z" fill="#2a2a2a" />
      </svg>
    </div>
  );
}
