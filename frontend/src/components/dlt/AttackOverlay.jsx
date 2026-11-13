import React from 'react';
import { ReferenceArea, ReferenceLine } from 'recharts';
import { getAlertLinesDownsampled } from './attackMarkers';

// Reusable overlays for the recharts <ComposedChart>s. Each function returns an
// array of recharts reference elements and MUST be rendered as a direct child of
// the chart (recharts injects axis context into them). Colors come from the
// active chart palette (useChartTheme) so they adapt to light/dark mode.

const MARKER_DASH = '4 4';
const MARKER_WIDTH = 2;

// Marker labels are stacked on separate vertical rows (Start=row0, Peak=row1,
// End=row2). Stacking by row means that even when start/peak/end fall on nearly
// the same x (a short attack in a long capture) the labels never overlap.
function MarkerLabel(props) {
  const { viewBox, text, color, row = 0, halo = '#000' } = props;
  if (!viewBox) return null;
  const x = viewBox.x;
  const y = (viewBox.y ?? 0) + 12 + row * 15;
  return (
    <text
      x={x}
      y={y}
      fill={color}
      fontSize={11}
      fontWeight={700}
      textAnchor="middle"
      style={{ paintOrder: 'stroke', stroke: halo, strokeWidth: 3, strokeLinejoin: 'round' }}
    >
      {text}
    </text>
  );
}

function markerLine(key, x, color, name, row, halo) {
  return (
    <ReferenceLine
      key={key}
      x={x}
      stroke={color}
      strokeDasharray={MARKER_DASH}
      strokeWidth={MARKER_WIDTH}
      ifOverflow="extendDomain"
      label={<MarkerLabel text={`${name} · ${x}s`} color={color} row={row} halo={halo} />}
    />
  );
}

// Shaded band spanning the attack phase (first→last DDoS second). Render BEFORE
// the bars so it sits behind them.
export function renderAttackArea(markers, palette) {
  if (!markers?.hasAttack) return null;
  const { attackStart, attackEnd } = markers;
  if (attackStart === null || attackEnd === null || attackEnd < attackStart) return null;
  const color = palette?.phaseBand || '#EF4444';
  return [
    <ReferenceArea
      key="attack-phase"
      x1={attackStart}
      x2={attackEnd}
      fill={color}
      fillOpacity={0.10}
      stroke={color}
      strokeOpacity={0.25}
      ifOverflow="extendDomain"
    />,
  ];
}

// Vertical markers for attack start, peak and end (labels stacked by row). Render
// AFTER the bars so the lines and labels sit on top.
export function renderAttackLines(markers, palette) {
  if (!markers?.hasAttack) return null;
  const c = palette?.marker || { start: '#F59E0B', peak: '#EF4444', end: '#A855F7' };
  const halo = palette?.tooltipBg || '#0F1115';
  const { attackStart, attackPeak, attackEnd } = markers;
  const lines = [];
  if (attackStart !== null && attackStart !== undefined) {
    lines.push(markerLine('attack-start', attackStart, c.start, 'Start', 0, halo));
  }
  if (attackPeak !== null && attackPeak !== undefined) {
    lines.push(markerLine('attack-peak', attackPeak, c.peak, 'Peak', 1, halo));
  }
  if (attackEnd !== null && attackEnd !== undefined && attackEnd !== attackStart) {
    lines.push(markerLine('attack-end', attackEnd, c.end, 'End', 2, halo));
  }
  return lines.length ? lines : null;
}

// Downsampled vertical alert lines (colored by severity). `opts.maxSeconds` sets
// the x-extent for bucketing; `opts.levels` restricts to some severities (used by
// the per-level charts). Render BEFORE the bars.
export function renderAlertLines(data, palette, opts = {}) {
  const points = getAlertLinesDownsampled(data, {
    maxSeconds: opts.maxSeconds,
    maxLines: opts.maxLines ?? 220,
    levels: opts.levels || null,
  });
  if (!points.length) return null;
  const levelColors = palette?.level || { LOW: '#38BDF8', MED: '#FBBF24', HIGH: '#F87171' };
  return points.map((p, i) => (
    <ReferenceLine
      key={`alert-${p.second}-${i}`}
      x={p.second}
      stroke={levelColors[p.level] || '#94A3B8'}
      strokeWidth={1}
      strokeOpacity={p.level === 'HIGH' ? 0.5 : 0.3}
      ifOverflow="extendDomain"
    />
  ));
}
