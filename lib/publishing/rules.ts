// Publication rules: pre-publication validation, URL slugs and the derived
// publication state. Pure functions (no I/O) so they are unit-tested and
// shared by the server actions and the studio UI.
import { SECTION_LABELS, SECTION_ORDER, SeshatArticleV1, type SeshatArticle } from '../studio/schema.ts';
import { validateArticle } from '../studio/validate.ts';

// ── Publication state ───────────────────────────────────────────────────
// Derived from the article's publication columns — no separate state machine.
export type PublicationState = 'never' | 'live' | 'live_changed' | 'unpublished';

export type PublicationColumns = {
  revision: number;
  slug: string | null;
  is_live: boolean;
  first_published_at: string | null;
  last_published_at: string | null;
  unpublished_at: string | null;
  published_revision: number;
  published_source_revision: number | null;
};

export function publicationState(a: Pick<PublicationColumns, 'revision' | 'is_live' | 'first_published_at' | 'published_source_revision'>): PublicationState {
  if (a.is_live) return a.published_source_revision === a.revision ? 'live' : 'live_changed';
  return a.first_published_at ? 'unpublished' : 'never';
}

export const STATE_LABELS: Record<PublicationState, string> = {
  never: 'Not published',
  live: 'Published',
  live_changed: 'Published · unpublished changes',
  unpublished: 'Unpublished',
};

// ── Slugs ───────────────────────────────────────────────────────────────
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;
/** Route words and Phase 2A demonstration slugs (served from /stories/…) stay reserved. */
export const RESERVED_SLUGS = new Set(['admin', 'api', 'story', 'stories', 'section', 'about', 'new', 'preview', 'drafts', 'login']);

export function slugify(text: string): string {
  const base = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length <= SLUG_MAX) return base;
  const cut = base.slice(0, SLUG_MAX + 1);
  const i = cut.lastIndexOf('-');
  return (i > 20 ? cut.slice(0, i) : base.slice(0, SLUG_MAX)).replace(/-+$/, '');
}

export function slugProblem(slug: string, reserved: ReadonlySet<string> = RESERVED_SLUGS): string | null {
  if (slug.length < 3) return 'The URL slug must be at least 3 characters.';
  if (slug.length > SLUG_MAX) return `The URL slug must be at most ${SLUG_MAX} characters.`;
  if (!SLUG_PATTERN.test(slug)) return 'Use lowercase letters, digits and single hyphens only (e.g. "the-yen-at-a-turning-point").';
  if (reserved.has(slug)) return `"${slug}" is reserved. Choose another slug.`;
  return null;
}

/** First free slug: base, base-2, base-3… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, reserved: ReadonlySet<string> = RESERVED_SLUGS): string {
  const root = (base || 'story').slice(0, SLUG_MAX - 4).replace(/-+$/, '');
  if (!taken.has(root) && !reserved.has(root) && root.length >= 3) return root;
  for (let n = 2; ; n++) {
    const s = `${root}-${n}`;
    if (!taken.has(s) && !reserved.has(s)) return s;
  }
}

// ── Pre-publication validation ──────────────────────────────────────────
export type PublicationIssue = { code: string; message: string; section?: string; path?: string };
export type PublicationCheck = { ok: boolean; blocking: PublicationIssue[]; warnings: PublicationIssue[]; article?: SeshatArticle };

export type CheckInput = {
  content: unknown;
  isTemporary: boolean;
  generating: boolean;
  today: string;
};

export function checkPublication({ content, isTemporary, generating, today }: CheckInput): PublicationCheck {
  const blocking: PublicationIssue[] = [];
  const warnings: PublicationIssue[] = [];
  if (generating) blocking.push({ code: 'generation-running', message: 'Generation is running for this draft. Wait for it to finish before publishing.' });
  if (isTemporary) blocking.push({ code: 'temporary-draft', message: 'Temporary (test) drafts cannot be published.' });
  if (content == null) {
    blocking.push({ code: 'no-content', message: 'The draft has no content yet.' });
    return { ok: false, blocking, warnings };
  }
  const parsed = SeshatArticleV1.safeParse(content);
  if (!parsed.success) {
    for (const i of parsed.error.issues.slice(0, 20))
      blocking.push({ code: 'schema', message: `Structurally invalid: ${i.path.join('.')} — ${i.message}`, path: i.path.join('.') });
    return { ok: false, blocking, warnings };
  }
  const a = parsed.data;

  // Editorial attention flags must be resolved (and cleared) by the editor.
  for (const s of SECTION_ORDER) {
    const att = a[s].attention;
    if (att.required)
      blocking.push({
        code: 'attention',
        section: s,
        message: `${SECTION_LABELS[s]} is flagged as needing editorial attention${att.reasons[0] ? ` (${att.reasons[0].slice(0, 160)}${att.reasons.length > 1 ? ` — and ${att.reasons.length - 1} more` : ''})` : ''}. Resolve it and clear the flag in the ${SECTION_LABELS[s]} tab.`,
      });
  }

  // The same deterministic checks as generation and every save.
  const v = validateArticle(a, { today });
  for (const i of v.issues) {
    if (i.level === 'info') continue;
    const issue = { code: i.code, section: i.section, path: i.path, message: i.message };
    (i.level === 'error' ? blocking : warnings).push(issue);
  }

  // Licensing reminder (D-025): Tiingo's free tier is licensed for internal use.
  const tiingo = (a.data.sources as { provider?: string; short?: string; url?: string }[]).some((x) => /tiingo/i.test(`${x.provider ?? ''} ${x.short ?? ''} ${x.url ?? ''}`));
  if (tiingo) warnings.push({ code: 'tiingo-licence', section: 'data', message: 'Uses Tiingo market data. Its free tier is licensed for internal use; review the licence before wide public distribution (P2B-16).' });
  if (!a.evidence.citations.length) warnings.push({ code: 'no-citations', section: 'evidence', message: 'The article cites no research sources.' });

  return { ok: blocking.length === 0, blocking, warnings, article: a };
}
