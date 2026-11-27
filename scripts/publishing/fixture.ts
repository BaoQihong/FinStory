// Shared TEST FIXTURE for the live publishing checks (publish-check.ts,
// public-route-check.ts). Fixture articles are deleted at the end of each run.
import { SeshatArticleV1, type SeshatArticle } from '../../lib/studio/schema.ts';

export function content(headline: string): SeshatArticle {
  const ok = { required: false, reasons: [] as string[] };
  return SeshatArticleV1.parse({
    schemaVersion: 1,
    meta: { workingTitle: `[Publish check] ${headline}`, section: 'markets', author: { name: 'Seshat Editorial', role: 'Editorial team' }, asOf: new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    story: { kicker: 'Test', headline, dek: 'Integration test fixture.', keyPoints: ['Fixture.'], blocks: [1, 2, 3].map((n) => ({ type: 'p', text: `Fixture paragraph ${n}.` })), attention: ok },
    macro: { title: 'Macro', intro: 'Fixture.', indicators: [], charts: [], explainers: [{ title: 'Context', text: 'Fixture.', evidence: 'context' }], attention: ok },
    analytics: {
      title: 'Analytics',
      intro: 'Fixture.',
      chain: { title: 'Chain', steps: [{ title: 'A', text: 'A.', evidence: 'interpretation' }, { title: 'B', text: 'B.', evidence: 'interpretation' }] },
      charts: [],
      comparisons: [],
      implications: { title: 'Implications', intro: 'Fixture.', items: [{ asset: 'Bonds', icon: 'bonds', shows: 'Fixture.', showsEvidence: 'context', couldMean: 'Fixture.' }] },
      attention: ok,
    },
    outlook: { title: 'Outlook', intro: 'Fixture.', disclaimer: 'Not a forecast.', scenarios: ['central', 'alternative'].map((role, i) => ({ key: `s${i}`, name: `S${i}`, role, summary: 'Fixture.', conditions: ['C.'], whyItMatters: 'W.', assets: [{ asset: 'Bonds', effect: 'E.' }], watch: ['W.'], uncertainties: ['U.'] })), attention: ok },
    methodology: ['Fixture.'],
    evidence: { citations: [{ ref: 'S1', title: 'Fixture source', url: 'https://example.org/fixture', publisher: 'example.org', sourceType: 'other', publishedAt: null }], findings: [{ ref: 'F1', claim: 'PRIVATE-FINDING-MARKER', kind: 'context', sourceRefs: ['S1'], quoteVerified: false }] },
    data: { facts: {}, dates: {}, charts: {}, indicators: [], sources: [] },
    validation: { checkedAt: new Date().toISOString(), issues: [], claims: [] },
    generation: { jobId: 'PRIVATE-JOB-MARKER', model: 'fixture', searchProvider: 'none', dataProviders: [], generatedAt: new Date().toISOString() },
  });
}

