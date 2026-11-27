import { SERIES_COLORS } from './chart-types';

type Row = { label: string; sub: string; nominal: number; real: number; breakeven: number };

/**
 * Stacked bars showing the 10-year yield as real yield + breakeven inflation
 * on three dates. Rendered as HTML so it is fully accessible and needs no JS.
 */
export function YieldSplit({ rows, question, takeaway, note }: { rows: Row[]; question: string; takeaway: string; note: string }) {
  const max = Math.ceil(Math.max(...rows.map((r) => r.nominal)));
  return (
    <figure className="rounded-2xl border border-cream-300 bg-cream-50 p-5 sm:p-7" aria-labelledby="yield-split-title">
      <p className="kicker text-gold-700">Comparison</p>
      <h3 id="yield-split-title" className="mt-1.5 font-display text-[1.45rem] font-semibold leading-tight text-navy-900 sm:text-2xl">
        {question}
      </h3>
      <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-ink-soft">{takeaway}</p>

      <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: SERIES_COLORS.real }} aria-hidden />
          Real yield (TIPS)
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm" style={{ background: SERIES_COLORS.breakeven }} aria-hidden />
          Breakeven inflation
        </li>
      </ul>

      <table className="mt-5 w-full border-separate border-spacing-y-4">
        <caption className="sr-only">
          10-year Treasury yield split into real yield and breakeven inflation, by date (percent)
        </caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Real yield and breakeven inflation</th>
            <th scope="col">10-year yield</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="align-middle">
              <th scope="row" className="w-24 pr-3 text-left align-middle sm:w-32">
                <span className="block text-sm font-semibold text-ink">{r.sub}</span>
                <span className="block text-xs font-normal text-muted">{r.label}</span>
              </th>
              <td className="align-middle">
                <div className="flex h-9 w-full overflow-hidden rounded-r-md" aria-hidden="true">
                  <div
                    className="flex items-center justify-end pr-2 text-xs font-semibold text-navy-950"
                    style={{ width: `${(r.real / max) * 100}%`, background: SERIES_COLORS.real }}
                  >
                    {r.real.toFixed(2)}
                  </div>
                  <div
                    className="ml-0.5 flex items-center justify-end pr-2 text-xs font-semibold text-navy-950"
                    style={{ width: `${(r.breakeven / max) * 100}%`, background: SERIES_COLORS.breakeven }}
                  >
                    {r.breakeven.toFixed(2)}
                  </div>
                </div>
                <span className="sr-only">
                  Real yield {r.real.toFixed(2)}%, breakeven inflation {r.breakeven.toFixed(2)}%
                </span>
              </td>
              <td className="w-16 pl-3 text-right align-middle font-display text-lg font-semibold text-navy-900 tabular-nums sm:w-20">
                {r.nominal.toFixed(2)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-4 border-t border-cream-200 pt-4 text-xs leading-relaxed text-muted">{note}</figcaption>
    </figure>
  );
}
