import { useId } from 'react'
import styles from './dashboardHeaderBadge.module.css'

/**
 * DashboardHeaderBadge — the PR Portfolio mark mounted next to the
 * dashboard greeting. The "Digital Weight Plate" logo concept: a coin/plate
 * medallion with "PERSONAL RECORDS" / "VERIFIED PROGRESS" engraved along
 * the rim and a "PR" monogram at center, recolored from its blue-purple
 * mockup into the site's actual orange/amber accent on dark steel
 * (app/globals.css: --mint, --amber-warm, --mint-glow). Set in
 * var(--font-serif) — the same Barlow Condensed poster face used for every
 * other heading on the site — rather than a generic sans, so the mark
 * reads as part of the brand instead of a placeholder. Motion is pure CSS:
 * an ambient breathing glow plus a hover lift.
 *
 * Rim text is laid out by hand (per-glyph x/y/rotate) rather than
 * <textPath> — SVG's textPath orientation for a bottom-of-circle arc is
 * easy to get upside-down, so each glyph's position and rotation is
 * computed directly: top-arc glyphs face outward (rotation = angle from
 * top), bottom-arc glyphs face inward toward center (rotation = angle +
 * 180) so they read upright like the lettering on a real coin rim. Top and
 * bottom use different baseline radii (not the same radius) because a
 * glyph's ink sits on the *outward* side of its baseline for the top arc
 * but the *inward* side for the inverted bottom arc — using one shared
 * radius for both left the rim text floating outside the ring on top and
 * bleeding past it on the bottom instead of sitting centered in the band.
 *
 * Round 4: the plain full-ring coin read as a generic "achievement badge"
 * template (every fitness app has one). Pushed it further from that
 * cliché without abandoning the coin format: the outer ring is now a
 * broken arc (a deliberate gap at the bottom, not a full circle), an
 * upper-left highlight + lower-right shadow arc sit on top of it to fake
 * real directional bevel light instead of a flat gradient, the face uses
 * a radial (not linear) gradient so it reads as lit from one side, and
 * the "PR" monogram is two-tone — P in the steel/silver gradient, R in
 * the same orange gradient as the ring — so the mark visually fuses with
 * its own rim instead of sitting on top of it as a flat sticker.
 */

interface DashboardHeaderBadgeProps {
  /** CSS pixel size of the badge stage. Default 200px. */
  size?: number
  className?: string
}

const CX = 50
const CY = 50
const RING_OUTER = 46
const FACE_R = 36.5
const BAND_CENTER = (RING_OUTER + FACE_R) / 2
const RIM_FONT_SIZE = 7.2
const RIM_CAP_HEIGHT = RIM_FONT_SIZE * 0.72
const TOP_RADIUS = BAND_CENTER - RIM_CAP_HEIGHT / 2
const BOTTOM_RADIUS = BAND_CENTER + RIM_CAP_HEIGHT / 2

/** Per-glyph x/y/rotation for text following a circular arc. `spreadDeg` is
 *  the half-angle the string spans either side of top-dead-center (0deg).
 *  `invert` flips the glyphs to read upright along the bottom of the circle.
 *  Spacing is by cumulative glyph *weight*, not raw character count — a
 *  space counted as a full letter-width (the old behavior) shoved the two
 *  words apart and read as each word being off-center/misaligned on its
 *  own half of the arc. */
