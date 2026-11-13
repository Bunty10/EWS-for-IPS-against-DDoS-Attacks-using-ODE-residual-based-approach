import React from 'react';

const STATUS_LABEL = {
  idle: 'Idle',
  processing: 'Analyzing',
  capturing: 'Capturing (live analysis)',
  analyzing: 'Finalizing analysis',
  done: 'Complete',
  error: 'Error',
};

const STATUS_COLOR = {
  idle: 'bg-textSecondary',
  processing: 'bg-primary',
  capturing: 'bg-accent',
  analyzing: 'bg-accent',
  done: 'bg-secondary',
  error: 'bg-danger',
};

// Continuous-update indicator: shows the DLT-NN engine's server-side job status
// (backend/dlt/service.py), polled once a second. `pct` is null while live-capturing
// since there is no fixed end time to measure progress against.
export default function ProgressBar({ status }) {
  if (!status || status.status === 'idle') return null;

  const pct = status.progress?.pct;
  const label = STATUS_LABEL[status.status] || status.status;
  const color = STATUS_COLOR[status.status] || 'bg-primary';

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text uppercase tracking-wide">{label}</span>
        {typeof pct === 'number' && (
          <span className="text-sm text-textSecondary">{pct}%</span>
        )}
      </div>
      <div className="w-full h-2 rounded-full bg-background overflow-hidden">
        {typeof pct === 'number' ? (
          <div
            className={`h-full ${color} transition-all duration-300 ease-out rounded-full`}
            style={{ width: `${pct}%` }}
          />
        ) : (
          <div className={`h-full w-1/3 ${color} rounded-full animate-pulse`} />
        )}
      </div>
      {status.message && (
        <p className="text-xs text-textSecondary mt-2">{status.message}</p>
      )}
      {status.status === 'capturing' && (
        <p className="text-xs text-textSecondary mt-1">
          Capture time: {status.capture?.seconds ?? 0}s
        </p>
      )}
      {status.error && (
        <p className="text-xs text-danger mt-2">{status.error}</p>
      )}
    </div>
  );
}
