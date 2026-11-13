import { threat } from '../../theme/threatColors';

// Color-coded severity pill (Green=Low, Orange=Medium, Red=High, gray=Normal).
export default function ThreatBadge({ level, className = '' }) {
  const t = threat(level);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${t.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden="true" />
      {t.label}
    </span>
  );
}
