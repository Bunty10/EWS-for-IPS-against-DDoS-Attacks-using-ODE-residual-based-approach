import { useState, useEffect, useCallback, useRef } from "react";
import {LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, 
  Scatter, ComposedChart, ReferenceLine } from "recharts";

const DATASET_TRAIN = "train";
const DATASET_TEST1 = "test1";
const DATASET_TEST2 = "test2";

const TAB_OVERVIEW = "overview";
const TAB_GRAPHS = "graphs";
const TAB_CONFUSION = "confusion";
const TAB_INTERPOLATION = "interpolation";
const TAB_THRESHOLDS = "thresholds";

// Blues colormap (0 = white, 1 = dark blue) for confusion matrix
function bluesColor(t) {
  const r = Math.round(247 - t * (247 - 8));
  const g = Math.round(251 - t * (251 - 69));
  const b = Math.round(255 - t * (255 - 107));
  return `rgb(${r},${g},${b})`;
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch (_) {}
}

function Results({ results, fetchResults }) {
  const normalized =
    results && typeof results === "object"
      ? results.test1 !== undefined
        ? results
        : results.traffic_data || results.first_low || results.first_med || results.first_high !== undefined
          ? { train: null, test1: results, test2: null }
          : { train: results.train ?? null, test1: results.test1 ?? null, test2: results.test2 ?? null }
      : null;

  const hasTrain = normalized?.train && (normalized.train.traffic_data?.length > 0 || normalized.train.thresholds);
  const [dataset, setDataset] = useState(hasTrain ? DATASET_TRAIN : DATASET_TEST1);
  const [activeTab, setActiveTab] = useState(hasTrain ? TAB_THRESHOLDS : TAB_OVERVIEW);
  useEffect(() => {
    const ht = normalized?.train && (normalized.train.traffic_data?.length > 0 || normalized.train.thresholds);
    if (normalized && !ht && normalized.test1) {
      setDataset(DATASET_TEST1);
      setActiveTab(TAB_OVERVIEW);
    }
  }, [normalized]);
  const [confusionVisible, setConfusionVisible] = useState(false);
  const [graphSecond, setGraphSecond] = useState(0);
  const [graphPlaying, setGraphPlaying] = useState(false);
  const [currentGraphIndex, setCurrentGraphIndex] = useState(0);
  const graphSpeed = 40;

  const isLegacy = normalized && !normalized.train && (normalized.test1?.traffic_data || normalized.test1?.thresholds);
  const trainData =
    normalized?.train ??
    (isLegacy && normalized?.test1?.thresholds
      ? {
          thresholds: normalized.test1.thresholds,
          per_feature_thresholds: normalized.test1.per_feature_thresholds,
          residual_stats: normalized.test1.residual_stats,
          data_after_interpolation: normalized.test1.data_after_interpolation,
          traffic_data: [],
          max_seconds: normalized.test1.max_seconds ?? 0,
        }
      : null);
  const test1Data = normalized?.test1 ?? (isLegacy ? normalized : null);
  const test2Data = normalized?.test2 ?? null;

  const isTrain = dataset === DATASET_TRAIN;
  const current = isTrain ? trainData : dataset === DATASET_TEST1 ? test1Data : test2Data;

  const graphTitles = isTrain
    ? ["1. TRAIN — FlowPackets/s vs Seconds", "2. TRAIN — FlowBytes/s vs Seconds", "3. TRAIN — FlowDuration vs Seconds"]
    : [
        "1. TEST — FlowPackets/s vs Seconds (Label)",
        "2. TEST — FlowBytes/s vs Seconds (Label)",
        "3. TEST — FlowDuration vs Seconds (Label)",
        "4. FlowPackets/s — LOW Alerts",
        "5. FlowPackets/s — MEDIUM Alerts",
        "6. FlowPackets/s — HIGH Alerts",
        "7. FlowPackets/s — LOW / MEDIUM / HIGH Alerts",
      ];
  useEffect(() => {
    if (currentGraphIndex >= graphTitles.length && graphTitles.length > 0)
      setCurrentGraphIndex(graphTitles.length - 1);
  }, [dataset, graphTitles.length, currentGraphIndex]);
  const maxSeconds = current?.max_seconds ?? 0;
  const trafficData = current?.traffic_data ?? [];
  const visibleData = trafficData.filter((d) => d.second <= graphSecond);

  const alertedSecondsRef = useRef(new Set());
  useEffect(() => {
    if (!graphPlaying || !trafficData.length) return;
    const d = trafficData.find((x) => x.second === graphSecond && ["LOW", "MED", "HIGH"].includes(x.Warning));
    if (d && !alertedSecondsRef.current.has(graphSecond)) {
      alertedSecondsRef.current.add(graphSecond);
      playAlertSound();
    }
  }, [graphPlaying, graphSecond, trafficData]);

  useEffect(() => {
    if (!graphPlaying || graphSecond >= maxSeconds) {
      if (graphSecond >= maxSeconds) setGraphPlaying(false);
      return;
    }
    const t = setInterval(() => setGraphSecond((s) => Math.min(s + 1, maxSeconds)), graphSpeed);
    return () => clearInterval(t);
  }, [graphPlaying, graphSecond, maxSeconds, graphSpeed]);

  const playGraph = useCallback(() => {
    alertedSecondsRef.current.clear();
    setGraphSecond(0);
    setGraphPlaying(true);
  }, []);

  const resetGraph = useCallback(() => {
    setGraphPlaying(false);
    setGraphSecond(maxSeconds);
  }, [maxSeconds]);

  if (!results) {
    return (
      <div style={styles.empty}>
        <h2>No Results Available</h2>
        <p>Upload datasets and run analysis, or fetch existing results.</p>
        <button onClick={fetchResults} style={styles.fetchBtn}>Fetch Results</button>
      </div>
    );
  }

  const datasetTabs = [
    ...(trainData ? [{ id: DATASET_TRAIN, label: "Train" }] : []),
    ...(test1Data ? [{ id: DATASET_TEST1, label: "Test" }] : []),
    ...(test2Data ? [{ id: DATASET_TEST2, label: "Test2" }] : []),
  ];


    const contentTabs = isTrain
    ? [
        { id: TAB_THRESHOLDS, label: "Thresholds" },
        { id: TAB_GRAPHS, label: "Graphs" },
      ]
    : [
        { id: TAB_OVERVIEW, label: "Overview" },
        { id: TAB_GRAPHS, label: "Graphs" },
      ];

  const interpRows = current?.data_after_interpolation ?? [];
  const hasKurtosis = interpRows.length > 0 && interpRows[0] && "Kurtosis" in interpRows[0];

  const patchedData = visibleData.map(d => ({...d,
    benignPackets: d.Label === "BENIGN" ? d.FlowPackets_s : null,
    attackPackets: d.Label === "DDoS" ? d.FlowPackets_s : null,
    benignBytes: d.Label === "BENIGN" ? d.FlowBytes_s : null,
    attackBytes: d.Label === "DDoS" ? d.FlowBytes_s : null,
    benignDuration: d.Label === "BENIGN" ? d.FlowDuration : null,
    attackDuration: d.Label === "DDoS" ? d.FlowDuration : null,
    lowPackets: d.Warning === "LOW" ? d.FlowPackets_s : null,
    medPackets: d.Warning === "MED" ? d.FlowPackets_s : null,
    highPackets: d.Warning === "HIGH" ? d.FlowPackets_s : null,
  }));

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>Detection Results</h2>

      <div style={styles.datasetBar}>
        <span style={styles.datasetLabel}>Dataset:</span>
        {datasetTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setDataset(tab.id);
              setActiveTab(tab.id === DATASET_TRAIN ? TAB_THRESHOLDS : TAB_OVERVIEW);
              setGraphSecond((normalized?.[tab.id] ?? results?.[tab.id])?.max_seconds ?? 0);
              setCurrentGraphIndex(0);
            }}
            style={{ ...styles.datasetTab, ...(dataset === tab.id ? styles.datasetTabActive : {}) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!isTrain && trainData && (
        <p style={styles.thresholdNote}>Thresholds are from the Train dataset. Select Train to view them.</p>
      )}

      <div style={styles.tabBar}>
        {contentTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{ ...styles.tab, ...(activeTab === tab.id ? styles.tabActive : {}) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Only show the "No data" message if there are truly no datasets at all */}
      {!current && activeTab !== TAB_THRESHOLDS && !trainData && !test1Data && !test2Data && (
        <p style={styles.sectionDesc}>No data for this dataset.</p>
      )}
      {!isTrain && activeTab === TAB_OVERVIEW && current && (
        <div style={styles.cardGrid}>
          <div style={styles.card}>
            <h3>First Alert Generated</h3>
            <p><strong>Low Alert:</strong> {current.first_low ?? 0} sec</p>
            <p><strong>Medium Alert:</strong> {current.first_med ?? 0} sec</p>
            <p><strong>High Alert:</strong> {current.first_high ?? 0} sec</p>
            {/* <p><strong>Adaptive θ:</strong> {Number(current.threshold_theta ?? 0).toFixed(6)}</p> */}
          </div>
          <div style={styles.card}>
            <h3>Warning Counts</h3>
            <p>BENIGN: {current.warnings?.BENIGN ?? 0}</p>
            <p>LOW: {current.warnings?.LOW ?? 0}</p>
            <p>MEDIUM: {current.warnings?.MED ?? 0}</p>
            <p>HIGH: {current.warnings?.HIGH ?? 0}</p>
          </div>
        </div>
      )}

      {activeTab === TAB_GRAPHS && current && (
        <div style={styles.graphSection}>
          <h4 style={styles.graphTitle}>Graphs</h4>
          <div style={styles.graphControls}>
            <span>Time: 0s → {graphSecond}s / {maxSeconds}s</span>
            <button onClick={playGraph} disabled={graphPlaying} style={styles.smallBtn}>
              {graphPlaying ? "Playing…" : "Play (0 → end)"}
            </button>
            <button onClick={resetGraph} style={styles.smallBtn}>Show full</button>
          </div>

          {/* TRAIN GRAPHS */}
          {isTrain && (
            <>
              {/* FlowPackets/s */}
              <h5 style={styles.graphTitle}>Train — FlowPackets/s vs Seconds</h5>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <LineChart data={visibleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#3af921" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* FlowBytes/s */}
              <h5 style={styles.graphTitle}>Train — FlowBytes/s vs Seconds</h5>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <LineChart data={visibleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowBytes_s" name="FlowBytes/s" stroke="#3af921" strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* TEST GRAPHS */}
          {!isTrain && (
            <>
              {/* BENIGN vs ATTACK */}
              <h4 style={styles.graphTitle}>Test — FlowPackets/s vs Seconds</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="benignPackets" name="BENIGN" fill="#3af921" />
                    <Scatter data={patchedData} dataKey="attackPackets" name="ATTACK" fill="#f90e0e" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* FlowBytes/s BENIGN vs ATTACK */}
              <h4 style={styles.graphTitle}>Test — FlowBytes/s vs Seconds</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowBytes_s" name="FlowBytes/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="benignBytes" name="BENIGN" fill="#3af921" />
                    <Scatter data={patchedData} dataKey="attackBytes" name="ATTACK" fill="#f90e0e" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* FlowDuration BENIGN vs ATTACK */}
              <h4 style={styles.graphTitle}>Test — FlowDuration vs Seconds</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowDuration" name="FlowDuration" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="benignDuration" name="BENIGN" fill="#3af921" />
                    <Scatter data={patchedData} dataKey="attackDuration" name="ATTACK" fill="#f90e0e" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* LOW Alerts */}
              <h4 style={styles.graphTitle}>Test — LOW Alerts</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="lowPackets" name="LOW ALERTS" fill="#d2cf0b" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* MEDIUM Alerts */}
              <h4 style={styles.graphTitle}>Test — MEDIUM Alerts</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="medPackets" name="MEDIUM ALERTS" fill="#e88d0e" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* HIGH Alerts */}
              <h4 style={styles.graphTitle}>Test — HIGH Alerts</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="highPackets" name="HIGH ALERTS" fill="#940101" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* LOW/MED/HIGH Alerts */}
              <h4 style={styles.graphTitle}>Test — Combined LOW/MEDIUM/HIGH Alerts</h4>
              <div style={styles.chartWrap}>
                <ResponsiveContainer width="100%" height={420}>
                  <ComposedChart data={patchedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="second" type="number" domain={[0, maxSeconds]} />
                    <YAxis />
                    <Tooltip formatter={(v) => typeof v === "number" ? v.toExponential(2) : v} />
                    <Legend />
                    <Line type="monotone" dataKey="FlowPackets_s" name="FlowPackets/s" stroke="#333" strokeWidth={1} dot={false} connectNulls />
                    <Scatter data={patchedData} dataKey="lowPackets" name="LOW ALERTS" fill="#d2cf0b" />
                    <Scatter data={patchedData} dataKey="medPackets" name="MEDIUM ALERTS" fill="#e88d0e" />
                    <Scatter data={patchedData} dataKey="highPackets" name="HIGH ALERTS" fill="#940101" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { padding: "24px 32px", maxWidth: "1200px", margin: "0 auto" },
  title: { marginBottom: "24px", color: "#1e293b" },
  empty: { textAlign: "center", marginTop: "100px" },
  fetchBtn: { marginTop: "16px", padding: "12px 24px", background: "#6366f1", color: "white", borderRadius: "8px", border: "none", cursor: "pointer", fontWeight: "600" },
  datasetBar: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" },
  datasetLabel: { fontWeight: "600", color: "#475569" },
  datasetTab: { padding: "10px 20px", border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: "8px", cursor: "pointer", fontWeight: "500" },
  datasetTabActive: { background: "#0f172a", color: "white", border: "1px solid #0f172a" },
  thresholdNote: { fontSize: "14px", color: "#64748b", marginBottom: "12px" },
  tabBar: { display: "flex", gap: "8px", marginBottom: "24px", flexWrap: "wrap" },
  tab: { padding: "10px 18px", border: "1px solid #cbd5e1", background: "#f8fafc", borderRadius: "8px", cursor: "pointer", fontWeight: "500" },
  tabActive: { background: "#6366f1", color: "white", border: "1px solid #6366f1" },
  cardGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" },
  card: { background: "#f8fafc", padding: "24px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" },
  graphSection: { marginBottom: "24px" },
  graphNav: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" },
  graphTitle: { marginBottom: "12px", color: "#334155" },
  graphControls: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap" },
  smallBtn: { padding: "8px 16px", background: "#64748b", color: "white", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "14px" },
  chartWrap: { background: "#fff", padding: "16px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)", marginBottom: "8px" },
  confusionSection: { marginBottom: "24px" },
  primaryButton: { padding: "14px 28px", background: "#6366f1", color: "white", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: "600", marginBottom: "20px" },
  confusionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "24px" },
  confusionCard: { background: "#f8fafc", padding: "20px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" },
  confusionTable: { width: "100%", borderCollapse: "collapse", marginTop: "12px", marginBottom: "12px" },
  confusionTableTh: { padding: "10px", border: "1px solid #cbd5e1", background: "#f1f5f9" },
  confusionTableTd: { padding: "12px 16px", border: "1px solid #cbd5e1" },
  metricsList: { display: "flex", flexDirection: "column", gap: "4px", fontSize: "14px", color: "#475569" },
  tableSection: { marginBottom: "24px" },
  sectionDesc: { marginBottom: "12px", color: "#64748b" },
  tableWrap: { overflowX: "auto", background: "#fff", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" },
  dataTable: { width: "100%", borderCollapse: "collapse", fontSize: "14px" },
  dataTableTh: { padding: "12px 16px", textAlign: "left", borderBottom: "2px solid #e2e8f0", background: "#f1f5f9" },
  dataTableTd: { padding: "10px 16px", borderBottom: "1px solid #e2e8f0" },
  tableNote: { marginTop: "8px", fontSize: "14px", color: "#64748b" },
  thresholdSection: { display: "flex", flexDirection: "column", gap: "20px" },
};

export default Results;

