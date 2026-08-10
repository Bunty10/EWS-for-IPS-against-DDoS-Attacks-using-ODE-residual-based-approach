import { Link } from "react-router-dom";

function Home() {
  const barHeights = [0.22, 0.35, 0.28, 0.45, 0.32, 0.55, 0.38, 0.62, 0.4, 0.58, 0.33, 0.48];

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes homeSurge {
          0%, 38% {
            transform: scaleY(1);
            background: linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%);
          }
          42%, 68% {
            transform: scaleY(2.35);
            background: linear-gradient(180deg, #fb923c 0%, #dc2626 100%);
          }
          72%, 100% {
            transform: scaleY(1);
            background: linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%);
          }
        }
        @keyframes homeGlow {
          0%, 38% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
          42%, 68% { box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.35); }
          72%, 100% { box-shadow: 0 0 0 0 rgba(56, 189, 248, 0); }
        }
        @keyframes homeLabelCalm {
          0%, 35% { opacity: 1; }
          40%, 100% { opacity: 0; }
        }
        @keyframes homeLabelAlert {
          0%, 35% { opacity: 0; }
          40%, 65% { opacity: 1; }
          70%, 100% { opacity: 0; }
        }
        @keyframes homeScan {
          0% { transform: translateX(-100%); opacity: 0.15; }
          50% { opacity: 0.35; }
          100% { transform: translateX(400%); opacity: 0.15; }
        }
      `}</style>

      <section style={styles.hero}>
        <h1 style={styles.title}>
          Residual Based <span style={styles.titleAccent}>Intrusion Prevention</span>
        </h1>
        <p style={styles.subtitle}>
          DDoS Attack-focused analysis and Early Warning Generation
        </p>
        <Link to="/mode" style={styles.cta}>
          Start Analysis
        </Link>
      </section>

      <section style={styles.demoWrap} aria-label="Traffic detection preview">
        <p style={styles.demoIntro}>How sudden congestion looks next to a calm baseline</p>

        <div style={{ ...styles.demoCard, animation: "homeGlow 7s ease-in-out infinite" }}>
          <div style={styles.demoTop}>
            <span style={styles.pill}>Live preview</span>
            <div style={styles.statusRow}>
              <span style={styles.statusCalm}>Monitoring — benign</span>
              <span style={styles.statusAlert}>Spike — residual &gt; threshold</span>
            </div>
          </div>

          <div style={styles.chart}>
            <div style={styles.threshold}>
              <span style={styles.thresholdLabel}>Adaptive θ</span>
            </div>
            <div style={styles.scanLine} />
            <div style={styles.bars}>
              {barHeights.map((h, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.bar,
                    height: `${Math.max(18, h * 72)}px`,
                    animation: `homeSurge 8s ease-in-out infinite`,
                    animationDelay: `${i * 0.06}s`,
                  }}
                />
              ))}
            </div>
            <div style={styles.axis}>
              <span>time →</span>
            </div>
          </div>

          <p style={styles.demoFoot}>
            Normal traffic stays under θ; a DDoS-style flood pushes packets/s up so residuals trip LOW / MEDIUM / HIGH
            warnings.
          </p>
        </div>
      </section>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "calc(100vh - 70px)",
    padding: "48px 20px 56px",
    maxWidth: "720px",
    margin: "0 auto",
    background: "#b8e4a3",
  },
  hero: {
    textAlign: "center",
    marginBottom: "40px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(1.65rem, 3.5vw, 2.25rem)",
    fontWeight: 800,
    color: "#0a2259",
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  titleAccent: {
    color: "#0895d2",
    fontWeight: 800,
  },
  subtitle: {
    marginTop: "14px",
    marginBottom: 0,
    fontSize: "1rem",
    color: "#354861",
    maxWidth: "560px",
    marginLeft: "auto",
    marginRight: "auto",
    lineHeight: 1.65,
  },
  cta: {
    display: "inline-block",
    marginTop: "26px",
    padding: "12px 28px",
    borderRadius: "10px",
    background: "#111e77",
    color: "#b8e4a3",
    fontWeight: 600,
    fontSize: "0.95rem",
    border: "1px solid #121f33",
    boxShadow: "0 4px 14px rgba(9, 37, 102, 0.2)",
    transition: "background 0.2s ease, transform 0.15s ease",
  },
  demoWrap: {
    marginTop: "8px",
  },
  demoIntro: {
    textAlign: "center",
    fontSize: "0.85rem",
    color: "#64748b",
    marginBottom: "14px",
  },
  demoCard: {
    background: "#ffffff",
    borderRadius: "16px",
    border: "1px solid #8eb6eb",
    padding: "20px 18px 18px",
    boxShadow: "0 4px 24px rgba(15, 23, 42, 0.06)",
  },
  demoTop: {
    marginBottom: "16px",
  },
  pill: {
    display: "inline-block",
    fontSize: "0.7rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748b",
    marginBottom: "10px",
  },
  statusRow: {
    position: "relative",
    minHeight: "22px",
    textAlign: "center",
  },
  statusCalm: {
    position: "absolute",
    left: 0,
    right: 0,
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "#0f766e",
    animation: "homeLabelCalm 8s ease-in-out infinite",
  },
  statusAlert: {
    position: "absolute",
    left: 0,
    right: 0,
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "#b91c1c",
    animation: "homeLabelAlert 8s ease-in-out infinite",
  },
  chart: {
    position: "relative",
    paddingTop: "8px",
    paddingBottom: "8px",
  },
  threshold: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "42%",
    borderTop: "2px dashed #cbd5e1",
    zIndex: 1,
    pointerEvents: "none",
  },
  thresholdLabel: {
    position: "absolute",
    right: 0,
    top: "-18px",
    fontSize: "0.65rem",
    color: "#94a3b8",
    fontWeight: 600,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  scanLine: {
    position: "absolute",
    top: "12%",
    bottom: "28%",
    width: "28%",
    left: "0%",
    background: "linear-gradient(90deg, transparent, rgba(56, 189, 248, 0.25), transparent)",
    animation: "homeScan 8s linear infinite",
    pointerEvents: "none",
    zIndex: 2,
  },
  bars: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: "6px",
    height: "110px",
    paddingLeft: "4px",
    paddingRight: "4px",
    position: "relative",
    zIndex: 0,
  },
  bar: {
    flex: 1,
    minWidth: "8px",
    borderRadius: "4px 4px 2px 2px",
    transformOrigin: "50% 100%",
    transform: "scaleY(1)",
    background: "linear-gradient(180deg, #38bdf8 0%, #0ea5e9 100%)",
  },
  axis: {
    marginTop: "10px",
    textAlign: "right",
    fontSize: "0.72rem",
    color: "#94a3b8",
    letterSpacing: "0.08em",
  },
  demoFoot: {
    marginTop: "16px",
    marginBottom: 0,
    fontSize: "0.8rem",
    color: "#64748b",
    lineHeight: 1.55,
    textAlign: "center",
  },
};

export default Home;
