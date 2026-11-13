// Threat-level color system for the redesigned GUI.
//
// Per the product spec the severity ramp is:
//   Green  = Low
//   Orange = Medium
//   Red    = High
// (BENIGN/none is neutral gray.) These are used by badges, cards, table rows,
// the topology view, and as concrete hex strings for Recharts (which can't read
// Tailwind classes).

export const THREAT = {
  BENIGN: {
    label: 'Normal',
    hex: '#64748b',
    // Tailwind utility bundles (chip + soft background) that work in both themes.
    chip: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    dot: 'bg-slate-400',
    soft: 'bg-slate-500/5',
  },
  LOW: {
    label: 'Low',
    hex: '#22c55e',
    chip: 'bg-green-500/15 text-green-500 border-green-500/30',
    dot: 'bg-green-500',
    soft: 'bg-green-500/5',
  },
  MED: {
    label: 'Medium',
    hex: '#f59e0b',
    chip: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
    dot: 'bg-amber-500',
    soft: 'bg-amber-500/5',
  },
  HIGH: {
    label: 'High',
    hex: '#ef4444',
    chip: 'bg-red-500/15 text-red-500 border-red-500/30',
    dot: 'bg-red-500',
    soft: 'bg-red-500/5',
  },
};

export function threat(level) {
  return THREAT[(level || 'BENIGN').toUpperCase()] || THREAT.BENIGN;
}
