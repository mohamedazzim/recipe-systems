import type { Metadata } from 'next';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      {/* Body colors come from the token layer in globals.css (--rs-canvas /
          --rs-body) so the dark theme flips them with every other surface. */}
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
