import { BrowserRouter as Router, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import ModeSelect from "./pages/ModeSelect.jsx";
import DatasetUpload from "./pages/DatasetUpload.jsx";
import LiveCapture from "./pages/LiveCapture.jsx";
import Upload from "./pages/Upload.jsx";
import Results from "./pages/Results.jsx";
import axios from "axios";

function AppContent() {
  const [results, setResults] = useState(null);
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === "/results" && !results) {
      fetchResults();
    }
  }, [location.pathname]);

  const fetchResults = async () => {
    try {
      const response = await axios.get("http://localhost:5000/results");
      setResults(response.data);
    } catch (error) {
      console.error("No results yet:", error);
      setResults(null);
    }
  };

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/mode" element={<ModeSelect />} />
        <Route path="/dataset" element={<DatasetUpload setResults={setResults} />} />
        <Route path="/live" element={<LiveCapture setResults={setResults} />} />
        <Route path="/upload" element={<Upload setResults={setResults} />} />
        <Route path="/results" element={<Results results={results} fetchResults={fetchResults} />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
