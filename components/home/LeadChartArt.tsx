import type { LeadChart } from '@/lib/publishing/home';
import { HeroPattern } from '@/components/editorial/HeroPattern';
import { fmtMonthShort } from '@/lib/format';

const W = 560;
const H = 250;
const PAD_X = 8;
const PAD_Y = 22;
const LINE = ['#e6c37a', '#f8f2e6'];

function fmt(v: number, step: number, unit: LeadChart['unit']) {
  const decimals = step >= 10 ? 0 : step >= 1 ? 1 : 2;
  const sign = v < 0 ? '−' : '';
  return `${sign}${unit.prefix}${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${unit.suffix}`;
}

/**
 * Featured-story artwork drawn from the article's own lead chart: real data,
 * no imagery (D-020). At most two lines; the full, labelled chart is in the
 * article itself.
 */
export function LeadChartArt({ chart }: { chart: LeadChart }) {
  const all = chart.series.flatMap((s) => s.points.map((p) => p.value));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;
  const t0 = Date.parse(chart.first);
  const t1 = Math.max(Date.parse(chart.last), t0 + 1);
  const x = (d: string) => PAD_X + ((Date.parse(d) - t0) / (t1 - t0)) * (W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - lo) / (hi - lo)) * (H - 2 * PAD_Y);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const step = (hi - lo) / 2;
  const lead = chart.series[0];
  const last = lead.points[lead.points.length - 1];
  const desc = chart.series
    .map((s) => `${s.label}: ${fmt(s.points[0].value, step, chart.unit)} in ${fmtMonthShort(s.points[0].date)}, ${fmt(s.points[s.points.length - 1].value, step, chart.unit)} in ${fmtMonthShort(s.points[s.points.length - 1].date)}`)
    .join('; ');

  return (
    <figure className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 sm:p-8">
      <HeroPattern scale={false} className="pointer-events-none absolute inset-0 h-full w-full opacity-50" />
      <div className="relative">
        <p className="kicker text-gold-300">From the story</p>
        <figcaption className="mt-3 max-w-md font-display text-xl leading-snug text-cream-50 text-balance sm:text-2xl">{chart.question}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 h-auto w-full" role="img" aria-label={`${chart.question} ${desc}.`}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD_X} x2={W - PAD_X} y1={y(v)} y2={y(v)} stroke="#f8f2e6" strokeOpacity="0.12" />
              <text x={W - PAD_X} y={y(v) - 5} textAnchor="end" fontSize="15" fill="#efe6d3" fillOpacity="0.6">
                {fmt(v, step, chart.unit)}
              </text>
            </g>
          ))}
          {chart.series.map((s, i) => (
            <path
              key={s.label}
              d={s.points.map((p, j) => `${j ? 'L' : 'M'}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={LINE[i]}
              strokeOpacity={i ? 0.7 : 1}
              strokeDasharray={i ? '5 4' : undefined}
              strokeWidth={i ? 1.6 : 2.2}
              strokeLinejoin="round"
            />
          ))}
          <circle cx={x(last.date)} cy={y(last.value)} r="4.5" fill={LINE[0]} stroke="#0f1d38" strokeWidth="2" />
          <text x={PAD_X} y={H - 3} fontSize="15" fill="#efe6d3" fillOpacity="0.7">
            {chart.first.slice(0, 4)}
          </text>
          <text x={W - PAD_X} y={H - 3} textAnchor="end" fontSize="15" fill="#efe6d3" fillOpacity="0.7">
            {chart.last.slice(0, 4)}
          </text>
        </svg>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[0.72rem] text-cream-200/80">
          {chart.series.map((s, i) => (
            <span key={s.label} className="inline-flex items-center gap-2">
              <svg width="18" height="6" aria-hidden="true">
                <line x1="0" x2="18" y1="3" y2="3" stroke={LINE[i]} strokeWidth="2" strokeDasharray={i ? '4 3' : undefined} />
              </svg>
              {s.label}
            </span>
          ))}
          {chart.source ? <span className="text-cream-200/60">{chart.source}</span> : null}
        </div>
      </div>
    </figure>
  );
}
