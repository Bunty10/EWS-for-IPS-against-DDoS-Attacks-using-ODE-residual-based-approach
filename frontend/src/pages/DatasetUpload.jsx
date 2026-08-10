import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function DatasetUpload({ setResults }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a test dataset (CSV file)");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("test", file);

    try {
      await axios.post("http://localhost:5000/upload-test", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const processResponse = await axios.post("http://localhost:5000/process-test");
      const resultData = processResponse.data.results;

      setResults(resultData);
      navigate("/results");
    } catch (err) {
      let msg = "Something went wrong.";
      if (err.response?.data?.error) {
        msg = err.response.data.error;
      } else if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
        msg = "Cannot reach the server. Make sure the backend is running (python app.py in the backend folder).";
      } else if (err.response?.data?.detail) {
        msg = typeof err.response.data.detail === "string" ? err.response.data.detail : JSON.stringify(err.response.data.detail);
      } else if (err.message) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) {
      setFile(f);
      setError("");
    } else {
      setError("Please upload a CSV file");
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Upload Test Dataset</h2>
        <p style={styles.desc}>
          Upload a single CSV file with columns: Timestamp, FlowPackets/s, FlowBytes/s, FlowDuration, Label
        </p>

        <div
          style={{
            ...styles.dropZone,
            ...(dragOver ? styles.dropZoneActive : {}),
            ...(file ? styles.dropZoneFilled : {}),
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files[0];
              if (f) {
                setFile(f);
                setError("");
              }
            }}
            style={styles.hiddenInput}
          />
          {file ? (
            <span style={styles.fileName}>✓ {file.name}</span>
          ) : (
            <span style={styles.dropText}>Drop CSV here or click to browse</span>
          )}
        </div>

        {error && <p style={styles.error}>{error}</p>}

        <button
          onClick={handleUpload}
          disabled={loading || !file}
          style={{
            ...styles.button,
            ...((loading || !file) ? styles.buttonDisabled : {}),
          }}
        >
          {loading ? (
            <span style={styles.loading}>
              <span style={styles.spinner} /> Processing...
            </span>
          ) : (
            "Analyze"
          )}
        </button>
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
    background: "#f2f3f7",
    borderRadius: "20px",
    padding: "40px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    maxWidth: "480px",
    width: "100%",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: "8px",
  },
  desc: {
    fontSize: "0.95rem",
    color: "#64748b",
    marginBottom: "24px",
  },
  dropZone: {
    border: "2px dashed #cbd5e1",
    borderRadius: "12px",
    padding: "32px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
    marginBottom: "20px",
  },
  dropZoneActive: {
    borderColor: "#6366f1",
    background: "#f5f3ff",
  },
  dropZoneFilled: {
    borderColor: "#22c55e",
    background: "#f0fdf4",
  },
  hiddenInput: { display: "none" },
  dropText: { color: "#64748b", fontSize: "1rem" },
  fileName: { color: "#16a34a", fontWeight: "600" },
  error: {
    color: "#dc2626",
    fontSize: "0.9rem",
    marginBottom: "16px",
  },
  button: {
    width: "100%",
    padding: "14px 24px",
    background: "linear-gradient(135deg, #6062d4 0%, #343bbf 100%)",
    color: "white",
    borderRadius: "12px",
    fontSize: "1rem",
    fontWeight: "600",
    border: "none",
    cursor: "pointer",
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  loading: { display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTopColor: "white",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  backLink: {
    marginTop: "24px",
    color: "#64748b",
    fontSize: "0.95rem",
    textDecoration: "none",
  },
};

export default DatasetUpload;