function arcLayout(text: string, radius: number, spreadDeg: number, invert: boolean) {
  const chars = text.split('')
  const weights = chars.map((ch) => (ch === ' ' ? 0.45 : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let cum = 0
  const centers = weights.map((w) => {
    const c = cum + w / 2
    cum += w
    return c
  })
  return chars.map((ch, i) => {
    const frac = total === 0 ? 0 : (centers[i] / total) * 2 - 1 // -1..1 left-to-right
    const theta = invert ? 180 - spreadDeg * frac : spreadDeg * frac
    const rad = (theta * Math.PI) / 180
    const x = CX + radius * Math.sin(rad)
    const y = CY - radius * Math.cos(rad)
    const rotate = invert ? theta + 180 : theta
    return { ch, x, y, rotate }
  })
}

function RimText({
  glyphs,
  fill,
}: {
  glyphs: { ch: string; x: number; y: number; rotate: number }[]
  fill: string
}) {
  return (
    <text
      fontFamily="var(--font-serif), Arial, sans-serif"
      fontWeight={700}
      fontSize={RIM_FONT_SIZE}
      fill={fill}
      textAnchor="middle"
    >
      {glyphs.map((g, i) => (
        <tspan key={i} x={g.x} y={g.y} rotate={g.rotate}>{g.ch}</tspan>
      ))}
    </text>
  )
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

  const topGlyphs = arcLayout('PERSONAL RECORDS', TOP_RADIUS, 60, false)
  const bottomGlyphs = arcLayout('VERIFIED PROGRESS', BOTTOM_RADIUS, 60, true)

  return (
    <div className={className} style={sizeStyle} aria-hidden>
      <div className={styles.badgeStage} style={sizeStyle}>
        <svg
          className={styles.badgeSvg}
          viewBox="0 0 100 100"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id={plateId} cx="35%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#22304a" />
              <stop offset="100%" stopColor="#0a111d" />
            </radialGradient>
            <linearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <radialGradient id={faceId} cx="38%" cy="30%" r="80%">
              <stop offset="0%" stopColor="#2b3650" />
              <stop offset="100%" stopColor="#111826" />
            </radialGradient>
            <linearGradient id={letterId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
          </defs>

          {/* outer plate disc */}
          <circle cx="50" cy="50" r={RING_OUTER} fill={`url(#${plateId})`} />

          {/* rim ring — broken at the bottom, not a plain full circle */}
          <path
            d="M 35.79 93.75 A 46 46 0 1 1 64.21 93.75"
            fill="none"
            stroke={`url(#${rimId})`}
            strokeWidth="2.6"
            strokeLinecap="round"
          />

          {/* directional bevel: upper-left highlight, lower-right shadow, standing in for real light instead of a flat glow */}
          <path d="M 4 50 A 46 46 0 0 1 50 4" fill="none" stroke="rgba(248,250,252,0.4)" strokeWidth="1.1" strokeLinecap="round" />
          <path d="M 96 50 A 46 46 0 0 1 64.21 93.75" fill="none" stroke="rgba(0,0,0,0.4)" strokeWidth="1.1" strokeLinecap="round" />

          {/* glowing accent ticks, east + west, like the mockup's flanking light marks */}
          <g stroke={`url(#${rimId})`} strokeWidth="2.4" strokeLinecap="round" className={styles.accentTicks}>
            <line x1="93.5" y1="43" x2="93.5" y2="57" />
            <line x1="6.5" y1="43" x2="6.5" y2="57" />
          </g>

          {/* inner face */}
          <circle cx="50" cy="50" r={FACE_R} fill={`url(#${faceId})`} stroke="rgba(248,250,252,0.14)" strokeWidth="1" />

          {/* rim lettering — dark emboss pass, then the lit pass on top */}
          <g transform="translate(0.45, 0.6)">
            <RimText glyphs={topGlyphs} fill="rgba(0,0,0,0.55)" />
            <RimText glyphs={bottomGlyphs} fill="rgba(0,0,0,0.55)" />
          </g>
          <RimText glyphs={topGlyphs} fill="rgba(226,232,240,0.8)" />
          <RimText glyphs={bottomGlyphs} fill="rgba(226,232,240,0.8)" />

          {/* PR monogram — dark emboss pass, then a two-tone lit pass: P in steel, R in the ring's own orange */}
          <text
            x="50.6"
            y="65.7"
            textAnchor="middle"
            fontFamily="var(--font-serif), Arial, sans-serif"
            fontWeight={700}
            fontSize="46"
            fill="rgba(0,0,0,0.6)"
          >
            PR
          </text>
          <text
            x="50"
            y="65"
            textAnchor="middle"
            fontFamily="var(--font-serif), Arial, sans-serif"
            fontWeight={700}
            fontSize="46"
          >
            <tspan fill={`url(#${letterId})`}>P</tspan>
            <tspan fill={`url(#${rimId})`}>R</tspan>
          </text>
        </svg>
      </div>
    </div>
  )
}
