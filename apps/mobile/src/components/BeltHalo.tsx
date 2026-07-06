import { View } from 'react-native';
import Svg, { Rect, Circle, Polygon, Text as SvgText } from 'react-native-svg';

// Championship belt worn as a halo above (or below) a member avatar. Ported from the
// web app's BeltHalo so the mobile app shows the same UFC (gold) and BMF (black) belts.
export function BeltHalo({
  size,
  variant = 'ufc',
  position = 'top',
  offset = 0,
}: {
  size: number;
  variant?: 'ufc' | 'bmf';
  position?: 'top' | 'bottom';
  offset?: number;
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
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        ...(position === 'bottom'
          ? { top: size * 1.04 + offset }
          : { top: -(size * 0.34) + offset }),
        left: '50%',
        marginLeft: -w / 2,
        width: w,
        height: h,
        zIndex: 2,
      }}
    >
      <Svg viewBox="0 0 200 32" width={w} height={h}>
        <Rect x="0" y="11" width="200" height="10" fill="#111" />
        <Rect x="0" y="11" width="200" height="1.2" fill={strapEdge} />
        <Rect x="0" y="19.8" width="200" height="1.2" fill={strapEdge} />
        <Circle cx="6" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="6" cy="17.5" r="1" fill={rivetColor} />
        <Circle cx="11" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="11" cy="17.5" r="1" fill={rivetColor} />
        <Circle cx="16" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="16" cy="17.5" r="1" fill={rivetColor} />
        <Circle cx="184" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="184" cy="17.5" r="1" fill={rivetColor} />
        <Circle cx="189" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="189" cy="17.5" r="1" fill={rivetColor} />
        <Circle cx="194" cy="14.5" r="1" fill={rivetColor} />
        <Circle cx="194" cy="17.5" r="1" fill={rivetColor} />
        <Polygon
          points="37,1 57,1 63,7 63,25 57,31 37,31 31,25 31,7"
          fill={sideOuter}
          stroke={rivetColor}
          strokeWidth="0.8"
        />
        <Polygon
          points="38,3 56,3 61,8 61,24 56,29 38,29 33,24 33,8"
          fill={sideRing1Fill}
          stroke={sideRing1Stroke}
          strokeWidth="0.5"
        />
        <Polygon points="39,5 55,5 59,10 59,22 55,27 39,27 35,22 35,10" fill={sideRing2} />
        <Rect x="39" y="5" width="20" height="7" rx="1" fill={sideHighlight} />
        <Polygon
          points="80,0 120,0 131,9 131,23 120,32 80,32 69,23 69,9"
          fill={centerOuter}
          stroke={centerOuterStroke}
          strokeWidth="0.5"
        />
        <Polygon points="83,3 117,3 127,11 127,21 117,29 83,29 73,21 73,11" fill={centerMid} />
        <Polygon points="85,5 115,5 124,13 124,19 115,27 85,27 76,19 76,13" fill={centerInner} />
        <Rect x="86" y="5" width="28" height="8" rx="1" fill={centerHighlight} />
        <SvgText
          x="100"
          y="22"
          textAnchor="middle"
          fontSize="9"
          fontWeight="900"
          fill={textColor}
          letterSpacing="1.5"
        >
          {label}
        </SvgText>
        <Polygon
          points="143,1 163,1 169,7 169,25 163,31 143,31 137,25 137,7"
          fill={sideOuter}
          stroke={rivetColor}
          strokeWidth="0.8"
        />
        <Polygon
          points="144,3 162,3 167,8 167,24 162,29 144,29 139,24 139,8"
          fill={sideRing1Fill}
          stroke={sideRing1Stroke}
          strokeWidth="0.5"
        />
        <Polygon points="145,5 161,5 165,10 165,22 161,27 145,27 141,22 141,10" fill={sideRing2} />
        <Rect x="145" y="5" width="20" height="7" rx="1" fill={sideHighlight} />
      </Svg>
    </View>
  );
}
