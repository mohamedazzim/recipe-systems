import type { Metadata, Viewport } from 'next';
import { Fraunces, IBM_Plex_Sans, Playfair_Display } from 'next/font/google';
import './globals.css';

// Self-hosted through next/font instead of a remote CSS @import (see globals.css):
// the families, weights and italics match the previous Google Fonts URL exactly,
// but the files ship with the app, so there is no render-blocking third-party
// request and no layout shift — and dev mode parses.
const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-fraunces',
});
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-sans',
});

export const metadata: Metadata = {
  title: 'Recipe Systems',
  description: 'Recipe analysis across nine fixed views',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

// `viewportFit: 'cover'` lets the app paint into the notch/home-indicator area so
// the sticky header spans the full width on iOS; the header and overlay then pay
// it back with env(safe-area-inset-*) padding. Pinch-zoom is deliberately left
// enabled — `maximumScale`/`userScalable` are never set, since blocking zoom is
// an accessibility failure.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${fraunces.variable} ${plexSans.variable}`}
    >
      {/* Body colors come from the token layer in globals.css (--rs-canvas /
          --rs-body) so the dark theme flips them with every other surface. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
