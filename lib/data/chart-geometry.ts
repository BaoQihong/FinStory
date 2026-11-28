// Pure geometry helpers for the article time-series chart. No React, no data
// changes: these decide how *observed* points are drawn, never what they are.

const DAY = 86_400_000;

/**
 * The largest calendar gap between two consecutive observations of one series
 * that is still drawn as a continuous line. Derived from the series' own
 * cadence (median spacing), so weekends and holidays in a business-day series,
 * and every-nth thinning, stay connected, while a missing observation — a
 * skipped month in a monthly series, a missing week in a weekly or thinned
 * daily series — is shown as a break. Timestamps that belong only to other
 * series in the chart play no part: each series is judged on its own dates.
 */
export function gapThreshold(ts: number[]): number {
  const d: number[] = [];
  for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
  if (!d.length) return Infinity;
  d.sort((a, b) => a - b);
  const median = d[Math.floor((d.length - 1) / 2)];
  return Math.max(1.5 * median, median + 5 * DAY);
}

/**
 * Splits one series' (sorted) observation timestamps into runs that are drawn
 * as continuous lines. Returns [startIndex, endIndex] pairs, inclusive; a run
 * of one point is a lone observation between two genuine gaps.
 */
export function segmentRuns(ts: number[]): [number, number][] {
  if (!ts.length) return [];
  const limit = gapThreshold(ts);
  const out: [number, number][] = [];
  let start = 0;
  for (let i = 1; i < ts.length; i++) {
    if (ts[i] - ts[i - 1] > limit) {
      out.push([start, i - 1]);
      start = i;
    }
  }
  out.push([start, ts.length - 1]);
  return out;
}

/** Word-wraps a label to lines of at most `maxChars` (a longer single word keeps its own line). */
export function wrapLabel(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Places label blocks next to the line ends without overlapping. Each item
 * wants its block centred on `y`; blocks keep their vertical order, are pushed
 * apart by at least `gap`, and are kept inside [top, bottom] where possible.
 * Returns the top edge of each block, in input order.
 */
export function layoutLabels(items: { y: number; height: number }[], top: number, bottom: number, gap = 4): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y);
  const pos = new Array<number>(items.length);
  // Downward pass: centre on the target, then clear the previous block.
  let floor = top;
  for (const i of order) {
    const want = items[i].y - items[i].height / 2;
    pos[i] = Math.max(want, floor);
    floor = pos[i] + items[i].height + gap;
  }
  // Upward pass: pull the stack back inside the bottom edge.
  let ceil = bottom;
  for (const i of [...order].reverse()) {
    if (pos[i] + items[i].height > ceil) pos[i] = ceil - items[i].height;
    ceil = pos[i] - gap;
  }
  // If the stack is taller than the space, the top edge wins (labels may overflow below rather than above).
  let f = top;
  for (const i of order) {
    if (pos[i] < f) pos[i] = f;
    f = pos[i] + items[i].height + gap;
  }
  return pos;
}
