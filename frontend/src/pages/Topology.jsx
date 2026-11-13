import { useEffect, useState } from 'react';
import { getTopology, describeError } from '../api/ews';
import PageHeader from '../components/ui/PageHeader';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Network Topology — live defence-in-depth view for Residual-based ODE EWS IPS.
//
//   Network / Internet (External) → Firewall (Perimeter) → IPS / EWS (Prevention) → Source IPs
//
// The fixed left-to-right trunk turns RED when any live source is suspicious and
// stays GREEN while traffic is normal. Each source IP fans out from the IPS/EWS
// node with its own path: GREEN when the source has no alerts, RED (animated
// dashes) when it has MED/HIGH. Updates live every few seconds while capturing;
// shows an idle state when there is no communication. Data comes from the frozen
// live store (backend service.topology).
const GREEN = '#22c55e';
const RED = '#ef4444';
const MAX_NODES = 8;                 // cap drawn source nodes so the diagram stays legible

// viewBox geometry
const W = 1000;
const H = 560;
const CY = H / 2;
const BOX_W = 168;
const BOX_H = 84;

// Trunk node x-positions (left edge). Evenly spaced with a gap for the edges.
const INTERNET_X = 20;
const FIREWALL_X = 250;
const IPS_X = 480;
const IPS_RIGHT = IPS_X + BOX_W;     // where source paths originate
const SRC_X = 800;                   // left edge of the source-IP column
const SRC_W = 176;
const SRC_H = 52;
const TOP_PAD = 50;

