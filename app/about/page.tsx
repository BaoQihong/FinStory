import type { Metadata } from 'next';
import Link from 'next/link';
import { EvidenceKey } from '@/components/editorial/EvidenceTag';
import { SeshatMark } from '@/components/site/SeshatMark';

export const metadata: Metadata = {
  title: 'About',
  description: 'Seshat is an independent financial storytelling publication. How we work, and the standards we hold ourselves to.',
};

export default function AboutPage() {
  return (
    <>
      <header className="bg-navy-900 text-cream-50">
        <div className="mx-auto flex max-w-4xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-center sm:px-8 sm:py-20">
          <SeshatMark className="h-24 w-20 shrink-0 text-gold-400" />
          <div>
            <p className="kicker text-gold-300">About Seshat</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight text-balance sm:text-5xl">
              The stories behind the numbers
            </h1>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
        <div className="prose-seshat">
          <p>
            Seshat was the ancient Egyptian goddess of writing, mathematics and measurement — the keeper of records and
            the one who measured out the foundations of temples. We borrowed her name because that is the job: to write
            clearly, and to measure carefully.
          </p>
          <p>
            Seshat is an independent publication about economics, markets and wealth. Our aim is to make big financial
            developments understandable to anyone, while giving more experienced investors the evidence to go deeper.
            Every story leads with a clear argument and lets you dig into the data behind it — as far as you like.
          </p>
        </div>

        <section id="standards" aria-labelledby="h-standards" className="mt-16">
          <h2 id="h-standards" className="font-display text-3xl font-semibold text-navy-900">
            Editorial &amp; data standards
          </h2>
          <ul className="mt-6 space-y-5 text-[1.02rem] leading-relaxed text-ink">
            <li>
              <strong className="font-semibold">People write the stories.</strong> Editorial judgment drives everything we
              publish.
            </li>
            <li>
              <strong className="font-semibold">Real data, cited.</strong> Charts and figures are drawn from published
              official sources, with the series, dates and any calculations disclosed alongside them. We never fill in
              missing data with estimates without saying so — and in our current stories, we don’t estimate at all.
            </li>
            <li>
              <strong className="font-semibold">We label the strength of every claim.</strong> In our analysis sections,
              each statement carries one of three tags:
              <div className="mt-3 rounded-lg bg-cream-50 px-4 py-3">
                <EvidenceKey />
              </div>
            </li>
            <li>
              <strong className="font-semibold">Scenarios, not predictions.</strong> When we look ahead, we describe the
              conditions that would lead to different outcomes. We do not attach made-up probabilities.
            </li>
            <li>
              <strong className="font-semibold">No synthetic imagery.</strong> We do not publish AI-generated images. Our
              visuals are typography, design and charts rendered from real data; any photography we use will be properly
              licensed and credited.
            </li>
            <li>
              <strong className="font-semibold">Not advice.</strong> Seshat is general information and education. It is not
              personal financial or investment advice.
            </li>
          </ul>
        </section>

        <section aria-labelledby="h-prototype" className="mt-16 rounded-2xl border border-cream-300 bg-cream-50 p-6">
          <h2 id="h-prototype" className="kicker text-gold-700">
            Prototype edition
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            You are reading an early edition of Seshat. One full story is published —{' '}
            <Link className="font-semibold text-navy-800 underline decoration-gold-500 underline-offset-2" href="/stories/the-bond-comeback">
              The Bond Comeback
            </Link>
            — and other stories are marked as in preparation. The demonstration copy is a draft awaiting editorial review. Economic data comes from Federal Reserve Economic Data
            (FRED), Federal Reserve Bank of St. Louis.
          </p>
        </section>
      </div>
    </>
  );
}
