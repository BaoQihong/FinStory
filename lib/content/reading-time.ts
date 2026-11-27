import type { PublishedArticle } from './types';

/** Reading time from the narrative and the explanatory copy (≈220 wpm, charts add a minute each). */
export function readingMinutes(a: PublishedArticle, resolve: (s: string) => string): number {
  const texts: string[] = [...a.keyPoints];
  for (const b of a.narrative.blocks) if (b.type !== 'chart') texts.push(b.text);
  texts.push(a.macro.intro, ...a.macro.explainers.map((e) => e.text));
  texts.push(a.analytics.intro, ...a.analytics.chain.steps.map((s) => s.text));
  texts.push(...a.analytics.implications.items.flatMap((i) => [i.shows, i.couldMean]));
  texts.push(a.outlook.intro, ...a.outlook.scenarios.flatMap((s) => [s.summary, s.whyItMatters, ...s.conditions]));
  const words = texts.map(resolve).join(' ').split(/\s+/).filter(Boolean).length;
  const charts = a.macro.charts.length + 2; // macro charts + yield split + policy chart
  return Math.max(1, Math.round(words / 220 + charts * 0.75));
}
