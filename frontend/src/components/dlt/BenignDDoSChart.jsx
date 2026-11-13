import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { computeAttackMarkers } from './attackMarkers';
import { renderAttackArea, renderAttackLines, renderAlertLines } from './AttackOverlay';
import { useChartTheme } from '../../theme/ThemeContext';

// Per-metric chart showing BENIGN (green) vs DDoS (red) traffic over time, with
// attack start/peak/end markers, the attack-phase band, and full-height alert
// lines so alerts are visible against the traffic flow.

// Compact axis number formatting so large values (e.g. Flow Bytes/s) fit.
function formatNum(v) {
  if (v == null || Number.isNaN(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

function CustomTooltip({ active, payload, palette }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d || !palette) return null;
  return (
    <div
      className="rounded-lg p-3 text-sm shadow-xl"
      style={{ background: palette.tooltipBg, border: `1px solid ${palette.tooltipBorder}`, color: palette.tooltipText }}
    >
      <div className="font-semibold mb-1" style={{ color: palette.mode === 'light' ? palette.level.LOW : '#67E8F9' }}>Second {d.second}</div>
      {d.Timestamp && <div style={{ color: palette.tooltipMuted }}>Timestamp: <span style={{ color: palette.tooltipText }}>{d.Timestamp}</span></div>}
      {d.SourceIP && <div style={{ color: palette.tooltipMuted }}>Source IP: <span style={{ color: palette.tooltipText }}>{d.SourceIP}</span></div>}
      {d.DestinationIP && <div style={{ color: palette.tooltipMuted }}>Dest IP: <span style={{ color: palette.tooltipText }}>{d.DestinationIP}</span></div>}
      <div className="mt-1" style={{ color: palette.tooltipMuted }}>
        {payload[0]?.name}: <span className="font-mono" style={{ color: palette.tooltipText }}>{typeof d.value === 'number' ? d.value.toFixed(2) : d.value}</span>
      </div>
      <div style={{ color: palette.tooltipMuted }}>
        Label: <span className="font-semibold" style={{ color: d.Label === 'DDoS' ? palette.ddos : palette.benign }}>{d.Label}</span>
      </div>
      {d.Warning && d.Warning !== 'BENIGN' && (
        <div style={{ color: palette.tooltipMuted }}>
          Alert: <span className="font-semibold" style={{ color: palette.level[d.Warning] || palette.axis }}>{d.Warning}</span>
        </div>
      )}
    </div>
  );
}

export default function BenignDDoSChart({ data, maxSeconds, metric, metricLabel, markers }) {
  const palette = useChartTheme();
  const patched = useMemo(() => (data || []).map((d) => ({
    ...d,
    value: d[metric] ?? 0,
  })), [data, metric]);

  // Attack window (start / peak / end / phase). Use shared markers if the parent
  // computed them; otherwise derive from this chart's own (full) data.
  const computedMarkers = useMemo(() => computeAttackMarkers(data), [data]);
  const m = markers ?? computedMarkers;

  if (!data || data.length === 0) {
    return <div className="h-full flex items-center justify-center text-textSecondary">Waiting for data...</div>;
  }

  const legend = [
    { value: 'Normal', type: 'square', color: palette.benign },
    { value: 'Anomalous', type: 'square', color: palette.ddos },
    ...(m.hasAttack ? [
      { value: 'Attack phase', type: 'rect', color: palette.phaseBand },
      { value: 'Start', type: 'line', color: palette.marker.start },
      { value: 'Peak', type: 'line', color: palette.marker.peak },
      { value: 'End', type: 'line', color: palette.marker.end },
    ] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={patched} margin={{ top: 8, right: 28, left: 12, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
        <XAxis
          dataKey="second" type="number" domain={[0, maxSeconds || 'dataMax']}
          stroke={palette.axis} tick={{ fill: palette.axis, fontSize: 12 }}
          label={{ value: 'Seconds', position: 'insideBottom', offset: -12, fill: palette.axisLabel, fontSize: 12 }}
        />
        <YAxis
          stroke={palette.axis} tick={{ fill: palette.axis, fontSize: 12 }}
          width={64} tickFormatter={formatNum}
        />
        <Tooltip content={<CustomTooltip palette={palette} />} />
        <Legend verticalAlign="top" height={34} wrapperStyle={{ color: palette.axisLabel, paddingBottom: 8 }} payload={legend} />
        {/* Downsampled alert lines + attack-phase band behind the bars */}
        {renderAlertLines(data, palette, { maxSeconds })}
        {renderAttackArea(m, palette)}
        <Bar dataKey="value" name={metricLabel || metric} maxBarSize={6} isAnimationActive={false}>
          {patched.map((entry, idx) => (
            <Cell key={idx} fill={entry.Label === 'DDoS' ? palette.ddos : palette.benign} />
          ))}
        </Bar>
        {/* Start / peak / end markers on top of the bars */}
        {renderAttackLines(m, palette)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
