import type { IndicatorCard as Card } from '@/lib/data/display';
import { formatDate } from '@/lib/content/tokens';
import { Sparkline } from './Sparkline';

const SPARK_COLOR: Record<string, string> = {
  y10: '#3158a5',
  real: '#b97a12',
  core: '#0e968c',
  gdp: '#243b66',
};

export function IndicatorCard({ card, note }: { card: Card; note?: string }) {
  const ch = card.change;
  const up = ch && ch.value > 0;
  const flat = ch && ch.value === 0;
  return (
    <article className="flex min-w-0 flex-col rounded-xl border border-cream-300 bg-cream-50 p-5 shadow-[0_1px_0_rgba(15,29,56,0.04)]">
      <header>
        <h3 className="text-sm font-semibold leading-snug text-ink">{card.label}</h3>
        <p className="mt-0.5 text-xs text-muted">{formatDate(card.asOf, card.asOfPrecision)}</p>
      </header>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="font-display text-[2.6rem] font-semibold leading-none tracking-tight text-navy-900 tabular-nums">
          {card.display ? (
            <>
              {card.display.prefix ? <span className="mr-0.5 text-2xl">{card.display.prefix}</span> : null}
              {card.value.toLocaleString('en-US', { minimumFractionDigits: card.decimals, maximumFractionDigits: card.decimals })}
              {card.display.suffix.trim() ? <span className="ml-1 block text-sm font-normal tracking-normal text-muted">{card.display.suffix.trim()}</span> : null}
            </>
          ) : (
            <>
              {card.value.toFixed(card.decimals)}
              <span className="ml-0.5 text-2xl">%</span>
            </>
          )}
        </p>
        <Sparkline points={card.spark} color={SPARK_COLOR[card.key] ?? '#243b66'} className="h-10 w-28 shrink-0" />
      </div>
      {ch ? (
        <p className="mt-3 text-xs text-ink-soft">
          <span
            className={`mr-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
              flat ? 'bg-cream-200 text-ink-soft' : up ? 'bg-[#f3e6cc] text-gold-700' : 'bg-[#dcefe9] text-ev-documented'
            }`}
          >
            <span aria-hidden="true">{flat ? '■' : up ? '▲' : '▼'}</span>
            {ch.value > 0 ? '+' : ''}
            {card.display ? `${ch.value.toFixed(card.display.changeSuffix === '%' ? 1 : 2)}${card.display.changeSuffix}` : `${ch.value.toFixed(2)} pp`}
          </span>
          vs {ch.versus}
        </p>
      ) : null}
      {note ? <p className="mt-3 text-sm leading-snug text-ink-soft">{note}</p> : null}
      <details className="group mt-auto pt-4 text-xs text-muted">
        <summary className="inline-flex items-center gap-1 font-medium text-navy-700 hover:text-navy-900">
          How it’s measured
          <svg viewBox="0 0 12 12" className="chev h-3 w-3 transition-transform" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <p className="mt-2 leading-relaxed">{card.method}</p>
        <p className="mt-1.5">
          Source:{' '}
          <a className="underline decoration-gold-500 underline-offset-2 hover:text-ink" href={card.source.url} rel="noopener">
            {card.source.short ?? 'FRED'} {card.source.seriesId}
          </a>
          , {card.source.units.toLowerCase()}.
        </p>
      </details>
    </article>
  );
}
