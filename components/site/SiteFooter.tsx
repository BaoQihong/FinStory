import Link from 'next/link';
import { SeshatMark } from './SeshatMark';

export function SiteFooter() {
  return (
    <footer className="mt-24 bg-navy-950 text-cream-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[2fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3 text-cream-50">
            <SeshatMark className="h-9 w-8 text-gold-400" />
            <span className="font-display text-2xl font-semibold tracking-[0.08em]">SESHAT</span>
          </Link>
          <p className="mt-4 max-w-sm font-display text-lg italic leading-snug text-gold-300">
            The stories behind the numbers.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-200/80">
            Named for the ancient Egyptian goddess of writing, mathematics and measurement. Creating narratives and
            macro analytics from data and numbers.
          </p>
        </div>
        <div>
          <h2 className="kicker text-gold-300">Seshat</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li>
              <Link className="hover:text-cream-50" href="/">
                Latest stories
              </Link>
            </li>
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
          Data is credited to its sources in each story. Content is for general information and education only and is
          not investment advice.
        </p>
      </div>
    </footer>
  );
}
