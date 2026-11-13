import React from 'react';

// Shared sub-section controls used by the CSV-analysis and live-capture result
// views: a horizontal tab bar and a segmented (single-select) toggle. Keeping them
// here means both pages render identical tabs and Packets/s|Bytes/s|Duration and
// Low|Medium|High switchers.

// Metric options for the consolidated Traffic-flow chart.
export const TRAFFIC_METRICS = [
  { key: 'FlowPackets_s', short: 'Packets/s', label: 'Flow Packets/s' },
  { key: 'FlowBytes_s', short: 'Bytes/s', label: 'Flow Bytes/s' },
  { key: 'FlowDuration', short: 'Duration', label: 'Flow Duration' },
];

// Level options for the Alerts sub-section (mirrors the Traffic metric toggle).
export const ALERT_LEVELS = [
  { key: 'LOW', short: 'Low', label: 'Low alerts with benign' },
  { key: 'MED', short: 'Medium', label: 'Medium alerts with benign' },
  { key: 'HIGH', short: 'High', label: 'High alerts with benign' },
];

// Horizontal tab bar; the active tab gets a filled pill, the rest are plain.
export function TabNav({ tabs, active, onChange }) {
  return (
    <div className="flex items-center gap-1 border-b border-border mb-8 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`px-4 py-2 -mb-px text-sm font-medium rounded-t-lg border-b-2 transition-colors duration-200 whitespace-nowrap ${
              isActive
                ? 'text-primary border-primary bg-surface/60'
                : 'text-textSecondary border-transparent hover:text-text hover:bg-surface/40'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// Segmented single-select control (e.g. metric or alert-level switcher).
export function SegmentedToggle({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-background p-1">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors duration-200 ${
            value === o.key ? 'bg-primary/15 text-primary' : 'text-textSecondary hover:text-text'
          }`}
        >
          {o.short}
        </button>
      ))}
    </div>
  );
}
