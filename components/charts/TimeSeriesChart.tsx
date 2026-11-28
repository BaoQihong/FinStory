'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
} from 'recharts';
import { layoutLabels, segmentRuns, wrapLabel } from '@/lib/data/chart-geometry';
import { SERIES_COLORS, type ClientChart } from './chart-types';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toTs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromTs = (ts: number) => {
  const d = new Date(ts);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const SURFACE = '#fdfaf3';
/** Conservative average advance of a 12 px semibold UI-font character. */
const LABEL_CHAR_PX = 7;
const LABEL_GAP = 12;
const LABEL_LINE = 14;

/**
 * Direct labels at the right of the plot: wrapped to a fixed column, stacked so
 * they never overlap, each joined to its line end by a thin leader.
 */
function EndLabels({ ends, lines }: { ends: { key: string; color: string; t: number; v: number }[]; lines: string[][] }) {
  const xs = useXAxisScale();
  const ys = useYAxisScale();
  const area = usePlotArea();
  if (!xs || !ys || !area) return null;
  const at = ends.map((e) => ({ x: xs(e.t) ?? area.x + area.width, y: ys(e.v) ?? area.y }));
  const heights = lines.map((l) => l.length * LABEL_LINE);
  const tops = layoutLabels(
    at.map((p, i) => ({ y: p.y, height: heights[i] })),
    area.y - 8,
    area.y + area.height,
  );
  const lx = area.x + area.width + LABEL_GAP;
  return (
    <g className="end-labels">
      {ends.map((e, i) => {
        const ly = tops[i] + heights[i] / 2;
        return (
          <g key={e.key}>
            <path d={`M${at[i].x + 3} ${at[i].y} L${lx - 4} ${ly}`} stroke={e.color} strokeWidth={1} strokeOpacity={0.55} fill="none" />
            <text x={lx} y={tops[i]} fontSize={12} fontWeight={600} fill="#1a2233">
              {lines[i].map((l, j) => (
                <tspan key={j} x={lx} dy={j ? LABEL_LINE : 11}>
                  {l}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
    </g>
  );
}

type Row = { t: number } & Record<string, number | undefined>;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function TimeSeriesChart({ chart, ariaLabel }: { chart: ClientChart; ariaLabel: string }) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const compact = width > 0 && width < 560;
  const height = compact ? 260 : 330;

  const { rows, segments, ends } = useMemo(() => {
    // Rows are the union of all series dates, so a series is undefined on rows that belong
    // only to other series (different calendars, different thinning). Those are not missing
    // observations: each series is split into runs judged on its own dates only, and each
    // run is drawn as one Line that connects across rows it has no value on. A genuine gap
    // (e.g. the October 2025 core CPI gap) ends one run and starts the next, so it stays
    // visible. No value is ever added to the data — the line only joins observed points.
    const byTs = new Map<number, Row>();
    const segments: { dataKey: string; seriesKey: string; color: string; dashed?: boolean; lone: boolean }[] = [];
    const ends: { key: string; label: string; color: string; t: number; v: number }[] = [];
    for (const s of chart.series) {
      const pts = s.points.map((p) => ({ t: toTs(p.date), v: p.value })).sort((a, b) => a.t - b.t);
      if (!pts.length) continue;
      const color = SERIES_COLORS[s.color];
      segmentRuns(pts.map((p) => p.t)).forEach(([a, b], n) => {
        const dataKey = `${s.key}~${n}`;
        segments.push({ dataKey, seriesKey: s.key, color, dashed: s.dashed, lone: a === b });
        for (let i = a; i <= b; i++) {
          let row = byTs.get(pts[i].t);
          if (!row) byTs.set(pts[i].t, (row = { t: pts[i].t }));
          row[dataKey] = pts[i].v;
        }
      });
      const last = pts[pts.length - 1];
      ends.push({ key: s.key, label: s.label, color, t: last.t, v: last.v });
    }
    const rows = [...byTs.values()].sort((a, b) => a.t - b.t);
    return { rows, segments, ends };
  }, [chart.series]);

  const [minT, maxT] = [rows[0].t, rows[rows.length - 1].t];

  const xTicks = useMemo(() => {
    const out: number[] = [];
    const a = fromTs(minT);
    const b = fromTs(maxT);
    if (chart.xTickFormat === 'year') {
      const span = b.y - a.y;
      const step = compact ? (span > 12 ? 5 : 2) : span > 12 ? 2 : 1;
      const start = Math.ceil(a.y / step) * step;
      for (let y = start; y <= b.y; y += step) {
        const t = Date.UTC(y, 0, 1);
        if (t >= minT && t <= maxT) out.push(t);
      }
    } else {
      const step = compact ? 3 : 2;
      for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m += step) {
        if (m > 11) {
          y += Math.floor(m / 12);
          m = m % 12;
        }
        const t = Date.UTC(y, m, 1);
        if (t >= minT && t <= maxT) out.push(t);
      }
    }
    return out;
  }, [minT, maxT, chart.xTickFormat, compact]);

  const yTicks = useMemo(() => {
    if (!chart.yDomain || !chart.yTickStep) return undefined;
    const out: number[] = [];
    for (let v = chart.yDomain[0]; v <= chart.yDomain[1] + 1e-9; v += chart.yTickStep) out.push(Math.round(v * 100) / 100);
    return out;
  }, [chart.yDomain, chart.yTickStep]);

  const fmtTick = (t: number) => {
    const d = fromTs(t);
    return chart.xTickFormat === 'year' ? String(d.y) : d.m === 0 ? `Jan ’${String(d.y).slice(2)}` : SHORT_MONTHS[d.m];
  };
  const fmtTooltipDate = (t: number) => {
    const d = fromTs(t);
    return chart.pointFrequency === 'daily' ? `${d.d} ${SHORT_MONTHS[d.m]} ${d.y}` : `${SHORT_MONTHS[d.m]} ${d.y}`;
  };

  // End labels sit in a right-hand column sized to the longest wrapped line, so they are never clipped.
  const labelChars = width >= 760 ? 24 : 19;
  const labelLines = ends.map((e) => wrapLabel(e.label, labelChars));
  const longest = Math.max(0, ...labelLines.flat().map((l) => l.length));
  const rightMargin = compact ? 12 : Math.min(Math.round(longest * LABEL_CHAR_PX) + LABEL_GAP + 6, Math.round(width * 0.32));
  const { prefix, suffix } = chart.unit;
  // Axis ticks keep short suffixes only ("%", " pp"); long unit words live in the legend/table.
  const axisSuffix = suffix.length <= 3 ? suffix : '';
  const fmtAxis = (v: number) => `${prefix}${Math.abs(v) >= 1000 ? v.toLocaleString('en-US') : v}${axisSuffix}`;
  const maxAbs = Math.max(...chart.series.flatMap((s) => s.points.map((p) => Math.abs(p.value))));
  const plotLeft = Math.max(44, Math.round(fmtAxis(Math.round(maxAbs)).length * 7.2 + 10));
  const anchorFor = (x: number) => {
    const plotRight = width - rightMargin;
    if (x > plotRight - 70) return 'end';
    if (x < plotLeft + 50) return 'start';
    return 'middle';
  };

  return (
    <div ref={wrapRef} role="img" aria-label={ariaLabel} className="w-full select-none">
      {width > 0 ? (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={rows} margin={{ top: 22, right: rightMargin, bottom: 4, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="#e2d5bb" strokeDasharray="0" strokeOpacity={0.7} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[minT, maxT]}
              ticks={xTicks}
              tickFormatter={fmtTick}
              tick={{ fill: '#5b6372', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: '#c9b99a' }}
              minTickGap={8}
            />
            <YAxis
              domain={chart.yDomain ?? ['auto', 'auto']}
              ticks={yTicks}
              tickFormatter={fmtAxis}
              tick={{ fill: '#5b6372', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={plotLeft}
            />
            {chart.yDomain && chart.yDomain[0] < 0 ? <ReferenceLine y={0} stroke="#3d4658" strokeWidth={1} /> : null}
            {chart.highlight ? (
              <ReferenceArea
                x1={toTs(chart.highlight.from)}
                x2={toTs(chart.highlight.to)}
                fill="#d4a94f"
                fillOpacity={0.12}
                stroke="none"
                label={{ value: chart.highlight.label, position: 'insideBottom', fill: '#7f5a12', fontSize: 11, fontWeight: 600 }}
              />
            ) : null}
            <Tooltip
              cursor={{ stroke: '#3d4658', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-cream-300 bg-cream-50/95 px-3 py-2 text-xs shadow-lg">
                    <div className="mb-1 font-semibold text-ink">{fmtTooltipDate(Number(label))}</div>
                    {chart.series.map((s) => {
                      // Only an observation on this exact date is shown — never a value read off the joining line.
                      const item = payload.find(
                        (p) => typeof p.dataKey === 'string' && p.dataKey.startsWith(`${s.key}~`) && p.value !== undefined && p.value !== null,
                      );
                      if (!item) return null;
                      return (
                        <div key={s.key} className="flex items-center gap-2 text-ink-soft">
                          <span className="inline-block h-0.5 w-3" style={{ background: SERIES_COLORS[s.color] }} aria-hidden />
                          <span>{s.label}</span>
                          <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{prefix}{Number(item.value).toFixed(2)}{suffix}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {segments.map((g) => (
              <Line
                key={g.dataKey}
                dataKey={g.dataKey}
                type="linear"
                stroke={g.color}
                strokeWidth={2}
                strokeDasharray={g.dashed ? '5 4' : undefined}
                // A lone observation between two genuine gaps has no neighbour to join: mark it.
                dot={g.lone ? { r: 2.5, fill: g.color, stroke: 'none' } : false}
                activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {compact ? null : <EndLabels ends={ends} lines={labelLines} />}
            {chart.annotations.map((a, i) => {
              const s = chart.series.find((x) => x.key === a.seriesKey)!;
              return (
                <ReferenceDot
                  key={i}
                  x={toTs(a.date)}
                  y={a.value}
                  r={4.5}
                  fill={SERIES_COLORS[s.color]}
                  stroke={SURFACE}
                  strokeWidth={2}
                  label={(props: { viewBox?: { x?: number; y?: number } }) => {
                    const x = props.viewBox?.x ?? 0;
                    const y = props.viewBox?.y ?? 0;
                    const below = a.position === 'bottom';
                    return (
                      <text
                        x={x}
                        y={below ? y + 20 : y - 10 - (a.lift ?? 0)}
                        textAnchor={anchorFor(x)}
                        fontSize={11.5}
                        fontWeight={600}
                        fill="#1a2233"
                        stroke={SURFACE}
                        strokeWidth={4}
                        paintOrder="stroke"
                      >
                        {a.label}
                      </text>
                    );
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ height: 330 }} />
      )}
    </div>
  );
}
