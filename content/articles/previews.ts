import type { PreviewArticle } from '@/lib/content/types';

// Stories in preparation. Shown on the homepage with an explicit
// "In preparation" treatment; their pages describe intended coverage only
// and make no factual claims that are not backed by data in this repository.

export const previews: PreviewArticle[] = [
  {
    status: 'preview',
    slug: 'the-month-that-vanished',
    section: 'economy',
    kicker: 'Economy',
    headline: 'The Month That Vanished: Inside the Gap in America’s Inflation Record',
    shortHeadline: 'The Month That Vanished',
    dek: 'The official record holds no core inflation reading for October 2025. We look at what a missing month does to the numbers investors rely on.',
    byline: { name: 'Seshat Editorial', role: 'Economy' },
    publishedAt: '2026-11-26',
    plannedCoverage: [
      'How a single missing observation leaves holes in year-over-year inflation figures — for the month itself and for the same month a year later.',
      'The choices statisticians and analysts face when data is absent — and why we chose not to estimate it.',
      'What readers should keep in mind when they see inflation headlines that span the gap.',
    ],
  },
  {
    status: 'preview',
    slug: 'who-pays-for-the-ai-build-out',
    section: 'technology',
    kicker: 'Technology',
    headline: 'Who Pays for the AI Build-Out?',
    dek: 'Data centres need extraordinary amounts of capital. We are following the money — from chip makers to power grids to the bond market.',
    byline: { name: 'Seshat Editorial', role: 'Technology' },
    publishedAt: '2026-11-26',
    plannedCoverage: [
      'Where the funding for large-scale computing infrastructure comes from: cash flow, equity or debt.',
      'Why higher borrowing costs matter for capital-hungry industries.',
      'The indicators that would show whether the spending is paying off.',
    ],
  },
  {
    status: 'preview',
    slug: 'cash-pays-bonds-pay-more',
    section: 'wealth',
    kicker: 'Wealth',
    headline: 'Cash Pays. Bonds Pay More. What Should Savers Do?',
    shortHeadline: 'Cash Pays. Bonds Pay More.',
    dek: 'A plain-English guide to choosing between savings accounts, Treasury bills and longer-term bonds when interest rates are high.',
    byline: { name: 'Seshat Editorial', role: 'Wealth' },
    publishedAt: '2026-11-26',
    plannedCoverage: [
      'The trade-off between flexibility and locking in a rate.',
      'What “duration” means, and how bond prices respond when rates move.',
      'Questions to ask before moving savings — general education, not personal advice.',
    ],
  },
];
