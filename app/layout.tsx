import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed, Hanken_Grotesk, JetBrains_Mono } from 'next/font/google'
import { AuthProvider } from '@/lib/auth/AuthProvider'
import './globals.css'

// Fitness-gym restyle: athletic condensed system replacing Inter. Same
// --font-inter variable name so every existing var(--font-inter) consumer
// just picks up the new face without a rename.
const inter = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

// Display/heading face — bold condensed, the poster/gym-board look. Same
// --font-serif variable so every existing var(--font-serif) consumer
// (globals.css .serif/.serif-italic, inline styles) just picks up the new
// face without a rename.
const instrumentSerif = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-serif',
  display: 'swap',
})

// Sans-serif body face used by the landing hero (matches the Claude Design v1
// prototype — Hanken Grotesk reads softer than Inter at small sizes and gives
// the editorial chrome a magazine-typesetting feel).
const hankenGrotesk = Hanken_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-hanken',
  display: 'swap',
})

// Monospace used by the landing eyebrow, footer coordinates, and museum caps.
const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PR Portfolio',
  description: 'Your verified athletic record — training, recovery, and proof.',
  applicationName: 'PR Portfolio',
  // Installable PWA: opens fullscreen from the home screen, no Safari chrome.
  // (manifest.ts + app/icon.tsx + app/apple-icon.tsx are auto-linked by Next.)
  appleWebApp: {
    capable: true,
    title: 'PR Portfolio',
    statusBarStyle: 'black-translucent',
  },
  // Modern equivalent of the (deprecated) apple-mobile-web-app-capable meta that
  // `appleWebApp.capable` emits — keeps both so non-iOS browsers stop warning.
  other: { 'mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
}

// Mobile scaling + brand-dark browser/status-bar chrome. viewportFit:'cover'
// lets the standalone app paint under the iPhone notch / home indicator;
// userScalable:false stops double-tap-zoom fighting tap targets in the dense
// logger UI.
export const viewport: Viewport = {
  themeColor: '#1F2937',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable} ${hankenGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
