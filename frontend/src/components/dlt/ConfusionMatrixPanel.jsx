import React, { useMemo } from 'react';
import { computeConfusion, computeAlertTiming } from './attackMarkers';

// Three attack-relative confusion matrices, all sharing one layout/palette:
//   • Attack Phase — seconds in [start, end]
//   • Normal Phase — seconds OUTSIDE [start, end] (before start + after end)
//   • Till Peak    — seconds from the start of the capture up to the peak (<= peak)
// Positive prediction = an alert fired (Warning != BENIGN); positive truth =
// Label == DDoS. These matrices are scoped to TP / FP / TN; the FN cell is denoted
// as 0 (not "excluded"). Each card also shows per-level alert counts and a
// phase-specific correspondence (on DDoS, or before the start of the attack).

const fmt3 = (v) => (v === null || v === undefined ? '—' : v.toFixed(3));

function Cell({ value, max, kind }) {
  const t = max > 0 ? value / max : 0;
  const rgb = kind === 'good' ? '54,179,126' : '255,93,82'; // green correct / red error
  return (
    <td className="p-3 text-center font-mono rounded-lg border border-border"
        style={{ background: `rgba(${rgb}, ${0.08 + t * 0.35})` }}>
      <span className="text-text font-semibold">{value}</span>
    </td>
  );
}

function Metric({ label, value }) {
  return (
    <div className="bg-background border border-border rounded-lg px-3 py-2">
      <div className="text-[11px] text-textSecondary uppercase tracking-wide">{label}</div>
      <div className="text-lg font-bold font-mono text-text">{value}</div>
    </div>
  );
}

function AlertCountTile({ label, count, correspondLabel, correspondCount, accent }) {
  return (
    <div className="bg-background border border-border rounded-lg p-3">
      <div className="text-[11px] text-textSecondary uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-2xl font-bold tabular ${accent}`}>{count}</div>
      <div className="text-[11px] text-textSecondary mt-1">
        {correspondLabel}: <span className="text-text font-semibold">{correspondCount}</span>
      </div>
    </div>
  );
}

