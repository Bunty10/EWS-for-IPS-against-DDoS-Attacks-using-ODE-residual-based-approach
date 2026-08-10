import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function LiveCapture({ setResults }) {
  const [capturing, setCapturing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [capturePreview, setCapturePreview] = useState(null);
  const [hasCapture, setHasCapture] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const pollRef = useRef(null);
  const navigate = useNavigate();

  const pollStatus = async () => {
    try {
      const r = await axios.get("http://localhost:5000/live/status");
      setCapturing(r.data.capturing);
      setSeconds(r.data.seconds || 0);
      if (r.data.preview) {
        setCapturePreview(r.data.preview);
        if (r.data.preview.seconds_with_data > 0 || r.data.preview.total_packets > 0) {
          setHasCapture(true);
        }
      }
      if (r.data.last_error) {
        setError(r.data.last_error);
      }
    } catch (err) {
      setCapturing(false);
      setError(err.response?.data?.error || err.message || "Failed to poll live capture status.");
    }
  };

  useEffect(() => {
    if (capturing) {
      pollRef.current = setInterval(pollStatus, 1000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [capturing]);

  // On mount: fetch last saved capture so the user can see what was captured previously
  useEffect(() => {
    axios
      .get("http://localhost:5000/live/preview")
      .then((r) => {
        if (r.data && (r.data.total_packets > 0 || r.data.seconds_with_data > 0)) {
          setCapturePreview(r.data);
          setHasCapture(true);
        }
      })
      .catch(() => {});
  }, []);

  const startCapture = async () => {
    setError("");
    setCapturePreview(null);
    setHasCapture(false);
    setShowAllRows(false);
    try {
      const r = await axios.post("http://localhost:5000/live/start");
      if (r.data.error) {
        setError(r.data.error);
        return;
      }
      setCapturing(true);
      setSeconds(0);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const stopCapture = async () => {
    setError("");
    try {
      const stopRes = await axios.post("http://localhost:5000/live/stop");
      if (stopRes.data.error && !stopRes.data.path) {
        setError(stopRes.data.error);
        return;
      }
      if (stopRes.data.capture_preview) {
        setCapturePreview(stopRes.data.capture_preview);
        setHasCapture(true);
      }
      setCapturing(false);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const normalizeResults = (raw) => {
    if (!raw || typeof raw !== "object") return { train: null, test1: null, test2: null };
    if (raw.test1 !== undefined && raw.test1 !== null) return raw;
    if (raw.traffic_data || raw.detection_rate !== undefined) return { train: null, test1: raw, test2: null };
    return { train: raw.train ?? null, test1: raw.test1 ?? null, test2: raw.test2 ?? null };
  };

  const analyzeCapture = async () => {
    setError("");
    setLoading(true);
    try {
      const procRes = await axios.post("http://localhost:5000/live/process");
      const results = normalizeResults(procRes.data.results);
      setResults(results);
      navigate("/results");
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // One-click: stop capture then run analysis and go to results (same as CSV "one click" flow)
  const stopAndAnalyze = async () => {
    setError("");
    setLoading(true);
    try {
      const stopRes = await axios.post("http://localhost:5000/live/stop");
      if (stopRes.data.error && !stopRes.data.path) {
        setError(stopRes.data.error);
        setLoading(false);
        return;
      }
      if (stopRes.data.capture_preview) {
        setCapturePreview(stopRes.data.capture_preview);
        setHasCapture(true);
      }
      setCapturing(false);
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      const procRes = await axios.post("http://localhost:5000/live/process");
      setResults(normalizeResults(procRes.data.results));
      navigate("/results");
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const rowsToShow =
    (showAllRows && capturePreview?.all_rows?.length ? capturePreview.all_rows : capturePreview?.sample_rows) || [];

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.card,
          ...(capturePreview && (capturePreview.total_packets > 0 || capturePreview.seconds_with_data > 0)
            ? { maxWidth: "640px" }
            : {}),
        }}
      >
        <h2 style={styles.title}>Live Network Traffic Capture</h2>
        <p style={styles.desc}>
          Capture real-time network traffic. When you stop, the data is processed with the Hybrid DLT-NN pipeline.
        </p>

        <div style={styles.statusBox}>
          <div style={styles.statusRow}>
            <span style={styles.label}>Status:</span>
            <span style={{
              ...styles.badge,
              ...(capturing ? styles.badgeActive : styles.badgeIdle),
            }}>
              {capturing ? "● Capturing" : "○ Idle"}
            </span>
          </div>
          {capturing && (
            <div style={styles.timer}>
              <span style={styles.timerVal}>{seconds}</span>
              <span style={styles.timerUnit}>seconds</span>
            </div>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.buttons}>
          {capturing ? (
            <>
              <button onClick={stopCapture} disabled={loading} style={styles.btnStop}>
                Stop
              </button>
              <button onClick={stopAndAnalyze} disabled={loading} style={styles.btnStopAnalyze}>
                {loading ? (
                  <span style={styles.loading}>
                    <span style={styles.spinner} /> Stopping & analyzing...
                  </span>
                ) : (
                  "Stop & Analyze"
                )}
              </button>
            </>
          ) : (
            <>
              <button onClick={startCapture} disabled={loading} style={styles.btnStart}>
                Start Capture
              </button>
              {hasCapture && (
                <button onClick={analyzeCapture} disabled={loading} style={styles.btnAnalyze}>
                  {loading ? (
                    <span style={styles.loading}>
                      <span style={styles.spinner} /> Analyzing...
                    </span>
                  ) : (
                    "Analyze"
                  )}
                </button>
              )}
            </>
          )}
        </div>

        <p style={styles.note}>
          Note: Live capture requires Scapy and Npcap (For Windows) or libpcap (For Linux). Run as administrator if needed.
        </p>

        {capturePreview && capturePreview.total_packets > 0 && (
          <div style={styles.previewBox}>
            <h3 style={styles.previewTitle}>Captured Data (for analysis)</h3>
            <p style={styles.previewDesc}>
              This is what will be analyzed: per-second aggregates of packets and bytes.
            </p>
            {capturePreview.isLastSaved && (
              <p style={styles.previewNote}>Showing the last saved capture from a previous run.</p>
            )}
            <div style={styles.previewStats}>
              <div style={styles.previewStat}>
                <span style={styles.previewStatVal}>{capturePreview.total_packets.toLocaleString()}</span>
                <span style={styles.previewStatLabel}>Packets</span>
              </div>
              <div style={styles.previewStat}>
                <span style={styles.previewStatVal}>{capturePreview.total_bytes.toLocaleString()}</span>
                <span style={styles.previewStatLabel}>Bytes</span>
              </div>
              <div style={styles.previewStat}>
                <span style={styles.previewStatVal}>{capturePreview.seconds_with_data}</span>
                <span style={styles.previewStatLabel}>Seconds</span>
              </div>
            </div>
            <div style={styles.previewTableWrap}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                {capturePreview.all_rows && capturePreview.all_rows.length > (capturePreview.sample_rows?.length || 0) && (
                  <button
                    type="button"
                    onClick={() => setShowAllRows((v) => !v)}
                    style={styles.toggleBtn}
                  >
                    {showAllRows ? "Show sample only" : "Show all rows"}
                  </button>
                )}
              </div>
              <table style={styles.previewTable}>
                <thead>
                  <tr>
                    <th style={styles.th}>Timestamp</th>
                    <th style={styles.th}>FlowPackets/s</th>
                    <th style={styles.th}>FlowBytes/s</th>
                    <th style={styles.th}>FlowDuration</th>
                    {/* <th style={styles.th}>Label</th> */}
                  </tr>
                </thead>
                <tbody>
                  {rowsToShow.map((row, i) => (
                    <tr key={i}>
                      <td style={styles.td}>{row.Timestamp}</td>
                      <td style={styles.td}>{row["Flow Packets/s"]}</td>
                      <td style={styles.td}>{row["Flow Bytes/s"]}</td>
                      <td style={styles.td}>{row["Flow Duration"]}</td>
                      {/* <td style={styles.td}>{row.Label}</td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={styles.previewFooter}>
              {/* Columns: {capturePreview.column_info || "Timestamp, FlowPackets/s, FlowBytes/s, FlowDuration"} */}
              Columns: {"Timestamp, FlowPackets/s, FlowBytes/s, FlowDuration"}
            </p>
          </div>
        )}

        {capturePreview && capturePreview.seconds_with_data > 0 && capturePreview.total_packets === 0 && (
          <div style={styles.previewBox}>
            <h3 style={styles.previewTitle}>Captured Data</h3>
            <p style={styles.previewWarn}>
              {capturePreview.seconds_with_data} second(s) elapsed but no packets captured. Check Npcap/Scapy and run as Administrator.
            </p>
          </div>
        )}
      </div>

      <a href="/mode" style={styles.backLink}>← Back to Mode Select</a>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "calc(100vh - 80px)",
    padding: "60px 24px 40px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  card: {
    background: "#fff",
    borderRadius: "20px",
    padding: "40px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    maxWidth: "480px",
    width: "100%",
  },
  title: { fontSize: "1.5rem", fontWeight: "700", color: "#0f172a", marginBottom: "8px" },
  desc: { fontSize: "0.95rem", color: "#64748b", marginBottom: "24px" },
  statusBox: {
    background: "#f8fafc",
    borderRadius: "12px",
    padding: "20px",
    marginBottom: "24px",
  },
  statusRow: { display: "flex", alignItems: "center", gap: "12px" },
  label: { fontWeight: "600", color: "#475569" },
  badge: { padding: "4px 12px", borderRadius: "20px", fontSize: "0.9rem" },
  badgeActive: { background: "#dcfce7", color: "#16a34a" },
  badgeIdle: { background: "#f1f5f9", color: "#64748b" },
  timer: { marginTop: "12px", display: "flex", alignItems: "baseline", gap: "4px" },
  timerVal: { fontSize: "1.5rem", fontWeight: "700", color: "#6366f1" },
  timerUnit: { fontSize: "0.9rem", color: "#64748b" },
  error: { color: "#dc2626", fontSize: "0.9rem", marginBottom: "16px" },
  buttons: { marginBottom: "20px" },
  btnStart: {
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)",
    color: "white",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
  btnStop: {
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #dc2626 0%, #ef4444 100%)",
    color: "white",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
  btnStopAnalyze: {
    marginTop: "8px",
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    color: "white",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
  btnAnalyze: {
    marginTop: "8px",
    width: "100%",
    padding: "12px 24px",
    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
    color: "white",
    borderRadius: "12px",
    fontSize: "0.95rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
  loading: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  spinner: {
    width: "18px", height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  note: { fontSize: "0.8rem", color: "#94a3b8" },
  backLink: { marginTop: "24px", color: "#64748b", fontSize: "0.95rem", textDecoration: "none" },
  previewBox: {
    marginTop: "24px",
    padding: "20px",
    background: "#f0fdf4",
    borderRadius: "12px",
    border: "1px solid #bbf7d0",
  },
  previewTitle: { fontSize: "1rem", fontWeight: "600", color: "#166534", marginBottom: "8px" },
  previewDesc: { fontSize: "0.85rem", color: "#15803d", marginBottom: "12px" },
  previewNote: { fontSize: "0.8rem", color: "#16a34a", marginBottom: "8px" },
  previewStats: { display: "flex", gap: "20px", marginBottom: "12px", flexWrap: "wrap" },
  previewStat: { display: "flex", flexDirection: "column" },
  previewStatVal: { fontSize: "1.1rem", fontWeight: "700", color: "#166534" },
  previewStatLabel: { fontSize: "0.75rem", color: "#64748b" },
  previewTableWrap: { overflowX: "auto", marginBottom: "8px" },
  previewTable: { width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" },
  th: { textAlign: "left", padding: "6px 8px", background: "#dcfce7", color: "#166534", fontWeight: "600" },
  td: { padding: "6px 8px", borderBottom: "1px solid #dcfce7" },
  previewFooter: { fontSize: "0.75rem", color: "#64748b", marginTop: "4px" },
  previewWarn: { fontSize: "0.9rem", color: "#b45309" },
  toggleBtn: {
    padding: "6px 12px",
    borderRadius: "999px",
    border: "1px solid #22c55e",
    background: "#ecfdf5",
    color: "#16a34a",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
};

export default LiveCapture;
