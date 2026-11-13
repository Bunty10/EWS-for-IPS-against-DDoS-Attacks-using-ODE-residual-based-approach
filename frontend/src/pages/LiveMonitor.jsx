import { useState } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import usePolling from '../hooks/usePolling';
import { getLiveMonitor } from '../api/ews';
import PageHeader from '../components/ui/PageHeader';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Live Traffic Monitoring: Timestamp / Source IP / Destination IP / Protocol,
// auto-refreshed every few seconds. Refresh cadence is user-selectable.
export default function LiveMonitor() {
  const [intervalMs, setIntervalMs] = useState(3000);
  const { data, error } = usePolling(() => getLiveMonitor(50), intervalMs);
  const rows = data?.rows || [];
  const capturing = data?.capturing;

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="Real-time"
          title="Live Traffic Monitoring"
          subtitle="The 50 most recent analyzed seconds with their early-warning level, refreshed automatically."
          actions={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-2 text-xs text-textSecondary">
                <span className={`h-2 w-2 rounded-full ${capturing ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
                {capturing ? 'Capturing' : 'Idle'}
              </span>
              <select
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                className="rounded-lg border border-border bg-surfaceElevated px-3 py-2 text-sm text-text"
              >
                <option value={2000}>Every 2s</option>
                <option value={3000}>Every 3s</option>
                <option value={5000}>Every 5s</option>
                <option value={10000}>Every 10s</option>
              </select>
            </div>
          }
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-surface/70 shadow-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-3 text-sm text-textSecondary">
            <span>{rows.length} rows</span>
            <span className="flex items-center gap-1.5"><ArrowPathIcon className="h-4 w-4" /> auto-refresh</span>
          </div>
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surfaceElevated text-left text-xs uppercase tracking-wide text-textSecondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Source IP</th>
                  <th className="px-4 py-3 font-medium">Destination IP</th>
                  <th className="px-4 py-3 font-medium">Protocol</th>
                  <th className="px-4 py-3 font-medium">Packets/s</th>
                  <th className="px-4 py-3 font-medium">Level</th>
                </tr>
              </thead>
              <tbody className="font-mono text-xs">
                {rows.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-16 text-center font-sans text-textSecondary">
                    No live traffic captured yet. Live capture starts automatically at launch.
                  </td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={`${r.second}-${i}`} className={`border-t border-border ${threat(r.level).soft}`}>
                    <td className="px-4 py-2 text-textSecondary">{r.timestamp || `t=${r.second}`}</td>
                    <td className="px-4 py-2">{r.source_ip}</td>
                    <td className="px-4 py-2">{r.destination_ip}</td>
                    <td className="px-4 py-2">{r.protocol}</td>
                    <td className="px-4 py-2">{typeof r.packets_s === 'number' ? r.packets_s.toFixed(1) : '-'}</td>
                    <td className="px-4 py-2"><ThreatBadge level={r.level} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
