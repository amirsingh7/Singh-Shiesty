import { ImageResponse } from 'next/og'

/**
 * Apple touch icon (iOS "Add to Home Screen"). 180×180, fully opaque dark
 * background (iOS ignores transparency and adds its own rounding). Same
 * PR Portfolio seal mark as app/icon.tsx, sized for the smaller canvas.
 */
export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0D14',
        }}
      >
        <div
          style={{
            width: 148,
            height: 148,
            borderRadius: 18,
            border: '6px solid #2554E8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(37,84,232,0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 78,
              fontWeight: 800,
              letterSpacing: -3,
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
