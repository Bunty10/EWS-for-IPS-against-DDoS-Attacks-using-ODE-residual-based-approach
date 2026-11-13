// KPI tile for the Dashboard / Mobile Dashboard. `accent` tints the value and
// the left rule; `hint` is an optional small caption under the value.
const ACCENTS = {
  primary: 'text-primary',
  green: 'text-green-500',
  amber: 'text-amber-500',
  red: 'text-red-500',
  text: 'text-text',
};

export default function MetricCard({ label, value, hint, icon: Icon, accent = 'text', loading = false }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-surface/70 p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-textSecondary">{label}</p>
          <p className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${ACCENTS[accent] || ACCENTS.text}`}>
            {loading ? '—' : value}
          </p>
          {hint && <p className="mt-1 text-xs text-textSecondary">{hint}</p>}
        </div>
        {Icon && (
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surfaceElevated ${ACCENTS[accent] || ACCENTS.text}`}>
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
    </div>
  );
}
