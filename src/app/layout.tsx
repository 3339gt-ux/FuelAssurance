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
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              const theme = localStorage.getItem('theme') || 'system';
              if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (_) {}
          })();
        ` }} />
      </head>
      <body className="font-sans antialiased bg-surface-50 dark:bg-surface-0 text-surface-900 dark:text-surface-950">
        {children}
      </body>
    </html>
  );
}
