import React, { useMemo } from 'react';
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import { computeAttackMarkers } from './attackMarkers';
import { renderAttackArea, renderAttackLines, renderAlertLines } from './AttackOverlay';
import { useChartTheme } from '../../theme/ThemeContext';

// Chart showing Flow Packets/s for a specific alert level alongside BENIGN
// seconds, with the attack-phase band and start/peak/end markers.

const LEVEL_LABELS = { LOW: 'LOW', MED: 'MEDIUM', HIGH: 'HIGH' };

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
        Flow Packets/s: <span className="font-mono" style={{ color: palette.tooltipText }}>{typeof d.FlowPackets_s === 'number' ? d.FlowPackets_s.toFixed(2) : d.FlowPackets_s}</span>
      </div>
      <div style={{ color: palette.tooltipMuted }}>
        Alert: <span className="font-semibold" style={{ color: palette.level[d.Warning] || palette.axis }}>{d.Warning}</span>
      </div>
    </div>
  );
}

export default function AlertLevelChart({ data, maxSeconds, level, markers }) {
  const palette = useChartTheme();
  const filtered = useMemo(() => {
    if (!data) return [];
    return data
      .filter((d) => d.Warning === 'BENIGN' || d.Warning === level)
      .map((d) => ({ ...d, value: d.FlowPackets_s ?? 0 }));
  }, [data, level]);

  // Markers come from the FULL (unfiltered) data so start/peak/end stay correct
  // even though the bars only show BENIGN + this alert level.
  const computedMarkers = useMemo(() => computeAttackMarkers(data), [data]);
  const m = markers ?? computedMarkers;

  if (!filtered.length) {
    return (
      <div className="h-full flex items-center justify-center text-textSecondary">
        No {LEVEL_LABELS[level] || level} alerts detected
      </div>
    );
  }

  const levelColor = palette.level[level] || palette.accent;
  const legend = [
    { value: 'Benign', type: 'square', color: palette.level.BENIGN },
    { value: `${LEVEL_LABELS[level] || level} alert`, type: 'square', color: levelColor },
    ...(m.hasAttack ? [
      { value: 'Attack phase', type: 'rect', color: palette.phaseBand },
      { value: 'Start', type: 'line', color: palette.marker.start },
      { value: 'Peak', type: 'line', color: palette.marker.peak },
      { value: 'End', type: 'line', color: palette.marker.end },
    ] : []),
  ];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={filtered} margin={{ top: 8, right: 28, left: 12, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
        <XAxis
          dataKey="second" type="number" domain={[0, maxSeconds || 'dataMax']}
          stroke={palette.axis} tick={{ fill: palette.axis, fontSize: 12 }}
          label={{ value: 'Seconds', position: 'insideBottom', offset: -12, fill: palette.axisLabel, fontSize: 12 }}
        />
        <YAxis
          stroke={palette.axis} tick={{ fill: palette.axis, fontSize: 12 }}
          width={72} tickFormatter={formatNum}
          label={{ value: 'Flow Packets/s', angle: -90, position: 'insideLeft', fill: palette.axisLabel, fontSize: 12, style: { textAnchor: 'middle' } }}
        />
        <Tooltip content={<CustomTooltip palette={palette} />} />
        <Legend verticalAlign="top" height={34} wrapperStyle={{ color: palette.axisLabel, paddingBottom: 8 }} payload={legend} />
        {/* Downsampled alert lines for this level + attack-phase band, behind bars */}
        {renderAlertLines(data, palette, { maxSeconds, levels: [level] })}
        {renderAttackArea(m, palette)}
        <Bar dataKey="value" name="Flow Packets/s" maxBarSize={6} isAnimationActive={false}>
          {filtered.map((entry, idx) => (
            <Cell key={idx} fill={entry.Warning === 'BENIGN' ? palette.level.BENIGN : levelColor} />
          ))}
        </Bar>
        {/* Start / peak / end markers on top of the bars */}
        {renderAttackLines(m, palette)}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
