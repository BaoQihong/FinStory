'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type L = { href: string; label: string };

export function NavLinks({ links, variant }: { links: L[]; variant: 'bar' | 'menu' }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  if (variant === 'menu') {
    return (
      <ul className="flex flex-col">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={isActive(l.href) ? 'page' : undefined}
              className="block rounded-md px-3 py-2.5 text-[0.95rem] text-cream-100 hover:bg-white/10 aria-[current=page]:text-gold-300"
              onClick={(e) => e.currentTarget.closest('details')?.removeAttribute('open')}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="flex items-center gap-7">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(l.href) ? 'page' : undefined}
            className="relative py-5 text-[0.95rem] text-cream-100/85 transition-colors hover:text-cream-50 aria-[current=page]:text-cream-50 aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:bottom-3 aria-[current=page]:after:h-0.5 aria-[current=page]:after:bg-gold-400"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
