import { useEffect, useState } from 'react';
import { getMlInfo, describeError } from '../api/ews';
import PageHeader from '../components/ui/PageHeader';

// Machine Learning Information: describes the active detection approach, its
// per-workflow baselines, features and runtime configuration.
export default function MLInfo() {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getMlInfo()
      .then((d) => { if (alive) { setInfo(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); });
    return () => { alive = false; };
  }, []);

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Model" title="Machine Learning Information"
          subtitle={info?.name} />

        {error && <div className="mb-6 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

        {info && (
          <div className="space-y-6">
            {info.summary && <Card title="Summary"><p className="text-textSecondary">{info.summary}</p></Card>}

            {info.model_selection && <ModelSelection ms={info.model_selection} />}

            {Array.isArray(info.approach) && (
              <Card title="How it works">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-textSecondary">
                  {info.approach.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card title="Details">
                <KVList obj={{
                  framework: info.framework,
                  min_seconds: info.min_seconds,
                  feature_count: info.feature_count,
                }} />
              </Card>
              <Card title="Thresholds">
                <KVList obj={orderThresholds(info.thresholds)} />
              </Card>
            </div>

            {info.configuration && (
              <Card title="Runtime configuration">
                <KVList obj={info.configuration} />
              </Card>
            )}

            {Array.isArray(info.features) && (
              <Card title={`Features (${info.feature_count ?? info.features.length})`}>
                <div className="flex flex-wrap gap-2">
                  {info.features.map((f) => (
                    <span key={f} className="rounded-md border border-border bg-surfaceElevated px-2.5 py-1 font-mono text-xs text-textSecondary">{f}</span>
                  ))}
                </div>
              </Card>
            )}

            {Array.isArray(info.available_approaches) && (
              <Card title="Available approaches">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {info.available_approaches.map((a) => (
                    <div key={a.id} className={`rounded-lg border p-4 ${a.active ? 'border-primary bg-primary/5' : 'border-border bg-surfaceElevated'}`}>
                      <div className="mb-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-text">{a.name}</span>
                        {a.active && <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Active</span>}
                      </div>
                      <p className="text-xs text-textSecondary">{a.description}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelSelection({ ms }) {
  const live = ms.modes?.LIVE || {};
  const csv = ms.modes?.CSV || {};
  const last = ms.last_used;
  const Row = ({ badge, m }) => (
    <div className="rounded-lg border border-border bg-surfaceElevated p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">{badge}</span>
        <span className="text-sm font-semibold text-text">{m.workflow}</span>
      </div>
      <dl className="space-y-1 font-mono text-xs text-textSecondary">
        <div className="flex justify-between gap-2"><dt>Dataset</dt><dd className="text-text">{m.dataset}</dd></div>
        {m.model && <div className="flex justify-between gap-2"><dt>Model</dt><dd className="text-text">{m.model}</dd></div>}
        <div className="flex justify-between gap-2"><dt>Thresholds</dt><dd className="text-text">{m.thresholds}</dd></div>
      </dl>
    </div>
  );
  return (
    <Card title="Baseline selection by workflow">
      <p className="mb-3 text-sm text-textSecondary">
        Each workflow uses its own benign baseline and never the other's
        {ms.approach?.name ? ` (approach: ${ms.approach.name})` : ''}.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Row badge="LIVE" m={live} />
        <Row badge="CSV" m={csv} />
      </div>
      {last && (
        <p className="mt-3 text-xs text-textSecondary">
          Last analysis: <span className="font-mono text-text">{last.mode}</span> mode
          {last.dataset ? <> on <span className="font-mono text-text">{last.dataset}</span></> : null}
          {last.at ? ` at ${last.at}` : ''}.
        </p>
      )}
    </Card>
  );
}

function Card({ title, children }) {
  return (
    <div className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
      <h2 className="mb-3 font-display text-lg font-semibold text-text">{title}</h2>
      {children}
    </div>
  );
}

// Render thresholds in severity order (LOW -> MED -> HIGH), independent of the key
// order the backend's JSON serializer happens to use.
function orderThresholds(thr) {
  if (!thr) return thr;
  const ordered = {};
  for (const k of ["LOW", "MED", "HIGH"]) if (thr[k] !== undefined) ordered[k] = thr[k];
  for (const [k, v] of Object.entries(thr)) if (!(k in ordered)) ordered[k] = v;
  return ordered;
}

function KVList({ obj }) {
  const entries = Object.entries(obj || {}).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return <p className="text-sm text-textSecondary">—</p>;
  return (
    <dl className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-0 sm:flex-row sm:justify-between">
          <dt className="text-sm font-medium capitalize text-textSecondary">{k.replace(/_/g, ' ')}</dt>
          <dd className="font-mono text-sm text-text sm:text-right">{String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
