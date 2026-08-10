import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function Upload({ setResults }) {
  const [train, setTrain] = useState(null);
  const [test1, setTest1] = useState(null);
  const [test2, setTest2] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleUpload = async () => {
    if (!train || !test1 || !test2) {
      alert("Please select all three files");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("train", train);
    formData.append("test1", test1);
    formData.append("test2", test2);

    try {
      // 1. Upload files
      await axios.post("http://localhost:5000/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // 2. Process data
      const processResponse = await axios.post(
        "http://localhost:5000/process"
      );

      const resultData = processResponse.data.results;

      // 3. Save results to state
      setResults(resultData);

      // 4. Show summary
      alert(
        `✅ Analysis Complete!\nDetection Rate: ${((resultData.detection_rate ?? 0) * 100).toFixed(1)}%\nHIGH Alerts: ${resultData.warnings?.HIGH ?? 0}`
      );

      // 5. Go to results page
      navigate("/results");
    } catch (error) {
      console.error("Upload error:", error.response?.data || error.message);
      alert(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2>Upload Datasets</h2>
      <p>Train (BENIGN), Test1, Test2 (ATTACK)</p>

      <div style={styles.fileInputs}>
        <label style={styles.label}>
          Train Dataset (.csv)
          <input type="file" accept=".csv" onChange={(e) => setTrain(e.target.files[0])} />
        </label>

        <label style={styles.label}>
          Test1 (.csv)
          <input type="file" accept=".csv" onChange={(e) => setTest1(e.target.files[0])} />
        </label>

        <label style={styles.label}>
          Test2 (ATTACK) (.csv)
          <input type="file" accept=".csv" onChange={(e) => setTest2(e.target.files[0])} />
        </label>
      </div>

      <button onClick={handleUpload} disabled={loading} style={styles.button}>
        {loading ? "Processing..." : "Upload & Analyze"}
      </button>
    </div>
  );
}

const styles = {
  container: {
    textAlign: "center",
    marginTop: "80px",
    maxWidth: "600px",
    marginLeft: "auto",
    marginRight: "auto",
  },
  fileInputs: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
    margin: "40px 0",
  },
  label: {
    display: "block",
    background: "#f8fafc",
    padding: "20px",
    borderRadius: "12px",
    border: "2px dashed #cbd5e1",
    cursor: "pointer",
  },
  button: {
    background: "#667eea",
    color: "white",
    padding: "15px 40px",
    border: "none",
    borderRadius: "50px",
    fontSize: "1.1rem",
    fontWeight: "bold",
    cursor: "pointer",
    minWidth: "200px",
  },
};

export default Upload;
