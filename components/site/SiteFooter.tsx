import Link from 'next/link';
import { sections } from '@/content';
import { SeshatMark } from './SeshatMark';

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-navy-950 text-cream-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-cream-50">
            <SeshatMark className="h-9 w-8 text-gold-400" />
            <span className="font-display text-2xl font-semibold tracking-[0.08em]">SESHAT</span>
          </Link>
          <p className="mt-4 max-w-sm font-display text-lg italic leading-snug text-gold-300">
            The stories behind the numbers.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-200/80">
            Named for the ancient Egyptian goddess of writing, mathematics and measurement. Independent financial
            journalism, written by people and measured against real data.
          </p>
        </div>
        <nav aria-label="Footer sections">
          <h2 className="kicker text-gold-300">Sections</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {sections.map((s) => (
              <li key={s.key}>
                <Link className="hover:text-cream-50" href={`/section/${s.key}`}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className="kicker text-gold-300">Seshat</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="hover:text-cream-50" href="/about">
                About Seshat
              </Link>
            </li>
            <li>
              <Link className="hover:text-cream-50" href="/about#standards">
                Editorial &amp; data standards
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-5 py-6 text-xs leading-relaxed text-cream-200/70 sm:px-8">
          Prototype edition. Economic data from FRED, Federal Reserve Bank of St. Louis. Content is for general
          information and education only and is not investment advice.
        </p>
      </div>
    </footer>
  );
}
