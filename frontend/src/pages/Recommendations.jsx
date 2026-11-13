import { useEffect, useState } from 'react';
import { CheckCircleIcon } from '@heroicons/react/24/outline';
import { getRecommendations, describeError } from '../api/ews';
import PageHeader from '../components/ui/PageHeader';
import { threat } from '../theme/threatColors';

// Auto Recommendations reference — the action playbook per alert level. The same
// data drives each Alert Detail page and the HIGH-alert email.
const ORDER = ['LOW', 'MED', 'HIGH'];

export default function Recommendations() {
  const [recs, setRecs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getRecommendations()
      .then((d) => { if (alive) { setRecs(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Playbook" title="Auto Recommendations"
          subtitle="What to do at each severity level. HIGH alerts also trigger an email notification." />

        {error && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        <div className="space-y-4">
          {recs && ORDER.map((lvl) => {
            const r = recs[lvl];
            if (!r) return null;
            const t = threat(lvl);
            return (
              <div key={lvl} className="overflow-hidden rounded-xl border border-border bg-surface/70 shadow-card">
                <div className={`flex items-center justify-between border-b border-border px-5 py-3 ${t.soft}`}>
                  <span className="flex items-center gap-2 font-display text-lg font-semibold text-text">
                    <span className={`h-2.5 w-2.5 rounded-full ${t.dot}`} /> {t.label} severity
                  </span>
                  <span className="text-sm font-medium text-textSecondary">{r.headline}</span>
                </div>
                <ul className="space-y-2 p-5">
                  {r.actions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-textSecondary">
                      <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{a}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
