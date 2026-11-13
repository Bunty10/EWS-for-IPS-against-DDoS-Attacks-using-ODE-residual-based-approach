import { Link } from 'react-router-dom';
import {
  CpuChipIcon, ShieldExclamationIcon, SignalIcon, BellAlertIcon,
  ServerStackIcon, ArrowRightIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';

import usePolling from '../hooks/usePolling';
import { getDashboard, getLiveMonitor } from '../api/ews';
import MetricCard from '../components/ui/MetricCard';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Dashboard = homepage. Continuously polls the backend (every 3s) so live-capture
// results stream in without a manual refresh.
export default function Dashboard() {
  const { data: dash, error, loading } = usePolling(getDashboard, 3000);
  const { data: live } = usePolling(() => getLiveMonitor(10), 3000);

  const m = dash || {};
  const t = threat(m.current_threat_level);
  const rows = live?.rows || [];

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header + threat level */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-textSecondary">
              Early Warning System · IPS
            </span>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tightest text-text">Security Dashboard</h1>
            <p className="mt-2 text-textSecondary">
              Live early-warning overview {m.capturing ? '· capturing now' : ''}
            </p>
          </div>
          <div className={`rounded-xl border px-5 py-4 text-center ${t.chip}`}>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] opacity-80">Current threat level</p>
            <p className="mt-1 font-display text-2xl font-bold">{t.label.toUpperCase()}</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Key metrics */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Packet capture" value={fmt(m.packet_capture)} icon={CpuChipIcon} accent="primary" loading={loading} hint="packets analyzed" />
          <MetricCard label="Normal traffic" value={fmt(m.normal_traffic)} icon={CheckCircleIcon} accent="green" loading={loading} hint="benign seconds" />
          <MetricCard label="Suspicious traffic" value={fmt(m.suspicious_traffic)} icon={SignalIcon} accent="amber" loading={loading} hint="low + medium" />
          <MetricCard label="High risk" value={fmt(m.high_risk)} icon={ShieldExclamationIcon} accent="red" loading={loading} hint="high-severity seconds" />
          <MetricCard label="Active alerts" value={fmt(m.active_alerts)} icon={BellAlertIcon} accent="amber" loading={loading} hint="this session" />
          <MetricCard label="System status" value={m.system_status || '—'} icon={ServerStackIcon} accent="primary" loading={loading} hint={`${fmt(m.attacks_detected)} total detected`} />
        </div>

        {/* Live capture feed */}
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 rounded-xl border border-border bg-surface/70 shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-display text-lg font-semibold text-text">Live capture feed</h2>
              <span className="flex items-center gap-2 text-xs text-textSecondary">
                <span className={`h-2 w-2 rounded-full ${m.capturing ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                {m.capturing ? 'Live' : 'Idle'}
              </span>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surfaceElevated text-left text-xs uppercase tracking-wide text-textSecondary">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Source IP</th>
                    <th className="px-4 py-2.5 font-medium">Destination IP</th>
                    <th className="px-4 py-2.5 font-medium">Protocol</th>
                    <th className="px-4 py-2.5 font-medium">Level</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-xs">
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-10 text-center font-sans text-textSecondary">
                      No live traffic. Live capture starts automatically; uploaded-CSV results appear under Upload → Dataset Analysis.
                    </td></tr>
                  )}
                  {rows.map((r, i) => (
                    <tr key={`${r.second}-${i}`} className={`border-t border-border ${threat(r.level).soft}`}>
                      <td className="px-4 py-2 text-textSecondary">{r.timestamp || `t=${r.second}`}</td>
                      <td className="px-4 py-2">{r.source_ip}</td>
                      <td className="px-4 py-2">{r.destination_ip}</td>
                      <td className="px-4 py-2">{r.protocol}</td>
                      <td className="px-4 py-2"><ThreatBadge level={r.level} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Quick actions */}
          <div className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Quick actions</h2>
            <div className="flex flex-col gap-2.5">
              {QUICK.map(({ to, label, desc }) => (
                <Link key={to} to={to}
                  className="group flex items-center justify-between rounded-lg border border-border bg-surfaceElevated px-4 py-3 transition-colors hover:border-primary/40">
                  <span>
                    <span className="block text-sm font-semibold text-text">{label}</span>
                    <span className="block text-xs text-textSecondary">{desc}</span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const QUICK = [
  { to: '/flow-analysis', label: 'Upload dataset', desc: 'Analyze a captured-traffic CSV' },
  { to: '/alerts', label: 'Alert history', desc: 'Review stored predictions' },
  { to: '/statistics', label: 'Statistics', desc: 'Pie / line / bar charts' },
  { to: '/topology', label: 'Network topology', desc: 'See the attack path' },
  { to: '/admin', label: 'Admin panel', desc: 'Capture control & reports' },
];

function fmt(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString();
  return v;
}
