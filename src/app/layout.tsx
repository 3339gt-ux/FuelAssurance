import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Fuel Assurance — Reconciliation Platform',
  description: 'Financial reconciliation, fuel-transaction assurance, telematics verification and management reporting for DKV, AS24 and future providers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable}`}>
      <body className="font-sans antialiased bg-surface-100 text-surface-900">
        {children}
      </body>
    </html>
  );
}
