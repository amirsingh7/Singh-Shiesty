import type { MetadataRoute } from 'next'

/**
 * Web app manifest — makes Vitality installable as a PWA ("Add to Home
 * Screen"). display:standalone drops the browser chrome so it opens fullscreen
 * like a native app; start_url goes straight to the dashboard. Icons are the
 * build-time generated app icons (app/icon.tsx, app/apple-icon.tsx).
 *
 * Native iOS/Android apps are a v2 item (see STRATEGY.md); the PWA is the
 * launch-time install path and takes no app-store cut.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PR Portfolio',
    short_name: 'PR Portfolio',
    description: 'Your verified athletic record: training, recovery, and proof.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0D14',
    theme_color: '#0A0D14',
    icons: [
      { src: '/icon', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
