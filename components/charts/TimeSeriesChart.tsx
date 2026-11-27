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
} from 'recharts';
import { SERIES_COLORS, type ClientChart } from './chart-types';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toTs = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fromTs = (ts: number) => {
  const d = new Date(ts);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const SURFACE = '#fdfaf3';

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

  const { rows, lastIndex } = useMemo(() => {
    const byTs = new Map<number, Row>();
    for (const s of chart.series) {
      for (const p of s.points) {
        const t = toTs(p.date);
        let row = byTs.get(t);
        if (!row) byTs.set(t, (row = { t }));
        row[s.key] = p.value;
      }
    }
    const rows = [...byTs.values()].sort((a, b) => a.t - b.t);
    // Rows are the union of all series dates; a series absent on a row stays undefined,
    // so a missing observation (e.g. the October 2025 core CPI gap) renders as a visible gap.
    const lastIndex: Record<string, number> = {};
    for (const s of chart.series) {
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][s.key] !== undefined) {
          lastIndex[s.key] = i;
          break;
        }
      }
    }
    return { rows, lastIndex };
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

  const rightMargin = compact ? 12 : 132;
  const plotLeft = 44;
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
              tickFormatter={(v: number) => `${v}%`}
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
                      const item = payload.find((p) => p.dataKey === s.key);
                      if (item?.value === undefined || item.value === null) return null;
                      return (
                        <div key={s.key} className="flex items-center gap-2 text-ink-soft">
                          <span className="inline-block h-0.5 w-3" style={{ background: SERIES_COLORS[s.color] }} aria-hidden />
                          <span>{s.label}</span>
                          <span className="ml-auto pl-3 font-semibold tabular-nums text-ink">{Number(item.value).toFixed(2)}%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }}
            />
            {chart.series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                type="linear"
                stroke={SERIES_COLORS[s.color]}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={false}
                activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={false}
                label={
                  compact
                    ? undefined
                    : (props: { x?: number | string; y?: number | string; index?: number }) =>
                        props.index === lastIndex[s.key] ? (
                          <text
                            key={`end-${s.key}`}
                            x={Number(props.x) + 8}
                            y={Number(props.y) + 4}
                            fontSize={12}
                            fontWeight={600}
                            fill="#1a2233"
                          >
                            {s.label}
                          </text>
                        ) : (
                          <g key={`n-${s.key}-${props.index}`} />
                        )
                }
              />
            ))}
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
