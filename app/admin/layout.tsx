import type { Metadata } from 'next';
import Link from 'next/link';
import { signOut } from './actions';

export const metadata: Metadata = {
  title: { default: 'Studio', template: '%s · Seshat Studio' },
  robots: { index: false, follow: false },
};

export default function StudioLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="min-h-[70vh] bg-cream-100">
      <div className="border-b border-cream-300 bg-navy-950 text-cream-100">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-2.5 text-sm sm:px-8">
          <span className="kicker text-gold-300">Editorial studio</span>
          <nav className="flex gap-5" aria-label="Studio">
            <Link href="/admin" className="hover:text-white">
              Drafts
            </Link>
            <Link href="/admin/new" className="hover:text-white">
              New story
            </Link>
          </nav>
          <form action={signOut} className="ml-auto">
            <button type="submit" className="text-cream-200/80 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </div>
      {children}
    </div>
  );
}
