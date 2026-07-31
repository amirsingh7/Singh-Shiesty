import { ImageResponse } from 'next/og'

/**
 * App icon — generated at build time via next/og (no sharp / ImageMagick, no
 * committed binary). Next auto-injects this as the favicon + `<link rel=icon>`
 * and the manifest references it. The mark is the PR Portfolio seal: a bold
 * "PR" monogram inside a ring, on the warm near-black ground — a verified
 * record stamp, not a gem. Rendered natively by Satori (flex + text), no
 * embedded raster SVG, so it stays crisp at every size next/og emits.
 */
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#14100d',
        }}
      >
        <div
          style={{
            width: 420,
            height: 420,
            borderRadius: 48,
            border: '14px solid #2554E8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(37,84,232,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 220,
              fontWeight: 800,
              letterSpacing: -8,
              color: '#F5EDE2',
              fontFamily: 'Arial, sans-serif',
            }}
          >
            PR
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
