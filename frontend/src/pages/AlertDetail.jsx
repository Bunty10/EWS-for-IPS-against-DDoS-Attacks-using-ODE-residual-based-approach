import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon, NoSymbolIcon, ShieldCheckIcon, CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { getAlert, blockIp, describeError } from '../api/ews';
import ThreatBadge from '../components/ui/ThreatBadge';
import { threat } from '../theme/threatColors';

// Attack Details for a single alert + the severity-based recommendation.
export default function AlertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState(null);
  const [blockMsg, setBlockMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    getAlert(id)
      .then((d) => { if (alive) { setAlert(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); });
    return () => { alive = false; };
  }, [id]);

  const handleBlock = async () => {
    if (!alert?.source_ip) return;
    try {
      await blockIp(alert.source_ip, `From alert #${alert.id} (${alert.level})`);
      setBlockMsg(`Blocked ${alert.source_ip}.`);
    } catch (e) {
      setBlockMsg(describeError(e));
    }
  };

  const t = threat(alert?.level);
  const rec = alert?.recommendation;

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <button type="button" onClick={() => navigate('/alerts')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-textSecondary hover:text-primary">
          <ArrowLeftIcon className="h-4 w-4" /> Back to alerts
        </button>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        {alert && (
          <>
            <div className={`mb-6 flex flex-col gap-4 rounded-2xl border p-6 shadow-card sm:flex-row sm:items-center sm:justify-between ${t.chip}`}>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] opacity-80">Attack detected</p>
                <h1 className="mt-1 font-display text-3xl font-bold">{alert.attack_type || 'Anomaly'}</h1>
              </div>
              <div className="text-right">
                <ThreatBadge level={alert.level} className="text-sm" />
                <p className="mt-2 font-mono text-2xl font-semibold">
                  {alert.confidence != null ? `${Math.round(alert.confidence * 100)}%` : '—'}
                </p>
                <p className="text-xs opacity-80">confidence</p>
              </div>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail label="Attack type" value={alert.attack_type || 'Anomaly'} />
              <Detail label="Severity" value={threat(alert.level).label} />
              <Detail label="Source IP" value={alert.source_ip || '-'} mono />
              <Detail label="Destination IP" value={alert.destination_ip || '-'} mono />
              <Detail label="Protocol" value={alert.protocol || '-'} mono />
              <Detail label="Confidence score" value={alert.confidence != null ? `${Math.round(alert.confidence * 100)}%` : '-'} mono />
              <Detail label="Traffic timestamp" value={alert.timestamp || `t=${alert.second}`} mono />
              <Detail label="Logged at" value={alert.created_at} mono />
            </div>

            {/* Recommendation */}
            {rec && (
              <div className="mt-6 rounded-xl border border-border bg-surface/70 p-6 shadow-card">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheckIcon className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-lg font-semibold text-text">Recommended action</h2>
                </div>
                <p className="mb-3 font-medium text-text">{rec.headline}</p>
                <ul className="space-y-2">
                  {rec.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-textSecondary">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{a}
                    </li>
                  ))}
                </ul>

                {alert.source_ip && (
                  <div className="mt-5 flex items-center gap-3">
                    <button type="button" onClick={handleBlock}
                      className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600">
                      <NoSymbolIcon className="h-4 w-4" /> Block {alert.source_ip}
                    </button>
                    {blockMsg && <span className="text-sm text-textSecondary">{blockMsg}</span>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value, mono }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-4 shadow-card">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-textSecondary">{label}</p>
      <p className={`mt-1.5 text-text ${mono ? 'font-mono text-sm' : 'font-medium'}`}>{value}</p>
    </div>
  );
}
