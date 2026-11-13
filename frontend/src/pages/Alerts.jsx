import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAlerts, describeError } from '../api/ews';
import PageHeader from '../components/ui/PageHeader';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Alert History — the predictions stored in the SQLite database. Click a row to
// open its full Attack Details.
const LEVELS = ['ALL', 'HIGH', 'MED', 'LOW'];

export default function Alerts() {
  const navigate = useNavigate();
  const [level, setLevel] = useState('ALL');
  const [data, setData] = useState({ alerts: [], total: 0 });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getAlerts({ limit: 250, ...(level !== 'ALL' ? { level } : {}) })
      .then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [level]);

  const alerts = data.alerts || [];
  const counts = useMemo(() => {
    const c = { HIGH: 0, MED: 0, LOW: 0 };
    alerts.forEach((a) => { if (c[a.level] !== undefined) c[a.level] += 1; });
    return c;
  }, [alerts]);

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader
          eyebrow="History"
          title="Alert History"
          subtitle="The 250 most recent alerts (newest first). One alert per timestamp — a second's severity is never overwritten. Open an alert for details and recommendations."
          actions={
            <div className="flex gap-1 rounded-lg border border-border bg-surfaceElevated p-1">
              {LEVELS.map((l) => (
                <button key={l} type="button" onClick={() => setLevel(l)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    level === l ? 'bg-primary text-white' : 'text-textSecondary hover:text-text'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          }
        />

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>
        )}

        <div className="mb-4 flex flex-wrap gap-4 text-sm text-textSecondary">
          <span>Showing <b className="text-text">{alerts.length}</b> alerts</span>
          <span className="text-red-500">HIGH: {counts.HIGH}</span>
          <span className="text-amber-500">MED: {counts.MED}</span>
          <span className="text-green-500">LOW: {counts.LOW}</span>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-surface/70 shadow-card">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surfaceElevated text-left text-xs uppercase tracking-wide text-textSecondary">
                <tr>
                  <th className="px-4 py-3 font-medium">Logged</th>
                  <th className="px-4 py-3 font-medium">Timestamp</th>
                  <th className="px-4 py-3 font-medium">Source IP</th>
                  <th className="px-4 py-3 font-medium">Destination IP</th>
                  <th className="px-4 py-3 font-medium">Attack Type</th>
                  <th className="px-4 py-3 font-medium">Confidence</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                </tr>
              </thead>
              <tbody>
                {!loading && alerts.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-16 text-center text-textSecondary">
                    No alerts stored yet. Run an analysis to populate the history.
                  </td></tr>
                )}
                {alerts.map((a) => (
                  <tr key={a.id} onClick={() => navigate(`/alerts/${a.id}`)}
                    className={`cursor-pointer border-t border-border transition-colors hover:bg-primary/5 ${threat(a.level).soft}`}>
                    <td className="px-4 py-2.5 font-mono text-xs text-textSecondary">{a.created_at}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.timestamp || `t=${a.second}`}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.source_ip || '-'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.destination_ip || '-'}</td>
                    <td className="px-4 py-2.5">{a.attack_type || '-'}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : '-'}</td>
                    <td className="px-4 py-2.5"><ThreatBadge level={a.level} /></td>
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
