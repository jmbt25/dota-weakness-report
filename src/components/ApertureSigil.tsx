interface ApertureSigilProps {
  size?: number
  mono?: boolean
  className?: string
}

/**
 * Aperture Sigil — original cosmic-divination identity. Iris-in-hex
 * bisected by a red gash. No Valve trademarks; safe to ship.
 */
export function ApertureSigil({ size = 64, mono = false, className }: ApertureSigilProps) {
  const violet = mono ? '#ECE6D6' : '#6E4FB8'
  const red = mono ? '#ECE6D6' : '#E94560'
  const irisInner = mono ? '#ECE6D6' : '#7d4fb8'
  const irisInnerOpacity = 0.9
  const irisMidStop = mono ? '#ECE6D6' : '#2A2456'
  const irisMidOpacity = mono ? 0.4 : 1
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      aria-label="Dota Weakness Report"
      role="img"
    >
      <defs>
        <radialGradient id="apIris" cx="50%" cy="45%" r="55%">
          <stop offset="0%" stopColor={irisInner} stopOpacity={irisInnerOpacity} />
          <stop offset="60%" stopColor={irisMidStop} stopOpacity={irisMidOpacity} />
          <stop offset="100%" stopColor="#07080d" />
        </radialGradient>
        <filter id="apGlow"><feGaussianBlur stdDeviation="2" /></filter>
      </defs>
      <polygon
        points="100,8 173,50 173,150 100,192 27,150 27,50"
        fill="none"
        stroke={violet}
        strokeWidth="1.6"
        opacity="0.85"
      />
      <polygon
        points="100,20 162,56 162,144 100,180 38,144 38,56"
        fill="none"
        stroke={violet}
        strokeWidth="0.8"
        opacity="0.55"
      />
      {[
        [100, 8], [173, 50], [173, 150],
        [100, 192], [27, 150], [27, 50],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill={red} />
      ))}
      <circle cx="100" cy="100" r="58" fill="url(#apIris)" stroke={violet} strokeWidth="1.2" />
      <circle cx="100" cy="100" r="46" fill="none" stroke={violet} strokeWidth="0.6" opacity="0.6" />
      <circle cx="100" cy="100" r="32" fill="none" stroke={violet} strokeWidth="0.6" opacity="0.5" />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * Math.PI * 2) / 12
        const x1 = 100 + Math.cos(a) * 34
        const y1 = 100 + Math.sin(a) * 34
        const x2 = 100 + Math.cos(a) * 54
        const y2 = 100 + Math.sin(a) * 54
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={violet}
            strokeWidth="0.5"
            opacity="0.5"
          />
        )
      })}
      <circle cx="100" cy="100" r="14" fill="#07080d" stroke={red} strokeWidth="1" />
      <circle
        cx="100"
        cy="100"
        r="5"
        fill={red}
        filter={mono ? undefined : 'url(#apGlow)'}
      />
      <path d="M 38 70 L 162 130" stroke={red} strokeWidth="2.2" strokeLinecap="round" opacity="0.95" />
      <path d="M 38 70 L 162 130" stroke="#fff" strokeWidth="0.6" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

/** Steam icon used inside the landing input. */
export function SteamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="10" />
      <circle cx="15.5" cy="9" r="2.5" />
      <circle cx="8.5" cy="15.5" r="1.8" />
      <path d="M2 14 L7 16 M15.5 6.5 L15.5 11.5" />
    </svg>
  )
}

/** Skull glyph for the example card on the landing. */
export function SkullSm() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E94560" strokeWidth="1.5">
      <path d="M12 3 C7 3 4 6 4 11 C4 13 5 15 7 16 L7 19 L9 19 L9 18 L15 18 L15 19 L17 19 L17 16 C19 15 20 13 20 11 C20 6 17 3 12 3 Z" />
      <circle cx="9" cy="11" r="1.4" fill="#E94560" />
      <circle cx="15" cy="11" r="1.4" fill="#E94560" />
    </svg>
  )
}

/** Six medallion glyphs for the landing-page coverage grid. */
export const MedallionIcons = {
  Death: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <path d="M16 4 C9 4 5 9 5 15 C5 19 7 22 10 23 L10 27 L13 27 L13 25 L19 25 L19 27 L22 27 L22 23 C25 22 27 19 27 15 C27 9 23 4 16 4 Z" />
      <circle cx="12" cy="15" r="2" fill="#ECE6D6" />
      <circle cx="20" cy="15" r="2" fill="#ECE6D6" />
      <path d="M14 19 L14 22 M16 19 L16 22 M18 19 L18 22" />
    </svg>
  ),
  Farm: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <circle cx="16" cy="16" r="9" />
      <path d="M16 11 L16 21 M13 13 L19 13 M13 19 L19 19" />
      <circle cx="16" cy="16" r="12" strokeDasharray="2 3" opacity="0.5" />
    </svg>
  ),
  Item: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <rect x="6" y="6" width="9" height="9" />
      <rect x="17" y="6" width="9" height="9" />
      <rect x="6" y="17" width="9" height="9" />
      <rect x="17" y="17" width="9" height="9" stroke="#E94560" />
    </svg>
  ),
  Hero: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <circle cx="16" cy="12" r="5" />
      <path d="M6 28 C6 22 10 19 16 19 C22 19 26 22 26 28" />
    </svg>
  ),
  Stack: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <rect x="6" y="20" width="20" height="6" />
      <rect x="9" y="13" width="14" height="6" />
      <rect x="12" y="6" width="8" height="6" />
    </svg>
  ),
  Vision: () => (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="#ECE6D6" strokeWidth="1.4">
      <path d="M3 16 C7 9 11 6 16 6 C21 6 25 9 29 16 C25 23 21 26 16 26 C11 26 7 23 3 16 Z" />
      <circle cx="16" cy="16" r="4" />
      <circle cx="16" cy="16" r="1.5" fill="#E94560" stroke="none" />
    </svg>
  ),
}
