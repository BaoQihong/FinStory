import Link from 'next/link';
import { SeshatMark } from './SeshatMark';
import { NavLinks } from './NavLinks';

export function SiteHeader() {
  // Phase 3C: understated navigation. The Phase 2A section pages stay reachable
  // by URL but are delisted (they show prototype content, not published stories).
  const links = [
    { href: '/', label: 'Latest' },
    { href: '/about', label: 'About' },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy-900/95 text-cream-50 backdrop-blur supports-[backdrop-filter]:bg-navy-900/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-3" aria-label="Seshat — home">
          <SeshatMark className="h-9 w-8 text-gold-400 transition-colors group-hover:text-gold-300" />
          <span className="font-display text-[1.6rem] font-semibold tracking-[0.08em]">SESHAT</span>
          <span className="hidden border-l border-white/20 pl-3 font-display text-sm italic text-gold-300 xl:inline">
            The stories behind the numbers
          </span>
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <NavLinks links={links} variant="bar" />
        </nav>

        {/* Mobile menu: native disclosure, no script required */}
        <details className="group relative md:hidden">
          <summary
            className="flex h-10 w-10 items-center justify-center rounded-md text-cream-50 hover:bg-white/10"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 group-open:hidden" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg viewBox="0 0 24 24" className="hidden h-6 w-6 group-open:block" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </summary>
          <nav
            aria-label="Main"
            className="absolute right-0 top-12 w-60 rounded-lg border border-white/10 bg-navy-900 p-2 shadow-2xl"
          >
            <NavLinks links={links} variant="menu" />
          </nav>
        </details>
      </div>
    </header>
  );
}
