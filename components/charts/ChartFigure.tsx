import type { ChartData } from '@/lib/data/display';
import { fmtDay, fmtMonth } from '@/lib/format';
import { SERIES_COLORS, toClientChart } from './chart-types';
import { TimeSeriesChart } from './TimeSeriesChart';

/**
 * An editorial chart: the question it answers, the takeaway, the chart, a
 * legend, and — on request — notes, sources and the underlying numbers as a
 * table (the accessible alternative to the graphic).
 */
export function ChartFigure({
  data,
  question,
  takeaway,
  label = 'Chart',
}: {
  data: ChartData;
  question: string;
  takeaway: string;
  label?: string;
}) {
  const client = toClientChart(data);
  const titleId = `${data.id}-title`;
  const daily = client.pointFrequency === 'daily';
  return (
    <figure className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-7" aria-labelledby={titleId}>
      <p className="kicker text-gold-700">{label}</p>
      <h3 id={titleId} className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight text-navy-900 sm:text-2xl">
        {question}
      </h3>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-soft">{takeaway}</p>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft" aria-label="Legend">
        {data.series.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <svg width="22" height="8" aria-hidden="true">
              <line
                x1="1"
                x2="21"
                y1="4"
                y2="4"
                stroke={SERIES_COLORS[s.color]}
                strokeWidth="2.5"
                strokeDasharray={s.dashed ? '5 3' : undefined}
                strokeLinecap="round"
              />
            </svg>
            {s.label}
            <span className="text-muted">({s.frequency.toLowerCase()})</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 -mx-1">
        <TimeSeriesChart chart={client} ariaLabel={`${question} ${takeaway} Full data in the table below the chart.`} />
      </div>

      <figcaption className="mt-4 space-y-1.5 border-t border-cream-200 pt-4 text-xs leading-relaxed text-muted">
        {data.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>
          Source:{' '}
          {data.sources.map((s, i) => (
            <span key={s.seriesId}>
              {i ? ', ' : ''}
              <a className="underline decoration-gold-500 underline-offset-2 hover:text-ink" href={s.url} rel="noopener">
                FRED {s.seriesId}
              </a>
            </span>
          ))}
          .
        </p>
      </figcaption>

      <details className="group mt-3 text-sm">
        <summary className="inline-flex items-center gap-1 text-xs font-medium text-navy-700 hover:text-navy-900">
          Show the data
          <svg viewBox="0 0 12 12" className="chev h-3 w-3 transition-transform" aria-hidden="true">
            <path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </summary>
        <DataTable data={data} daily={daily} caption={question} />
      </details>
    </figure>
  );
}

function DataTable({ data, daily, caption }: { data: ChartData; daily: boolean; caption: string }) {
  const dates = [...new Set(data.series.flatMap((s) => s.points.map((p) => p.date)))].sort().reverse();
  const maps = data.series.map((s) => new Map(s.points.map((p) => [p.date, p.value])));
  return (
    <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-cream-200">
      <table className="w-full text-left text-xs tabular-nums">
        <caption className="sr-only">Data for the chart: {caption}</caption>
        <thead className="sticky top-0 bg-cream-100 text-ink">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              {daily ? 'Date' : 'Month'}
            </th>
            {data.series.map((s) => (
              <th key={s.key} scope="col" className="px-3 py-2 text-right font-semibold">
                {s.label} (%)
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-cream-200 text-ink-soft">
          {dates.map((d) => (
            <tr key={d}>
              <th scope="row" className="px-3 py-1.5 font-normal">
                {daily ? fmtDay(d) : fmtMonth(d)}
              </th>
              {maps.map((m, i) => {
                const v = m.get(d);
                return (
                  <td key={i} className="px-3 py-1.5 text-right">
                    {v === undefined ? <span title="No observation">—</span> : v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
