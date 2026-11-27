import Link from 'next/link';
import { SeshatMark } from '@/components/site/SeshatMark';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-24 text-center">
      <SeshatMark className="h-16 w-14 text-gold-500" />
      <p className="kicker mt-6 text-gold-700">Page not found</p>
      <h1 className="mt-3 font-display text-4xl font-semibold text-navy-900">This page hasn’t been written</h1>
      <p className="mt-4 text-ink-soft">The link may be mistyped, or the story may not exist yet.</p>
      <Link href="/" className="mt-8 rounded-full bg-navy-900 px-6 py-3 text-sm font-semibold text-cream-50 hover:bg-navy-700">
        Back to the front page
      </Link>
    </div>
  );
}
