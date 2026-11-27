'use client';

import { useEffect, useState } from 'react';

export type Chapter = { id: string; label: string; blurb: string };

/**
 * Chapter navigation for the five-layer article. Desktop: a sticky rail
 * beside the text. Mobile: a sticky tab bar under the site header. Plain
 * anchor links, so it works without JavaScript; JS only adds the
 * "you are here" highlight.
 */
export function ChapterNav({ chapters, variant }: { chapters: Chapter[]; variant: 'rail' | 'bar' }) {
  const [active, setActive] = useState(chapters[0]?.id);

  useEffect(() => {
    const els = chapters.map((c) => document.getElementById(c.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [chapters]);

  if (variant === 'bar') {
    return (
      <nav aria-label="Chapters" className="sticky top-16 z-30 border-b border-cream-300 bg-cream-50/95 backdrop-blur lg:hidden">
        <ol className="mx-auto grid max-w-3xl grid-cols-4">
          {chapters.map((c) => (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                aria-current={active === c.id ? 'location' : undefined}
                className="block border-b-2 border-transparent py-3 text-center text-[0.8rem] font-semibold text-muted aria-[current=location]:border-gold-500 aria-[current=location]:text-navy-900"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    );
  }

  return (
    <nav aria-label="Chapters" className="sticky top-28 hidden lg:block">
      <p className="kicker mb-4 text-gold-700">In this story</p>
      <ol className="relative space-y-6 border-l border-cream-300 pl-6">
        {chapters.map((c, i) => {
          const on = active === c.id;
          return (
            <li key={c.id} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[31px] top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 transition-colors ${
                  on ? 'border-gold-500 bg-gold-400' : 'border-cream-300 bg-cream-100'
                }`}
              />
              <a href={`#${c.id}`} aria-current={on ? 'location' : undefined} className="group block">
                <span className="text-[0.7rem] font-semibold tabular-nums text-muted">0{i + 1}</span>
                <span
                  className={`block font-display text-lg font-semibold leading-tight transition-colors ${
                    on ? 'text-navy-900' : 'text-ink-soft group-hover:text-navy-900'
                  }`}
                >
                  {c.label}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{c.blurb}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
