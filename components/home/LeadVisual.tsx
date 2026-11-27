import type { Point } from '@/lib/data/types';
import { fmtDay } from '@/lib/format';
import { HeroPattern } from '@/components/editorial/HeroPattern';

/**
 * Lead-story artwork made from real data rather than photography: twenty
 * years of the 10-year Treasury yield (monthly averages) drawn as a single
 * gold line, with the 2026 daily high stated in type.
 */
export function LeadVisual({
  points,
  peak,
  peakDate,
  sinceLabel,
}: {
  points: Point[];
  peak: number;
  peakDate: string;
  sinceLabel: string;
}) {
  const W = 560;
  const H = 260;
  const padX = 8;
  const padY = 18;
  const min = 0;
  const max = 6;
  const x = (i: number) => padX + (i / (points.length - 1)) * (W - 2 * padX);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (H - 2 * padY);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const firstYear = points[0].date.slice(0, 4);
  const lastYear = last.date.slice(0, 4);
  const low = points.reduce((a, b) => (b.value < a.value ? b : a));

  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy-900 p-6 text-cream-50 sm:p-8">
      <HeroPattern scale={false} className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
      <div className="relative">
        <p className="kicker text-gold-300">The number</p>
        <p className="mt-3 font-display text-6xl font-semibold leading-none tracking-tight tabular-nums sm:text-7xl">
          {peak.toFixed(2)}
          <span className="text-4xl sm:text-5xl">%</span>
        </p>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-cream-200">
          10-year Treasury yield on {fmtDay(peakDate)} — the highest close since {sinceLabel}.
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-6 h-auto w-full" role="img" aria-labelledby="lead-visual-title">
          <title id="lead-visual-title">
            {`10-year Treasury yield, monthly average, ${firstYear}–${lastYear}: low of ${low.value.toFixed(2)}% in ${low.date.slice(0, 4)}, latest monthly average ${last.value.toFixed(2)}%.`}
          </title>
          {[0, 2, 4, 6].map((v) => (
            <g key={v}>
              <line x1={padX} x2={W - padX} y1={y(v)} y2={y(v)} stroke="#f8f2e6" strokeOpacity="0.12" />
              <text x={W - padX} y={y(v) - 4} textAnchor="end" fontSize="11" fill="#efe6d3" fillOpacity="0.6">
                {v}%
              </text>
            </g>
          ))}
          <path d={d} fill="none" stroke="#e6c37a" strokeWidth="2.2" strokeLinejoin="round" />
          <circle cx={x(points.length - 1)} cy={y(last.value)} r="4.5" fill="#e6c37a" stroke="#0f1d38" strokeWidth="2" />
          <text x={padX} y={H - 2} fontSize="11" fill="#efe6d3" fillOpacity="0.7">
            {firstYear}
          </text>
          <text x={W - padX} y={H - 2} textAnchor="end" fontSize="11" fill="#efe6d3" fillOpacity="0.7">
            {lastYear}
          </text>
        </svg>
        <p className="mt-2 text-[0.7rem] text-cream-200/70">Monthly averages of daily closes. Source: FRED (DGS10).</p>
      </div>
    </div>
  );
}
