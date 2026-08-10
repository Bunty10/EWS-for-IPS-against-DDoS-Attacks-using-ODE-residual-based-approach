import { Link } from "react-router-dom";
import { useState } from "react";

function ModeSelect() {
  const [hover, setHover] = useState(null);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Choose Mode for Traffic Analysis</h1>
        <p style={styles.subtitle}>Select how you want to run the Residual-based IPS pipeline</p>
      </div>

      <div style={styles.cards}>
        <Link
          to="/dataset"
          style={styles.cardLink}
          onMouseEnter={() => setHover("dataset")}
          onMouseLeave={() => setHover(null)}
        >
          <div
            style={{
              ...styles.card,
              ...(hover === "dataset" ? styles.cardHover : {}),
            }}
          >
            <div style={styles.iconWrap}>
              <span style={styles.icon}>📁</span>
            </div>
            <h3 style={styles.cardTitle}>With Dataset</h3>
            <p style={styles.cardDesc}>
              Upload a CSV file. Uses pre-trained models for instant analysis.
            </p>
            <span style={styles.cta}>Load File →</span>
          </div>
        </Link>

        <Link
          to="/live"
          style={styles.cardLink}
          onMouseEnter={() => setHover("live")}
          onMouseLeave={() => setHover(null)}
        >
          <div
            style={{
              ...styles.card,
              ...(hover === "live" ? styles.cardHover : {}),
            }}
          >
            <div style={styles.iconWrap}>
              <span style={styles.icon}>📡</span>
            </div>
            <h3 style={styles.cardTitle}>With Live Traffic</h3>
            <p style={styles.cardDesc}>
              Capture real-time network traffic and run prevent on live network traffic.
            </p>
            <span style={styles.cta}>Start Capture →</span>
          </div>
        </Link>
      </div>

      <Link to="/" style={styles.backLink}>← Back to Homepage</Link>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "calc(100vh - 80px)",
    padding: "60px 24px 40px",
    maxWidth: "900px",
    margin: "0 auto",
  },
  header: {
    textAlign: "center",
    marginBottom: "48px",
  },
  title: {
    fontSize: "1.75rem",
    fontWeight: "700",
    color: "#0f172a",
    marginBottom: "8px",
  },
  subtitle: {
    fontSize: "1rem",
    color: "#ab2444",
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: "24px",
    marginBottom: "40px",
  },
  cardLink: {
    textDecoration: "none",
  },
  card: {
    background: "#326b42",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    border: "1px solid #e2e8f0",
    transition: "all 0.3s ease",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  cardHover: {
    transform: "translateY(-4px)",
    boxShadow: "0 12px 32px rgba(99, 102, 241, 0.15)",
    border: "1px solid #13960e",
  },
  iconWrap: {
    width: "64px",
    height: "64px",
    borderRadius: "16px",
    background: "linear-gradient(135deg, #a4a6e7 0%, #060b91 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "20px",
  },
  icon: {
    fontSize: "28px",
  },
  cardTitle: {
    fontSize: "1.25rem",
    fontWeight: "600",
    color: "#eef1f7",
    marginBottom: "8px",
  },
  cardDesc: {
    fontSize: "0.95rem",
    color: "#3ae015",
    lineHeight: 1.5,
    textAlign: "center",
    marginBottom: "20px",
    flex: 1,
  },
  cta: {
    fontSize: "0.95rem",
    fontWeight: "600",
    color: "#90f163",
  },
  backLink: {
    display: "inline-block",
    color: "#64748b",
    fontSize: "0.95rem",
    textDecoration: "none",
    padding: "8px 0",
  },
};

export default ModeSelect;
