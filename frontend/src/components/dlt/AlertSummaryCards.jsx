import React, { useMemo } from 'react';
import { computeAlertTiming, computeFirstLastAlerts } from './attackMarkers';

function StatTile({ label, value, accent }) {
  return (
    <div className="bg-background rounded-lg p-4 border border-border">
      <div className="text-xs text-textSecondary uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular ${accent || 'text-text'}`}>{value}</div>
    </div>
  );
}

const fmtSec = (v) => (v === null || v === undefined ? '—' : `${v}s`);
const fmtCount = (v) => (v === null || v === undefined ? '—' : `${v}`);

// First/latest alert times (computed live from the currently-revealed rows, so
// "Latest" advances step-by-step during progressive playback), optional
// early-warning timing relative to the attack window, and per-level counts.
//
// `showTiming` (default true) hides the Early-Warning Timing card — used for
// live capture, where there is no ground-truth attack window to compare against.
export default function AlertSummaryCards({
  traffic, attackStart, attackPeak, showTiming = true,
}) {
  const { first, last } = useMemo(() => computeFirstLastAlerts(traffic), [traffic]);
  const timing = useMemo(
    () => computeAlertTiming(traffic, attackStart, attackPeak),
    [traffic, attackStart, attackPeak]
  );

  // Warning counts computed from the currently-revealed rows (not the backend's
  // whole-file `warnings`), so they advance second-by-second during progressive
  // playback — matching how the "Latest Alert" card updates instead of jumping.
  const counts = useMemo(() => {
    const c = { BENIGN: 0, LOW: 0, MED: 0, HIGH: 0 };
    for (const row of Array.isArray(traffic) ? traffic : []) {
      const w = row?.Warning;
      if (c[w] !== undefined) c[w] += 1;
    }
    return c;
  }, [traffic]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* First Alert Generated */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">First Alert Generated</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Low" value={fmtSec(first.LOW)} accent="text-accent" />
          <StatTile label="Medium" value={fmtSec(first.MED)} accent="text-[#FF8B00]" />
          <StatTile label="High" value={fmtSec(first.HIGH)} accent="text-danger" />
        </div>
      </div>

      {/* Latest Alert (advances step-by-step as rows reveal) */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-primary mb-4">Latest Alert</h3>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Low" value={fmtSec(last.LOW)} accent="text-accent" />
          <StatTile label="Medium" value={fmtSec(last.MED)} accent="text-[#FF8B00]" />
          <StatTile label="High" value={fmtSec(last.HIGH)} accent="text-danger" />
        </div>
      </div>

      {/* Early-warning timing vs the attack window (upload mode only) */}
      {showTiming && (
        <div className="bg-surface border border-border rounded-xl p-6 md:col-span-2">
          <h3 className="text-lg font-semibold text-primary mb-1">Early-Warning Timing</h3>
          <p className="text-sm text-textSecondary mb-4">
            Info of number of alerts generated before start of the attack and peak of the
            attacks, and the time difference between the first alert and the start/peak of
            the attack.
          </p>

          {timing.firstAlert === null && (
            <p className="text-sm text-textSecondary mb-4">No alerts were generated for this capture.</p>
          )}
          {attackStart === null && (
            <p className="text-sm text-textSecondary mb-4">No DDoS-labelled seconds found, so there is no attack window to compare against.</p>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Alerts before attack start" value={fmtCount(timing.alertsBeforeStart)} accent="text-secondary" />
            <StatTile label="Alerts before attack peak" value={fmtCount(timing.alertsBeforePeak)} accent="text-secondary" />
            <StatTile label="First alert → attack start" value={fmtSec(timing.leadToStart)} accent="text-accent" />
            <StatTile label="First alert → attack peak" value={fmtSec(timing.leadToPeak)} accent="text-accent" />
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-textSecondary">
            <span>First alert: <span className="text-text font-semibold">{fmtSec(timing.firstAlert)}</span></span>
            <span>Attack start: <span className="text-text font-semibold">{fmtSec(attackStart)}</span></span>
            <span>Attack peak: <span className="text-text font-semibold">{fmtSec(attackPeak)}</span></span>
            <span>Total alert seconds: <span className="text-text font-semibold">{fmtCount(timing.totalAlerts)}</span></span>
          </div>
        </div>
      )}

      {/* Warning Counts */}
      <div className="bg-surface border border-border rounded-xl p-6 md:col-span-2">
        <h3 className="text-lg font-semibold text-primary mb-4">Warning Counts (seconds)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatTile label="Benign" value={counts.BENIGN} accent="text-secondary" />
          <StatTile label="Low" value={counts.LOW} accent="text-accent" />
          <StatTile label="Medium" value={counts.MED} accent="text-[#FF8B00]" />
          <StatTile label="High" value={counts.HIGH} accent="text-danger" />
        </div>
      </div>
    </div>
  );
}
