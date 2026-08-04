import { useId } from 'react'
import styles from './dashboardHeaderShield.module.css'

/**
 * DashboardHeaderShield — the PR Portfolio mark mounted next to the
 * dashboard greeting. A flat shield + "PR" monogram with an upward arrow
 * fused into the R's leg (the "Performance Shield" logo concept), recolored
 * from its blue-purple mockup into the site's actual orange/amber accent on
 * dark steel (app/globals.css: --mint, --amber-warm, --mint-glow) so it
 * reads as native to the rest of the UI. Motion is pure CSS — an ambient
 * breathing glow plus a hover lift — no 3D/character behavior.
 */

interface DashboardHeaderShieldProps {
  /** CSS pixel size of the shield stage. Default 200px. */
  size?: number
  className?: string
}

export default function DashboardHeaderShield({
  size = 200,
  className,
}: DashboardHeaderShieldProps) {
  const uid = useId()
  const sizeStyle = className ? undefined : { width: size, height: size }

  const shieldFillId = `shield-fill-${uid}`
  const shieldRimId = `shield-rim-${uid}`
  const letterId = `shield-letters-${uid}`
  const arrowId = `shield-arrow-${uid}`

  return (
    <div className={className} style={sizeStyle} aria-hidden>
      <div className={styles.shieldStage} style={sizeStyle}>
        <svg
          className={styles.shieldSvg}
          viewBox="0 0 100 116"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id={shieldFillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1a2233" />
              <stop offset="100%" stopColor="#0b1220" />
            </linearGradient>
            <linearGradient id={shieldRimId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id={letterId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f8fafc" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>
            <linearGradient id={arrowId} x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#fbbf24" />
            </linearGradient>
          </defs>

          {/* outer shield */}
          <path
            d="M50 3 L90 17 L90 55 C90 84 70 101 50 114 C30 101 10 84 10 55 L10 17 Z"
            fill={`url(#${shieldFillId})`}
            stroke={`url(#${shieldRimId})`}
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
          {/* inset bevel line */}
          <path
            d="M50 10 L82 21 L82 54 C82 78 66 92 50 103 C34 92 18 78 18 54 L18 21 Z"
            fill="none"
            stroke="rgba(248,250,252,0.16)"
            strokeWidth="1.2"
          />

          <text
            x="50"
            y="78"
            textAnchor="middle"
            fontFamily="Arial, sans-serif"
            fontWeight="800"
            fontSize="46"
            letterSpacing="-2"
            fill={`url(#${letterId})`}
          >
            PR
          </text>

          {/* upward arrow, fused into the R's leg, layered over the letters */}
          <line
            x1="48"
            y1="94"
            x2="78"
            y2="42"
            stroke={`url(#${arrowId})`}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <polygon points="78,28 66,50 90,50" fill={`url(#${arrowId})`} />
        </svg>
      </div>
    </div>
  )
}
