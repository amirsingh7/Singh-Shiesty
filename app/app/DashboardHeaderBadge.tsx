import { useId } from 'react'
import styles from './dashboardHeaderBadge.module.css'

/**
 * DashboardHeaderBadge — the PR Portfolio mark mounted next to the
 * dashboard greeting. The "Digital Weight Plate" logo concept: a coin/plate
 * medallion with "PERSONAL RECORDS" / "VERIFIED PROGRESS" engraved along
 * the rim and a bold "PR" monogram at center, recolored from its
 * blue-purple mockup into the site's actual orange/amber accent on dark
 * steel (app/globals.css: --mint, --amber-warm, --mint-glow). Motion is
 * pure CSS — an ambient breathing glow plus a hover lift.
 *
 * Rim text is laid out by hand (per-glyph x/y/rotate) rather than
 * <textPath> — SVG's textPath orientation for a bottom-of-circle arc is
 * easy to get upside-down, so each glyph's position and rotation is
 * computed directly: top-arc glyphs face outward (rotation = angle from
 * top), bottom-arc glyphs face inward toward center (rotation = angle +
 * 180) so they read upright like the lettering on a real coin rim.
 */

interface DashboardHeaderBadgeProps {
  /** CSS pixel size of the badge stage. Default 200px. */
  size?: number
  className?: string
}

const CX = 50
const CY = 50

/** Per-glyph x/y/rotation for text following a circular arc. `spreadDeg` is
 *  the half-angle the string spans either side of top-dead-center (0deg).
 *  `invert` flips the glyphs to read upright along the bottom of the circle. */
function arcLayout(text: string, radius: number, spreadDeg: number, invert: boolean) {
  const chars = text.split('')
  const n = chars.length
  return chars.map((ch, i) => {
    const frac = n === 1 ? 0 : (i / (n - 1)) * 2 - 1 // -1..1 left-to-right
    const theta = invert ? 180 - spreadDeg * frac : spreadDeg * frac
    const rad = (theta * Math.PI) / 180
    const x = CX + radius * Math.sin(rad)
    const y = CY - radius * Math.cos(rad)
    const rotate = invert ? theta + 180 : theta
    return { ch, x, y, rotate }
  })
}

export default function DashboardHeaderBadge({
  size = 200,
  className,
}: DashboardHeaderBadgeProps) {
  const uid = useId()
  const sizeStyle = className ? undefined : { width: size, height: size }

  const plateId = `badge-plate-${uid}`
  const rimId = `badge-rim-${uid}`
  const faceId = `badge-face-${uid}`
  const letterId = `badge-letters-${uid}`

  const topGlyphs = arcLayout('PERSONAL RECORDS', 41.5, 62, false)
  const bottomGlyphs = arcLayout('VERIFIED PROGRESS', 41.5, 62, true)

  return (
    <div className={className} style={sizeStyle} aria-hidden>
      <div className={styles.badgeStage} style={sizeStyle}>
        <svg
          className={styles.badgeSvg}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={plateId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2233" />
              <stop offset="100%" stopColor="#0b1220" />
            </linearGradient>
            <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id={faceId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#242e42" />
              <stop offset="100%" stopColor="#141b29" />
            </linearGradient>
            <linearGradient id={letterId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          {/* outer plate */}
          <circle cx="50" cy="50" r="46" fill={`url(#${plateId})`} stroke={`url(#${rimId})`} strokeWidth="2.6" />

          {/* glowing accent ticks, east + west, like the mockup's flanking light marks */}
          <g stroke={`url(#${rimId})`} strokeWidth="2.4" strokeLinecap="round" className={styles.accentTicks}>
            <line x1="93.5" y1="43" x2="93.5" y2="57" />
            <line x1="6.5" y1="43" x2="6.5" y2="57" />
          </g>

          {/* inner face */}
          <circle cx="50" cy="50" r="36.5" fill={`url(#${faceId})`} stroke="rgba(248,250,252,0.14)" strokeWidth="1" />

          {/* rim lettering */}
          <text
            fontFamily="Arial, sans-serif"
            fontWeight="700"
            fontSize="6.4"
            letterSpacing="0.5"
            fill="rgba(226,232,240,0.72)"
            textAnchor="middle"
          >
            {topGlyphs.map((g, i) => (
              <tspan key={i} x={g.x} y={g.y} rotate={g.rotate}>{g.ch}</tspan>
            ))}
          </text>
          <text
            fontFamily="Arial, sans-serif"
            fontWeight="700"
            fontSize="6.4"
            letterSpacing="0.5"
            fill="rgba(226,232,240,0.72)"
            textAnchor="middle"
          >
            {bottomGlyphs.map((g, i) => (
              <tspan key={i} x={g.x} y={g.y} rotate={g.rotate}>{g.ch}</tspan>
            ))}
          </text>

          {/* PR monogram */}
          <text
            x="50"
            y="64"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontWeight="800"
            fontSize="38"
            letterSpacing="-2"
            fill={`url(#${letterId})`}
          >
            PR
          </text>
        </svg>
      </div>
    </div>
  )
}
