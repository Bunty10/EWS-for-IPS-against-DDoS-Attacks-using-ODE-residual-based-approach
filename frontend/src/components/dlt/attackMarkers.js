// Shared helpers for attack-phase markers and pre-attack alert timing.
//
// A per-second traffic row (from dlt/pipeline.run_test_only) looks like:
//   { second, FlowPackets_s, FlowBytes_s, FlowDuration, Label, Warning, score, ... }
// where Label is "BENIGN" | "DDoS" and Warning is "BENIGN" | "LOW" | "MED" | "HIGH".

/**
 * Derive the attack window from the ground-truth Label column:
 *   - attackStart: first second with Label === "DDoS"
 *   - attackEnd:   last second with Label === "DDoS"
 *   - attackPeak:  the DDoS second with the largest FlowPackets_s (peak intensity)
 * All values are second-offsets (numbers), or null when there is no DDoS second.
 */
export function computeAttackMarkers(data) {
  const empty = {
    hasAttack: false,
    attackStart: null,
    attackEnd: null,
    attackPeak: null,
    peakValue: null,
  };
  if (!Array.isArray(data) || data.length === 0) return empty;

  let attackStart = null;
  let attackEnd = null;
  let attackPeak = null;
  let peakValue = -Infinity;

  for (const row of data) {
    if (!row || row.Label !== 'DDoS') continue;
    const sec = Number(row.second);
    if (!Number.isFinite(sec)) continue;

    if (attackStart === null || sec < attackStart) attackStart = sec;
    if (attackEnd === null || sec > attackEnd) attackEnd = sec;

    const pkts = Number(row.FlowPackets_s ?? 0);
    if (Number.isFinite(pkts) && pkts > peakValue) {
      peakValue = pkts;
      attackPeak = sec;
    }
  }

  if (attackStart === null) return empty;
  return {
    hasAttack: true,
    attackStart,
    attackEnd,
    attackPeak,
    peakValue: Number.isFinite(peakValue) ? peakValue : null,
  };
}

/**
 * Early-warning quality relative to the attack window. An "alert" is any second
 * whose Warning is not "BENIGN" (LOW/MED/HIGH all count).
 *   - firstAlert:        earliest alert second
 *   - totalAlerts:       number of alert seconds
 *   - alertsBeforeStart: alert seconds strictly before attackStart
 *   - alertsBeforePeak:  alert seconds strictly before attackPeak
 *   - leadToStart:       attackStart - firstAlert (seconds of early warning)
 *   - leadToPeak:        attackPeak  - firstAlert
 * Any field is null when it can't be computed (no alerts, or no attack window).
 */
export const ALERT_LEVELS = ['LOW', 'MED', 'HIGH'];

/**
 * First and last alert second per level, computed from whatever rows are present
 * right now. During progressive upload playback `data` grows each poll, so the
 * "last" values advance step-by-step instead of jumping straight to the final
 * value the backend computed over the whole file.
 * Returns { first: {LOW,MED,HIGH}, last: {LOW,MED,HIGH} } (nulls when absent).
 */
export function computeFirstLastAlerts(data) {
  const first = { LOW: null, MED: null, HIGH: null };
  const last = { LOW: null, MED: null, HIGH: null };
  for (const row of Array.isArray(data) ? data : []) {
    const lvl = row?.Warning;
    if (lvl === 'LOW' || lvl === 'MED' || lvl === 'HIGH') {
      const sec = Number(row.second);
      if (!Number.isFinite(sec)) continue;
      if (first[lvl] === null || sec < first[lvl]) first[lvl] = sec;
      if (last[lvl] === null || sec > last[lvl]) last[lvl] = sec;
    }
  }
  return { first, last };
}

/**
 * Every alert second as { second, level } (Warning !== "BENIGN"), sorted by
 * second. Used to draw full-height vertical alert lines on the traffic charts.
 */
export function getAlertPoints(data) {
  const points = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (row && row.Warning && row.Warning !== 'BENIGN') {
      const sec = Number(row.second);
      if (Number.isFinite(sec)) points.push({ second: sec, level: row.Warning });
    }
  }
  points.sort((a, b) => a.second - b.second);
  return points;
}

const SEVERITY_RANK = { LOW: 1, MED: 2, HIGH: 3 };

