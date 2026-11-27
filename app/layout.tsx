import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, Source_Serif_4 } from 'next/font/google';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import './globals.css';

const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], axes: ['opsz', 'SOFT'] });
const sourceSerif = Source_Serif_4({ variable: '--font-source-serif', subsets: ['latin'], style: ['normal', 'italic'] });
const inter = Inter({ variable: '--font-inter', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Seshat — The stories behind the numbers', template: '%s · Seshat' },
  description:
    'Seshat is an independent financial publication that makes economics, markets and wealth understandable — human journalism measured against real data.',
};

export const viewport: Viewport = { themeColor: '#0f1d38' };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB" className={`${fraunces.variable} ${sourceSerif.variable} ${inter.variable} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded bg-gold-300 px-4 py-2 text-navy-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