export default function Topology() {
  const [topo, setTopo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () => getTopology()
      .then((d) => { if (alive) { setTopo(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); });
    load();
    const id = setInterval(load, 3000);   // live refresh
    return () => { alive = false; clearInterval(id); };
  }, []);

  const idle = topo?.idle;
  const allSources = topo?.sources || [];
  const sources = allSources.slice(0, MAX_NODES);
  const extra = allSources.length - sources.length;
  const trunkColor = topo?.has_suspicious ? RED : GREEN;

  // Vertically distribute the drawn source nodes across the canvas.
  const srcY = (i, n) => {
    const usable = H - TOP_PAD * 2;
    return TOP_PAD + (n <= 1 ? usable / 2 : (i / (n - 1)) * usable);
  };

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Network"
          title="Network Topology"
          subtitle="Defence-in-depth flow: Internet → Firewall → IPS / EWS → live source IPs. Paths turn red when a source is suspicious and stay green while traffic is normal. Idle when there is no live traffic."
          actions={topo && (
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs text-textSecondary">
                <span className={`h-2 w-2 rounded-full ${topo.capturing ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                {topo.capturing ? 'Live capture' : 'Not capturing'}
              </span>
              <ThreatBadge level={topo.threat_level} className="text-sm" />
            </div>
          )}
        />

        {error && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-5 text-xs text-textSecondary">
          <span className="flex items-center gap-2"><span className="inline-block h-1 w-6 rounded" style={{ background: GREEN }} /> Normal path</span>
          <span className="flex items-center gap-2"><span className="inline-block h-1 w-6 rounded" style={{ background: RED }} /> Suspicious path (MED / HIGH)</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-border bg-surface/70 p-4 shadow-card">
          {idle ? (
            <div className="flex h-[360px] flex-col items-center justify-center gap-3 text-center">
              <span className="inline-flex h-16 w-24 items-center justify-center rounded-2xl border border-border bg-surfaceElevated font-display text-sm text-textSecondary">
                IPS / EWS
              </span>
              <p className="text-sm text-textSecondary">
                {topo?.capturing
                  ? 'No live communication yet — waiting for traffic…'
                  : 'Live capture is idle. Start monitoring to see live source connections.'}
              </p>
            </div>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full text-text" role="img"
              aria-label="Defence-in-depth network topology: Internet, Firewall, IPS/EWS, source IPs">

              {/* ── Trunk edges (Internet → Firewall → IPS/EWS) ── */}
              <TrunkEdge x1={INTERNET_X + BOX_W} x2={FIREWALL_X} color={trunkColor} active={topo?.has_suspicious} />
              <TrunkEdge x1={FIREWALL_X + BOX_W} x2={IPS_X} color={trunkColor} active={topo?.has_suspicious} />

              {/* ── Source paths (IPS/EWS → each source IP) ── */}
              {sources.map((s, i) => {
                const y = srcY(i, sources.length);
                const color = s.suspicious ? RED : GREEN;
                return (
                  <path key={`e-${s.ip}`}
                    d={`M ${IPS_RIGHT} ${CY} C ${IPS_RIGHT + 90} ${CY}, ${SRC_X - 90} ${y}, ${SRC_X} ${y}`}
                    fill="none" stroke={color} strokeWidth={s.suspicious ? 3 : 2} strokeOpacity={0.9}
                    strokeDasharray={s.suspicious ? '7 5' : undefined}>
                    {s.suspicious && (
                      <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.7s" repeatCount="indefinite" />
                    )}
                  </path>
                );
              })}

              {/* ── Trunk nodes ── */}
              <TrunkNode x={INTERNET_X} label="Network / Internet" sublabel="EXTERNAL" color={trunkColor} />
              <TrunkNode x={FIREWALL_X} label="Firewall" sublabel="PERIMETER" color={trunkColor} />
              <TrunkNode x={IPS_X} label="IPS / EWS" sublabel="PREVENTION" color={trunkColor} highlight
                count={`${allSources.length} source${allSources.length === 1 ? '' : 's'}`} />

              {/* ── Source-IP nodes ── */}
              {sources.map((s, i) => {
                const y = srcY(i, sources.length);
                const color = s.suspicious ? RED : GREEN;
                return (
                  <g key={`n-${s.ip}`}>
                    <rect x={SRC_X} y={y - SRC_H / 2} width={SRC_W} height={SRC_H} rx={9}
                      fill="rgba(120,130,150,0.10)" stroke={color} strokeWidth={1.75} />
                    <text x={SRC_X + SRC_W / 2} y={y - 4} textAnchor="middle" fill="currentColor" style={{ fontSize: 13, fontWeight: 600 }}>
                      {s.ip}
                    </text>
                    <text x={SRC_X + SRC_W / 2} y={y + 14} textAnchor="middle" fill={color} style={{ fontSize: 11, fontWeight: 700 }}>
                      {threat(s.level).label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
          {extra > 0 && (
            <p className="mt-2 text-center text-xs text-textSecondary">+{extra} more source{extra === 1 ? '' : 's'} not shown</p>
          )}
        </div>

        {/* Suspicious sources list */}
        <div className="mt-6 rounded-xl border border-border bg-surface/70 p-5 shadow-card">
          <h2 className="mb-3 font-display text-lg font-semibold text-text">Suspicious sources</h2>
          {allSources.some((s) => s.suspicious) ? (
            <div className="flex flex-wrap gap-2">
              {allSources.filter((s) => s.suspicious).map((s) => (
                <span key={s.ip} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm ${threat(s.level).chip}`}>
                  {s.ip} <span className="opacity-70">{threat(s.level).label}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-textSecondary">
              {topo?.capturing ? 'No suspicious sources — live traffic is normal.' : 'No live capture running — topology is idle.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// A horizontal trunk edge between two defence layers. Animated dashes when a
// suspicious source is present (traffic under attack), solid green otherwise.
function TrunkEdge({ x1, x2, color, active }) {
  return (
    <line x1={x1} y1={CY} x2={x2} y2={CY} stroke={color} strokeWidth={3} strokeOpacity={0.9}
      strokeDasharray={active ? '7 5' : undefined}>
      {active && <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.7s" repeatCount="indefinite" />}
    </line>
  );
}

// A trunk node box (Internet / Firewall / IPS-EWS). `highlight` styles the
// IPS/EWS node as the active prevention layer.
function TrunkNode({ x, label, sublabel, color, highlight, count }) {
  const y = CY - BOX_H / 2;
  const fill = highlight ? 'rgba(34,195,230,0.12)' : 'rgba(120,130,150,0.10)';
  const stroke = highlight ? 'rgba(34,195,230,0.7)' : color;
  return (
    <g>
      <rect x={x} y={y} width={BOX_W} height={BOX_H} rx={12} fill={fill} stroke={stroke} strokeWidth={highlight ? 2 : 1.75} />
      <text x={x + BOX_W / 2} y={CY - (count ? 14 : 6)} textAnchor="middle" fill="currentColor" style={{ fontSize: 15, fontWeight: 700 }}>
        {label}
      </text>
      {count && (
        <text x={x + BOX_W / 2} y={CY + 6} textAnchor="middle" fill="currentColor" opacity={0.6} style={{ fontSize: 11 }}>
          {count}
        </text>
      )}
      <text x={x + BOX_W / 2} y={CY + (count ? 24 : 16)} textAnchor="middle" fill="currentColor" opacity={0.5}
        style={{ fontSize: 10, letterSpacing: 1 }}>
        {sublabel}
      </text>
    </g>
  );
}
