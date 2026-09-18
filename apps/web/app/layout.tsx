import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Recipe Systems',
  description: 'Recipe analysis across nine fixed views',
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
