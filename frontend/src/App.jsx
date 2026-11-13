import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';

import Dashboard from './pages/Dashboard';
import ExampleChartPage from './pages/ExampleChartPage';
import LiveCapture from './pages/LiveCapture';
import LiveMonitor from './pages/LiveMonitor';
import Alerts from './pages/Alerts';
import AlertDetail from './pages/AlertDetail';
import Statistics from './pages/Statistics';
import Recommendations from './pages/Recommendations';
import Topology from './pages/Topology';
import AdminPanel from './pages/AdminPanel';
import MLInfo from './pages/MLInfo';
import MobileDashboard from './pages/MobileDashboard';

// The app drives one detection engine (backend/dlt_app.py, port 5001) over
// /api/dlt. "/" opens the live Dashboard; the backend auto-starts live capture
// on launch. See src/api/ews.js for the endpoint client.

const Layout = ({ children }) => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="w-full">{children}</div>
  </div>
);

const withLayout = (el) => <Layout>{el}</Layout>;

function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        {/* Home: the live security dashboard */}
        <Route path="/" element={withLayout(<Dashboard />)} />

        {/* Main dashboard + legacy aliases */}
        <Route path="/dashboard" element={withLayout(<Dashboard />)} />
        <Route path="/menu" element={<Navigate to="/flow-analysis" replace />} />
        <Route path="/prevention" element={<Navigate to="/flow-analysis" replace />} />

        {/* Workflows */}
        <Route path="/flow-analysis" element={withLayout(<ExampleChartPage />)} />
        <Route path="/live-capture" element={withLayout(<LiveCapture />)} />
        <Route path="/live-monitor" element={withLayout(<LiveMonitor />)} />

        {/* Alerts & analytics */}
        <Route path="/alerts" element={withLayout(<Alerts />)} />
        <Route path="/alerts/:id" element={withLayout(<AlertDetail />)} />
        <Route path="/statistics" element={withLayout(<Statistics />)} />
        <Route path="/recommendations" element={withLayout(<Recommendations />)} />
        <Route path="/topology" element={withLayout(<Topology />)} />

        {/* Admin & info */}
        <Route path="/admin" element={withLayout(<AdminPanel />)} />
        <Route path="/ml-info" element={withLayout(<MLInfo />)} />

        {/* Mobile dashboard (standalone, no desktop navbar) */}
        <Route path="/mobile" element={<MobileDashboard />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
