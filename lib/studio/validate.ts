// Deterministic validation of a Seshat article (generated or edited).
//
// Checks: schema; four-section completeness; unknown fact tokens; bare
// numbers typed into prose; chart / indicator references; chart-vs-claim
// consistency; evidence labelling; stale data; and (when datasets are
// supplied) recomputation of every fact from the stored observations.
import type { Fact } from '../data/display.ts';
import { SECTION_ORDER, SeshatArticleV1, type SectionId, type SeshatArticle, type ValidationIssue } from './schema.ts';
import { checkTokens, findBareNumbers, findCliches, findUnsupportedSuperlatives, stringLeaves } from './numbers.ts';

const TOKEN_KEYS = /\{([a-zA-Z0-9]+)(?:\.date)?(?::(?:short|abs))?\}/g;
const tokenKeys = (s: string) => [...s.matchAll(TOKEN_KEYS)].map((m) => m[1]);

export type ValidationResult = { ok: boolean; issues: ValidationIssue[]; article?: SeshatArticle };

export function validateArticle(input: unknown, opts: { today: string; recomputedFacts?: Record<string, Fact> } = { today: new Date().toISOString().slice(0, 10) }): ValidationResult {
  const parsed = SeshatArticleV1.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 30).map((i) => ({
        level: 'error' as const,
        section: (SECTION_ORDER as readonly string[]).includes(String(i.path[0])) ? (i.path[0] as SectionId) : ('evidence' as const),
        code: 'schema',
        message: `${i.path.join('.')}: ${i.message}`,
        path: i.path.join('.'),
      })),
    };
  }
  const a = parsed.data;
  const issues: ValidationIssue[] = [];
  const add = (level: ValidationIssue['level'], section: ValidationIssue['section'], code: string, message: string, path?: string) =>
    issues.push({ level, section, code, message, path });
  const { facts, dates, charts } = a.data;
  const indicatorKeys = new Set((a.data.indicators as { key: string }[]).map((c) => c.key));

  // 1. Tokens and bare numbers in every text field of the four sections + methodology
  for (const section of [...SECTION_ORDER, 'methodology'] as const) {
    const sec = section === 'methodology' ? a.methodology : a[section];
    for (const [path, text] of stringLeaves(sec, section)) {
      if (/\.attention\.|\.(chartId|key|icon|evidence|showsEvidence|role)$/.test(path) || path.endsWith('.type')) continue;
      const s = section === 'methodology' ? 'evidence' : section;
      for (const p of checkTokens(text, facts, dates)) add('error', s, 'unknown-token', `${p.token}: ${p.reason}`, path);
      for (const b of findBareNumbers(text)) add('warning', s, 'bare-number', `"${b.match}" (${b.why}) is not tied to a data value or verified source figure`, path);
      for (const w of findUnsupportedSuperlatives(text)) add('warning', s, 'unsupported-superlative', `"${w}" is not backed by a high/low or "since" fact in the same sentence`, path);
      for (const c of findCliches(text)) add('info', s, 'style', `Cliché: "${c}"`, path);
    }
  }

  // 2. Chart and indicator references
  const chartRefs: { section: SectionId; path: string; chartId: string; question: string; takeaway: string }[] = [];
  a.story.blocks.forEach((b, i) => b.type === 'chart' && chartRefs.push({ section: 'story', path: `story.blocks[${i}]`, ...b }));
  a.macro.charts.forEach((c, i) => chartRefs.push({ section: 'macro', path: `macro.charts[${i}]`, ...c }));
  a.analytics.charts.forEach((c, i) => chartRefs.push({ section: 'analytics', path: `analytics.charts[${i}]`, ...c }));
  for (const r of chartRefs) {
    const chart = charts[r.chartId] as { sources?: { seriesId: string }[]; series?: { sourceSeriesIds: string[] }[] } | undefined;
    if (!chart) {
      add('error', r.section, 'unknown-chart', `Chart "${r.chartId}" has no data behind it`, r.path);
      continue;
    }
    // Claims in a chart's caption must come from series shown in that chart.
    const shown = new Set((chart.series ?? []).flatMap((s) => s.sourceSeriesIds));
    for (const k of tokenKeys(`${r.question} ${r.takeaway}`)) {
      const f = facts[k];
      if (f && f.format !== 'text' && !f.seriesIds.some((id) => shown.has(id)))
        add('warning', r.section, 'chart-claim-mismatch', `Caption of "${r.chartId}" cites {${k}}, which is not plotted in that chart`, r.path);
    }
  }
  a.macro.indicators.forEach((n, i) => {
    if (!indicatorKeys.has(n.key)) add('error', 'macro', 'unknown-indicator', `Indicator "${n.key}" has no data behind it`, `macro.indicators[${i}]`);
  });

  // 3. Evidence labelling: "In the data" claims must cite data
  const documented: [SectionId, string, string][] = [];
  a.macro.explainers.forEach((e, i) => e.evidence === 'documented' && documented.push(['macro', `macro.explainers[${i}]`, e.text]));
  a.analytics.chain.steps.forEach((s, i) => s.evidence === 'documented' && documented.push(['analytics', `analytics.chain.steps[${i}]`, s.text]));
  a.analytics.comparisons.forEach((e, i) => e.evidence === 'documented' && documented.push(['analytics', `analytics.comparisons[${i}]`, e.text]));
  a.analytics.implications.items.forEach((it, i) => it.showsEvidence === 'documented' && documented.push(['analytics', `analytics.implications.items[${i}]`, it.shows]));
  for (const [section, path, text] of documented)
    if (!tokenKeys(text).length) add('warning', section, 'documented-without-data', 'Labelled "In the data" but cites no data value — relabel or add a figure', path);

  // 4. Storyboard completeness
  const paragraphs = a.story.blocks.filter((b) => b.type === 'p').length;
  if (paragraphs < 3) add('warning', 'story', 'thin-story', `The Story has ${paragraphs} paragraph(s); at least 3 expected`);
  if (!a.macro.charts.length && !a.macro.indicators.length) add('warning', 'macro', 'no-macro-data', 'Macro has no charts or indicators');
  if (!a.analytics.implications.items.length) add('warning', 'analytics', 'no-implications', 'Analytics has no asset implications');
  if (a.outlook.scenarios.length < 2) add('warning', 'outlook', 'few-scenarios', `Outlook has ${a.outlook.scenarios.length} scenario(s); at least 2 expected`);
  const central = a.outlook.scenarios.filter((s) => s.role === 'central').length;
  if (a.outlook.scenarios.length && central !== 1) add('info', 'outlook', 'central-scenario', `${central} scenarios are marked central; expected exactly one`);

  // 5. Data freshness and recomputation
  const age = (Date.parse(opts.today) - Date.parse(a.meta.asOf)) / 86_400_000;
  if (age > 45) add('warning', 'data', 'stale-data', `Latest data is from ${a.meta.asOf} (${Math.round(age)} days old)`);
  if (opts.recomputedFacts) {
    for (const [k, f] of Object.entries(facts)) {
      if (f.format === 'text') continue;
      const r = opts.recomputedFacts[k];
      if (!r) add('error', 'data', 'fact-unbacked', `Fact {${k}} could not be recomputed from stored datasets`);
      else if (Math.abs(r.value - f.value) > 10 ** -f.decimals / 2 || r.date !== f.date)
        add('error', 'data', 'fact-mismatch', `Fact {${k}} = ${f.value} (${f.date}) but stored data gives ${r.value} (${r.date})`);
    }
  }

  return { ok: !issues.some((i) => i.level === 'error'), issues, article: a };
}

/** Fold validation issues into each section's attention flag (keeps LLM/editor-set reasons). */
export function applyAttention(a: SeshatArticle, issues: ValidationIssue[]): SeshatArticle {
  const out = structuredClone(a);
  for (const s of SECTION_ORDER) {
    const mine = issues.filter((i) => i.section === s && i.level !== 'info');
    if (!mine.length) continue;
    const reasons = new Set(out[s].attention.reasons);
    for (const i of mine.slice(0, 6)) reasons.add(i.message.slice(0, 380));
    out[s].attention = { required: true, reasons: [...reasons].slice(0, 10) };
  }
  return out;
}
