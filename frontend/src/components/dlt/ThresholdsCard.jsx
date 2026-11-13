import React from 'react';

// Shows the mu + k*sigma residual thresholds derived from the benign baseline
// (dlt/pipeline.py: run_train_only -> LOW/MED/HIGH), matching v1's Thresholds tab.
export default function ThresholdsCard({ thresholds }) {
  if (!thresholds) return null;
  const rows = [
    { key: 'LOW', label: 'LOW', value: thresholds.LOW, color: 'text-accent' },
    { key: 'MED', label: 'MEDIUM', value: thresholds.MED, color: 'text-[#FF8B00]' },
    { key: 'HIGH', label: 'HIGH', value: thresholds.HIGH, color: 'text-danger' },
  ];
  return (
    <div className="bg-surface border border-border rounded-xl p-6">
      <h3 className="text-lg font-semibold text-primary mb-4">Residual Thresholds</h3>
      <p className="text-sm text-textSecondary mb-4">
        PINN + Laplace residual of the observed traffic against the learned benign
        linear-system baseline. A second is flagged once its residual crosses one of
        these thresholds (mean + k&sigma; of the training residuals).
      </p>
      <div className="grid grid-cols-3 gap-4">
        {rows.map((r) => (
          <div key={r.key} className="bg-background rounded-lg p-4 text-center border border-border">
            <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${r.color}`}>{r.label}</div>
            <div className="text-xl font-mono text-text">
              {typeof r.value === 'number' ? r.value.toFixed(4) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
