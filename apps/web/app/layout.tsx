import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Recipe Systems',
  description: 'Recipe analysis across nine fixed views',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-rice-flour font-sans text-charred-cumin antialiased">{children}</body>
    </html>
  );
}
