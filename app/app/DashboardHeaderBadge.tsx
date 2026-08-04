import styles from './dashboardHeaderBadge.module.css'

/**
 * DashboardHeaderBadge — the PR Portfolio mark mounted next to the
 * dashboard greeting. Rounds 1-4 were a hand-drawn SVG recreation of the
 * coin/medallion concept (per-glyph rim text, broken ring, two-tone
 * monogram, etc). Round 5: swapped to the user's own finished coin-logo
 * render (public/pr-coin-badge.png — cropped from their full "PR
 * Portfolio" poster mockup down to just the coin, since the wordmark and
 * feature icons below it don't fit this small header slot) used verbatim,
 * no recoloring or redrawing. The `.badgeStage` wrapper (breathing glow +
 * hover lift, dashboardHeaderBadge.module.css) is unchanged so the mark
 * still animates the same way it always has.
 */

interface DashboardHeaderBadgeProps {
  /** CSS pixel size of the badge stage. Default 200px. */
  size?: number
  className?: string
}

export default function DashboardHeaderBadge({
  size = 200,
  className,
}: DashboardHeaderBadgeProps) {
  const sizeStyle = className ? undefined : { width: size, height: size }

  return (
    <div className={className} style={sizeStyle} aria-hidden>
      <div className={styles.badgeStage} style={sizeStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.badgeSvg} src="/pr-coin-badge.png" alt="" />
      </div>
    </div>
  )
}