/**
 * Alert lines downsampled for large datasets. The x-range [0, maxSeconds] is
 * split into at most `maxLines` buckets; each bucket that contains alerts yields
 * ONE line at its highest-severity alert (so a 9000-second capture draws ~200
 * lines instead of thousands). `levels` optionally restricts to some severities.
 * Returns [{ second, level }].
 */
export function getAlertLinesDownsampled(data, { maxSeconds, maxLines = 220, levels = null } = {}) {
  const rows = Array.isArray(data) ? data : [];
  const denom = Math.max(1, Number(maxSeconds) || 0);
  const bins = Math.max(1, Math.min(maxLines, denom));
  const buckets = new Map(); // binIndex -> { second, level, rank }
  for (const row of rows) {
    const lvl = row?.Warning;
    if (!SEVERITY_RANK[lvl]) continue;
    if (levels && !levels.includes(lvl)) continue;
    const sec = Number(row.second);
    if (!Number.isFinite(sec)) continue;
    const bi = Math.min(bins - 1, Math.floor((sec / denom) * bins));
    const cur = buckets.get(bi);
    const rank = SEVERITY_RANK[lvl];
    if (!cur || rank > cur.rank) buckets.set(bi, { second: sec, level: lvl, rank });
  }
  return Array.from(buckets.values());
}

/**
 * General confusion matrix + alert accounting over the seconds selected by the
 * `inRange(second)` predicate. Positive prediction = an alert fired
 * (Warning !== "BENIGN"); positive truth = Label === "DDoS".
 *
 * Returns { hasPhase, phaseSeconds, ddosSeconds, benignSeconds, tp, fp, fn, tn,
 * precision, precisionBenign, falsePositiveRate, specificity, sensitivity,
 * balancedAccuracy, accuracyAttack, accuracyNormal, alertRate,
 * alerts:{ALL,LOW,MED,HIGH}, alertsOnDDoS:{...}, alertsOnBenign:{...} }.
 * Used for the Attack-phase, Normal-phase and Till-peak matrices; each card picks
 * the subset of metrics relevant to its phase.
 */
export function computeConfusion(traffic, inRange) {
  const rows = Array.isArray(traffic) ? traffic : [];
  let tp = 0, fp = 0, fn = 0, tn = 0, phaseSeconds = 0, ddosSeconds = 0, benignSeconds = 0;
  const alerts = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };
  const alertsOnDDoS = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };
  const alertsOnBenign = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };

  for (const row of rows) {
    const sec = Number(row?.second);
    if (!Number.isFinite(sec) || !inRange(sec)) continue;
    phaseSeconds += 1;

    const isAttack = row.Label === 'DDoS';
    if (isAttack) ddosSeconds += 1; else benignSeconds += 1;

    const level = row.Warning;
    const isAlert = level && level !== 'BENIGN';
    if (isAlert) {
      alerts.ALL += 1;
      if (alerts[level] !== undefined) alerts[level] += 1;
      const bucket = isAttack ? alertsOnDDoS : alertsOnBenign;
      bucket.ALL += 1;
      if (bucket[level] !== undefined) bucket[level] += 1;
    }

    if (isAttack && isAlert) tp += 1;
    else if (isAttack && !isAlert) fn += 1;
    else if (!isAttack && isAlert) fp += 1;
    else tn += 1;
  }

  const safeDiv = (a, b) => (b > 0 ? a / b : null);
  const specificity = safeDiv(tn, tn + fp);   // TN / (TN + FP)  — true-negative rate
  const sensitivity = safeDiv(tp, tp + fn);   // TP / (TP + FN)  — recall / TPR
  return {
    hasPhase: phaseSeconds > 0,
    phaseSeconds, ddosSeconds, benignSeconds,
    tp, fp, fn, tn,
    precision: safeDiv(tp, tp + fp),           // TP / (TP + FP)  — alert → DDoS
    precisionBenign: safeDiv(tn, tn + fn),     // TN / (TN + FN)  — no alert → BENIGN
    falsePositiveRate: safeDiv(fp, fp + tn),   // FP / (FP + TN)
    specificity,
    sensitivity,
    // Accuracy over the displayed TP/FP/TN cells (FN excluded), per the
    // Attack-phase spec: (TP + TN) / (TP + FP + TN).
    accuracyAttack: safeDiv(tp + tn, tp + fp + tn),
    // Normal-phase accuracy — no DDoS present, so TN / (FP + TN).
    accuracyNormal: safeDiv(tn, fp + tn),
    // Alert rate over benign traffic in the phase: FP / total benign seconds.
    alertRate: safeDiv(fp, fp + tn),
    // Balanced accuracy = (Sensitivity + Specificity) / 2 (null if either missing).
    balancedAccuracy:
      sensitivity === null || specificity === null ? null : (sensitivity + specificity) / 2,
    alerts, alertsOnDDoS, alertsOnBenign,
  };
}

