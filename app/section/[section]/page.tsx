import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { articlesInSection, getSection, sections } from '@/content';
import { StoryCard } from '@/components/editorial/StoryCard';

export function generateStaticParams() {
  return sections.map((s) => ({ section: s.key }));
}

export async function generateMetadata({ params }: PageProps<'/section/[section]'>): Promise<Metadata> {
  const { section } = await params;
  const s = getSection(section);
  return s ? { title: s.name, description: s.description } : {};
}

export default async function SectionPage({ params }: PageProps<'/section/[section]'>) {
  const { section } = await params;
  const s = getSection(section);
  if (!s) notFound();
  const items = articlesInSection(s.key);
  return (
    <>
      <header className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8 sm:py-16">
          <p className="kicker text-gold-700">Section</p>
          <h1 className="mt-3 font-display text-5xl font-semibold text-navy-900 sm:text-6xl">{s.name}</h1>
          <p className="mt-4 max-w-xl font-serif text-xl leading-relaxed text-ink-soft">{s.description}</p>
        </div>
      </header>
      <section aria-label={`${s.name} stories`} className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-3 md:gap-8">
          {items.map((a) => (
            <StoryCard key={a.slug} article={a} sectionName={s.name} />
          ))}
        </div>
        <p className="mt-14 text-sm text-muted">
          Seshat is a new publication. More {s.name.toLowerCase()} stories will appear here as they are published.
        </p>
      </section>
    </>
  );
}
