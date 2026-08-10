import { Link } from "react-router-dom";

function Navbar() {
  return (
    <nav style={styles.nav}>
      <div style={styles.brand}>
        <span style={styles.brandMark}>Residual Based</span>
        <span style={styles.brandText}>EWS Generator</span>
      </div>
      <div>
        <Link to="/" style={styles.link}>Home</Link>
        <Link to="/mode" style={styles.link}>Mode</Link>
        <Link to="/results" style={styles.link}>Results</Link>
      </div>
    </nav>
  );
}

const styles = {
  nav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px 40px",
    backgroundColor: "#446812",
    color: "white",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    position: "sticky",
    top: 0,
    zIndex: 1000
  },
  brand: {
    display: "flex",
    alignItems: "baseline",
    gap: "6px",
  },
  brandMark: {
    fontSize: "1.4rem",
    fontWeight: 800,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#f3f71e",
  },
  brandText: {
    fontSize: "1rem",
    fontWeight: 600,
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: "#7bd4ed",
  },
  link: {
    marginLeft: "25px",
    color: "white",
    textDecoration: "none",
    fontWeight: "500",
    padding: "8px 16px",
    borderRadius: "6px",
    transition: "all 0.2s ease",
  },
};

export default Navbar;
