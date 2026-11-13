import { Link } from 'react-router-dom';
import {
  ArrowTopRightOnSquareIcon, BellAlertIcon, ShieldExclamationIcon,
} from '@heroicons/react/24/outline';
import usePolling from '../hooks/usePolling';
import { getDashboard, getAlerts } from '../api/ews';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Mobile Dashboard — a compact, standalone view (no desktop navbar) so an admin
// can monitor threat level and recent HIGH alerts from a phone. Route: /mobile.
export default function MobileDashboard() {
  const { data: dash } = usePolling(getDashboard, 4000);
  const { data: alertData } = usePolling(() => getAlerts({ limit: 15 }), 5000);

  const m = dash || {};
  const t = threat(m.current_threat_level);
  const alerts = alertData?.alerts || [];

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface/90 px-4 py-3 backdrop-blur">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-neon" />
          <span className="font-display text-base font-semibold text-text">EWS IPS Mobile</span>
        </span>
        <Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-textSecondary">
          Full site <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
        </Link>
      </header>

      <div className="space-y-4 px-4 py-5">
        {/* Threat level hero */}
        <div className={`rounded-2xl border p-6 text-center ${t.chip}`}>
          <ShieldExclamationIcon className="mx-auto h-8 w-8" />
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.2em] opacity-80">Threat level</p>
          <p className="font-display text-3xl font-bold">{t.label.toUpperCase()}</p>
          <p className="mt-1 text-xs opacity-80">{m.system_status || '—'} · {m.capturing ? 'capturing' : 'idle'}</p>
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Packets" value={fmt(m.packet_capture)} />
          <Stat label="Active alerts" value={fmt(m.active_alerts)} accent="text-amber-500" />
          <Stat label="Suspicious" value={fmt(m.suspicious_traffic)} accent="text-amber-500" />
          <Stat label="High risk" value={fmt(m.high_risk)} accent="text-red-500" />
        </div>

        {/* Recent alerts */}
        <div className="rounded-2xl border border-border bg-surface/70 p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold text-text">
            <BellAlertIcon className="h-5 w-5 text-primary" /> Recent alerts
          </h2>
          {alerts.length === 0 ? (
            <p className="py-6 text-center text-sm text-textSecondary">No alerts yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {alerts.map((a) => (
                <li key={a.id}>
                  <Link to={`/alerts/${a.id}`} className={`flex items-center justify-between gap-2 py-2.5 ${threat(a.level).soft}`}>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-xs text-text">{a.source_ip || '-'}</span>
                      <span className="block text-[11px] text-textSecondary">{a.created_at}</span>
                    </span>
                    <ThreatBadge level={a.level} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = 'text-primary' }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-4 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-textSecondary">{label}</p>
      <p className={`mt-1 font-mono text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function fmt(v) {
  if (v === null || v === undefined) return '—';
  return typeof v === 'number' ? v.toLocaleString() : v;
}