/**
 * Confusion matrix and alert accounting restricted to the attack phase
 * (seconds in [attackStart, attackEnd] inclusive). Positive prediction = an
 * alert fired (Warning !== "BENIGN"); positive truth = Label === "DDoS".
 *
 * Returns { hasPhase, phaseSeconds, tp, fp, fn, tn, detectionRate, precision,
 * falsePositiveRate, accuracy, alerts: {ALL,LOW,MED,HIGH},
 * alertsOnDDoS: {ALL,LOW,MED,HIGH} }.
 */
export function computeAttackPhaseStats(data, attackStart, attackEnd) {
  const empty = {
    hasPhase: false,
    phaseSeconds: 0,
    tp: 0, fp: 0, fn: 0, tn: 0,
    detectionRate: null, precision: null, falsePositiveRate: null, accuracy: null,
    alerts: { ALL: 0, LOW: 0, MED: 0, HIGH: 0 },
    alertsOnDDoS: { ALL: 0, LOW: 0, MED: 0, HIGH: 0 },
  };
  const rows = Array.isArray(data) ? data : [];
  if (attackStart === null || attackStart === undefined || attackEnd === null || attackEnd === undefined) {
    return empty;
  }

  let tp = 0, fp = 0, fn = 0, tn = 0, phaseSeconds = 0;
  const alerts = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };
  const alertsOnDDoS = { ALL: 0, LOW: 0, MED: 0, HIGH: 0 };

  for (const row of rows) {
    const sec = Number(row?.second);
    if (!Number.isFinite(sec) || sec < attackStart || sec > attackEnd) continue;
    phaseSeconds += 1;

    const isAttack = row.Label === 'DDoS';
    const level = row.Warning;
    const isAlert = level && level !== 'BENIGN';

    if (isAlert) {
      alerts.ALL += 1;
      if (alerts[level] !== undefined) alerts[level] += 1;
      if (isAttack) {
        alertsOnDDoS.ALL += 1;
        if (alertsOnDDoS[level] !== undefined) alertsOnDDoS[level] += 1;
      }
    }

    if (isAttack && isAlert) tp += 1;
    else if (isAttack && !isAlert) fn += 1;
    else if (!isAttack && isAlert) fp += 1;
    else tn += 1;
  }

  const safeDiv = (a, b) => (b > 0 ? a / b : null);
  return {
    hasPhase: phaseSeconds > 0,
    phaseSeconds,
    tp, fp, fn, tn,
    detectionRate: safeDiv(tp, tp + fn),        // recall on DDoS seconds
    precision: safeDiv(tp, tp + fp),
    falsePositiveRate: safeDiv(fp, fp + tn),
    accuracy: safeDiv(tp + tn, phaseSeconds),
    alerts,
    alertsOnDDoS,
  };
}

export function computeAlertTiming(data, attackStart, attackPeak) {
  const alertSeconds = [];
  for (const row of Array.isArray(data) ? data : []) {
    if (row && row.Warning && row.Warning !== 'BENIGN') {
      const sec = Number(row.second);
      if (Number.isFinite(sec)) alertSeconds.push(sec);
    }
  }

  const firstAlert = alertSeconds.length ? Math.min(...alertSeconds) : null;
  const hasStart = attackStart !== null && attackStart !== undefined;
  const hasPeak = attackPeak !== null && attackPeak !== undefined;

  return {
    firstAlert,
    totalAlerts: alertSeconds.length,
    alertsBeforeStart: hasStart ? alertSeconds.filter((s) => s < attackStart).length : null,
    alertsBeforePeak: hasPeak ? alertSeconds.filter((s) => s < attackPeak).length : null,
    leadToStart: firstAlert !== null && hasStart ? attackStart - firstAlert : null,
    leadToPeak: firstAlert !== null && hasPeak ? attackPeak - firstAlert : null,
  };
}