// One matrix card, styled identically for every phase. Each phase passes its own
// `metrics` list ([{ label, value }]), a `correspond` breakdown ({ALL,LOW,MED,HIGH})
// for the per-level alert tiles, a `correspondLabel` (short caption under each tile),
// and a `correspondHeading` (the clause after "Alerts generated in this phase").
// `beforeStart` (when provided) adds a highlighted early-warning tile.
function PhaseMatrixCard({
  title, description, stats, metrics, correspond, correspondLabel, correspondHeading, beforeStart,
}) {
  const max = Math.max(1, stats.tp, stats.fp, stats.tn);

  return (
    <div className="bg-surface border border-border rounded-xl p-6 mb-8">
      <h3 className="text-lg font-semibold text-primary mb-1">{title}</h3>
      <p className="text-sm text-textSecondary mb-6">{description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Matrix — TP / FP / TN, with FN denoted as 0 */}
        <div>
          <table className="w-full border-separate" style={{ borderSpacing: '6px' }}>
            <thead>
              <tr>
                <th className="p-2" />
                <th className="p-2 text-textSecondary font-medium text-sm">Actual DDoS</th>
                <th className="p-2 text-textSecondary font-medium text-sm">Actual Benign</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-2 text-textSecondary font-medium text-sm whitespace-nowrap">Alert fired</td>
                <Cell value={stats.tp} max={max} kind="good" />
                <Cell value={stats.fp} max={max} kind="bad" />
              </tr>
              <tr>
                <td className="p-2 text-textSecondary font-medium text-sm whitespace-nowrap">No alert</td>
                <Cell value={0} max={max} kind="good" />
                <Cell value={stats.tn} max={max} kind="good" />
              </tr>
            </tbody>
          </table>
          <div className="mt-2 text-[11px] text-textSecondary">
            TP {stats.tp} · FP {stats.fp} · TN {stats.tn} · FN 0
          </div>
        </div>

        {/* Metrics — chosen per phase */}
        <div className="grid grid-cols-2 gap-3 content-start">
          {metrics.map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} />
          ))}
        </div>
      </div>

      {/* Per-level alerts, and the phase-specific correspondence */}
      <div className="mt-6">
        <h4 className="text-sm font-semibold text-text mb-3">
          Alerts generated in this phase
          <span className="text-textSecondary font-normal"> — {correspondHeading}</span>
        </h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <AlertCountTile label="All alerts" count={stats.alerts.ALL} correspondLabel={correspondLabel} correspondCount={correspond.ALL} accent="text-primary" />
          <AlertCountTile label="Low" count={stats.alerts.LOW} correspondLabel={correspondLabel} correspondCount={correspond.LOW} accent="text-accent" />
          <AlertCountTile label="Medium" count={stats.alerts.MED} correspondLabel={correspondLabel} correspondCount={correspond.MED} accent="text-[#FF8B00]" />
          <AlertCountTile label="High" count={stats.alerts.HIGH} correspondLabel={correspondLabel} correspondCount={correspond.HIGH} accent="text-danger" />
        </div>

        {/* Normal-phase early-warning highlight: alerts that fired before attack start. */}
        {beforeStart != null && (
          <div className="mt-3 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3">
            <span className="text-2xl font-bold tabular text-accent">{beforeStart}</span>
            <span className="text-sm text-textSecondary">
              of the <span className="text-text font-semibold">{stats.alerts.ALL}</span> alerts here fired{' '}
              <span className="text-text font-semibold">before the attack started</span> — possible early warnings.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const RangeMono = ({ children }) => <span className="font-mono text-text">{children}</span>;

export default function ConfusionMatrixPanel({ traffic, markers }) {
  const start = markers?.attackStart ?? null;
  const end = markers?.attackEnd ?? null;
  const peak = markers?.attackPeak ?? null;

  const attack = useMemo(
    () => computeConfusion(traffic, (s) => s >= start && s <= end),
    [traffic, start, end]
  );
  const normal = useMemo(
    () => computeConfusion(traffic, (s) => s < start || s > end),
    [traffic, start, end]
  );
  const tillPeak = useMemo(
    () => computeConfusion(traffic, (s) => s <= peak),
    [traffic, peak]
  );

  // Alerts that fired strictly before the attack started (subset of the Normal phase),
  // both as a total and broken down per level for the Normal-phase alert tiles.
  const alertsBeforeStart = useMemo(
    () => computeAlertTiming(traffic, start, peak).alertsBeforeStart ?? 0,
    [traffic, start, peak]
  );
  const beforeStartByLevel = useMemo(() => {
    const c = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };
    for (const row of Array.isArray(traffic) ? traffic : []) {
      const sec = Number(row?.second);
      if (!Number.isFinite(sec) || start === null || sec >= start) continue;
      const lvl = row?.Warning;
      if (lvl && lvl !== 'BENIGN') {
        c.ALL += 1;
        if (c[lvl] !== undefined) c[lvl] += 1;
      }
    }
    return c;
  }, [traffic, start]);

  // Small null-safe divide for the phase-specific metric formulas below.
  const div = (a, b) => (b > 0 ? a / b : null);

  // Per-phase metric sets. Each phase shows only the metrics defined for it.
  const attackMetrics = [
    { label: 'Precision (alert → DDoS)', value: fmt3(attack.precision) },
    { label: 'False positive rate', value: fmt3(attack.falsePositiveRate) },
    { label: 'Accuracy (TP+TN)/(TP+FP+TN)', value: fmt3(attack.accuracyAttack) },
    { label: 'Specificity (benign)', value: fmt3(attack.specificity) },
  ];
  // Normal phase: precision = TN / BENIGN (all seconds here are benign); Alert rate.
  const normalMetrics = [
    { label: 'Precision (TN / BENIGN)', value: fmt3(div(normal.tn, normal.benignSeconds)) },
    { label: 'Alert rate (FP / benign)', value: fmt3(normal.alertRate) },
  ];
  // Till Peak: FN is taken as 0, so Sensitivity = TP/(TP+0) = 1 (when TP > 0) and
  // Balanced accuracy = (Sensitivity + Specificity) / 2.
  const tillSensFN0 = tillPeak.tp > 0 ? 1 : null;
  const tillBalancedFN0 =
    tillSensFN0 !== null && tillPeak.specificity !== null
      ? (tillSensFN0 + tillPeak.specificity) / 2
      : null;
  const tillPeakMetrics = [
    { label: 'Precision (alert → DDoS)', value: fmt3(tillPeak.precision) },
    { label: 'False positive rate', value: fmt3(tillPeak.falsePositiveRate) },
    { label: 'Specificity (benign)', value: fmt3(tillPeak.specificity) },
    { label: 'Balanced accuracy (FN=0)', value: fmt3(tillBalancedFN0) },
  ];

  if (!markers?.hasAttack) {
    return (
      <div className="bg-surface border border-border rounded-xl p-6 mb-8">
        <h3 className="text-lg font-semibold text-primary mb-1">Confusion Matrices</h3>
        <p className="text-sm text-textSecondary">
          No DDoS-labelled attack phase was found in this capture, so there is no
          attack window to evaluate detection against.
        </p>
      </div>
    );
  }

  return (
    <>
      <PhaseMatrixCard
        title="Confusion Matrix — Attack Phase"
        stats={attack}
        metrics={attackMetrics}
        correspond={attack.alertsOnDDoS}
        correspondLabel="on DDoS"
        correspondHeading="and how many correspond to actual DDoS seconds"
        description={(
          <>
            Over the attack window (<RangeMono>{start}s</RangeMono>–<RangeMono>{end}s</RangeMono>,
            {' '}<RangeMono>{attack.phaseSeconds}</RangeMono> seconds). Scoped to alerts fired
            (correct on DDoS = TP, wrong on benign = FP) versus actual-benign traffic (FP vs TN).
            Missed DDoS seconds (FN) are denoted as 0.
          </>
        )}
      />

      <PhaseMatrixCard
        title="Confusion Matrix — Normal Phase"
        stats={normal}
        metrics={normalMetrics}
        correspond={beforeStartByLevel}
        correspondLabel="before start"
        correspondHeading="and how many fired before the start of the attack"
        beforeStart={alertsBeforeStart}
        description={(
          <>
            Traffic OUTSIDE the attack window — before <RangeMono>{start}s</RangeMono> and after
            {' '}<RangeMono>{end}s</RangeMono> (<RangeMono>{normal.phaseSeconds}</RangeMono> seconds,
            all benign). Shows how alerts fire when no attack is present: every alert here is a false
            positive (FP), non-alerts are true negatives (TN). Precision is measured as TN / BENIGN
            (the share of benign seconds correctly left un-alerted), and the alert tiles below count
            how many alerts fired before the attack started.
          </>
        )}
      />

      <PhaseMatrixCard
        title="Confusion Matrix — Till Peak of Attack"
        stats={tillPeak}
        metrics={tillPeakMetrics}
        correspond={tillPeak.alertsOnDDoS}
        correspondLabel="on DDoS"
        correspondHeading="and how many correspond to actual DDoS seconds"
        description={(
          <>
            From the start of the capture up to the attack peak
            (<RangeMono>0s</RangeMono>–<RangeMono>{peak}s</RangeMono>,
            {' '}<RangeMono>{tillPeak.phaseSeconds}</RangeMono> seconds). Shows how alerts build up
            before the peak — a mix of benign traffic and the rising attack (start
            {' '}<RangeMono>{start}s</RangeMono> → peak <RangeMono>{peak}s</RangeMono>).
          </>
        )}
      />
    </>
  );
}
