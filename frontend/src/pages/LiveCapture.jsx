import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-alpine.css';
import { BoltIcon, ChartBarIcon, EyeIcon, ArrowLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { FiDownload, FiAlertTriangle } from 'react-icons/fi';

import useDltAnalysis from '../hooks/useDltAnalysis';
import ProgressBar from '../components/dlt/ProgressBar';
import BenignDDoSChart from '../components/dlt/BenignDDoSChart';
import AlertLevelChart from '../components/dlt/AlertLevelChart';
import ThresholdsCard from '../components/dlt/ThresholdsCard';
import AlertSummaryCards from '../components/dlt/AlertSummaryCards';
import { computeAttackMarkers } from '../components/dlt/attackMarkers';
import { TabNav, SegmentedToggle, TRAFFIC_METRICS, ALERT_LEVELS } from '../components/dlt/SectionControls';
import { exportTrafficCsv } from '../api/dltExport';

// Live Traffic Capture page (/live-capture).

// Sub-sections for the live-capture result view (no Matrices — there is no
// ground-truth attack window to evaluate against in live capture).
const LIVE_TABS = [
  { key: 'traffic', label: 'Traffic' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'summary', label: 'Summary' },
  { key: 'data', label: 'Data' },
];

const columnDefs = [
  { field: 'Timestamp', headerName: 'Timestamp', sortable: true, filter: true, width: 200 },
  { field: 'SourceIP', headerName: 'Source IP', sortable: true, filter: true, width: 150 },
  { field: 'DestinationIP', headerName: 'Destination IP', sortable: true, filter: true, width: 150 },
  { field: 'FlowPackets_s', headerName: 'Flow Packets/s', sortable: true, filter: 'agNumberColumnFilter' },
  { field: 'FlowBytes_s', headerName: 'Flow Bytes/s', sortable: true, filter: 'agNumberColumnFilter' },
  { field: 'FlowDuration', headerName: 'Flow Duration', sortable: true, filter: 'agNumberColumnFilter' },
  { field: 'Label', headerName: 'Label', sortable: true, filter: true, width: 110 },
  { field: 'Warning', headerName: 'Alert Level', sortable: true, filter: true, width: 120 },
];

// Which stepper step is "active" for a given job status.
const STEP_FOR_STATUS = {
  idle: 0,
  capturing: 1,
  analyzing: 2,
  processing: 2,
  done: 3,
  error: 0,
};

function Step({ icon: Icon, label, active, complete }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`rounded-full p-4 shadow-card mb-2 border-2 transition-colors duration-300 ${
          active
            ? 'border-accent bg-accent/10'
            : complete
              ? 'border-secondary bg-secondary/10'
              : 'border-transparent bg-surface'
        }`}
      >
        <Icon className={`h-8 w-8 ${active ? 'text-accent' : complete ? 'text-secondary' : 'text-textSecondary'}`} />
      </div>
      <span className={`font-semibold ${active ? 'text-accent' : complete ? 'text-secondary' : 'text-textSecondary'}`}>
        {label}
      </span>
    </div>
  );
}

const LiveCapture = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('traffic');
  const [trafficMetric, setTrafficMetric] = useState('FlowPackets_s');
  const [alertLevel, setAlertLevel] = useState('LOW');
  const [exportNote, setExportNote] = useState(null);
  const [exporting, setExporting] = useState(false);
  const {
    status, error, startCapture, stopCapture, reset, isBusy, isDone, isError,
    trafficData, maxSeconds, thresholds,
  } = useDltAnalysis();

  // Attack window shared by every chart and the alert-timing summary.
  const markers = useMemo(() => computeAttackMarkers(trafficData), [trafficData]);
  const defaultColDef = useMemo(() => ({ flex: 1, minWidth: 120, resizable: true }), []);
  const isCapturing = status.capture?.capturing;
  const hasData = trafficData.length > 0;
  const showEmptyOrError = !hasData && (isDone || isError);
  const currentStep = STEP_FOR_STATUS[status.status] ?? 0;

  const handleStart = async () => {
    try { await startCapture(); } catch { /* surfaced via hook state */ }
  };
  const handleStop = async () => {
    try { await stopCapture(); } catch { /* surfaced via hook state */ }
  };
  const handleStartOver = async () => {
    await reset();
  };
  // Ask the backend to write the captured per-second table into backend/dlt_results/.
  const handleExportCsv = async () => {
    setExportNote(null);
    setExporting(true);
    try {
      const out = await exportTrafficCsv({
        filename: 'per-second-live-capture-data.csv',
        columns: columnDefs.map(({ field, headerName }) => ({ field, headerName })),
        rows: trafficData,
      });
      setExportNote({ ok: true, text: `Saved to backend/dlt_results/${out.filename} (${out.rows} rows)` });
    } catch (err) {
      setExportNote({ ok: false, text: err.response?.data?.error || 'Export failed.' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background font-sans relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-[#181A20] via-[#1e293b] to-[#23262F]" />
        <div className="absolute left-1/2 top-0 -translate-x-1/2 w-[700px] h-[300px] bg-accent/20 blur-3xl rounded-full animate-pulse opacity-60" aria-hidden="true" />
      </div>
      <div className="relative z-10 max-w-7xl mx-auto px-4 py-16">
        <div className="flex justify-end gap-3 mb-6">
          {(hasData || isBusy) && (
            <button
              onClick={handleStartOver}
              className="flex items-center gap-2 px-4 py-2 bg-surface text-textSecondary border border-border rounded-lg hover:bg-border hover:text-primary transition-colors duration-200 font-semibold text-sm"
            >
              <ArrowPathIcon className="h-4 w-4" />
              Start Over
            </button>
          )}
          <button
            onClick={() => navigate('/prevention')}
            className="flex items-center gap-2 px-4 py-2 bg-surface text-textSecondary border border-border rounded-lg hover:bg-border hover:text-primary transition-colors duration-200 font-semibold text-sm"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Prevention
          </button>
        </div>

        <div className="flex flex-col items-center text-center mb-14">
          <BoltIcon className="h-16 w-16 text-accent mb-4 drop-shadow-neon animate-bounce" aria-hidden="true" />
          <h1 className="font-display text-5xl md:text-6xl font-semibold tracking-tightest text-text mb-3">
            Live traffic <span className="text-primary drop-shadow-neon">capture</span>
          </h1>
          <p className="text-lg md:text-xl text-textSecondary max-w-2xl mb-6 text-pretty">
            Capture live network traffic and let the early-warning pipeline flag
            LOW/MEDIUM/HIGH severity seconds in real time. Stop the capture to save the
            traffic and run the final analysis pass.
          </p>
        </div>

        <div className="flex flex-col md:flex-row justify-center items-center gap-8 mb-14">
          <Step icon={BoltIcon} label="1. Capture" active={currentStep === 1} complete={currentStep > 1} />
          <div className="h-8 w-1 md:w-8 md:h-1 bg-accent/40 rounded-full" />
          <Step icon={ChartBarIcon} label="2. Stop & Analyze" active={currentStep === 2} complete={currentStep > 2} />
          <div className="h-8 w-1 md:w-8 md:h-1 bg-accent/40 rounded-full" />
          <Step icon={EyeIcon} label="3. Visualize" active={currentStep === 3} complete={false} />
        </div>

        <div className="bg-surface rounded-lg shadow-card p-6 mb-8">
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {!isCapturing ? (
              <button
                onClick={handleStart}
                disabled={isBusy}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  isBusy
                    ? 'bg-border text-textSecondary cursor-not-allowed'
                    : 'bg-secondary hover:brightness-110 text-white'
                }`}
              >
                Start Capture
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-6 py-3 bg-danger hover:brightness-110 text-white rounded-lg font-semibold transition-all duration-200"
              >
                Stop &amp; Analyze
              </button>
            )}
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${isCapturing ? 'bg-secondary/20 text-secondary' : 'bg-border text-textSecondary'}`}>
              {isCapturing ? `● Capturing (${status.capture?.seconds ?? 0}s)` : '○ Idle'}
            </span>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <p className="text-xs text-textSecondary mt-2">
            Requires Scapy and Npcap (Windows) / libpcap (Linux). Run as administrator if needed.
          </p>
        </div>

        <ProgressBar status={status} />

        {showEmptyOrError && (
          <div className="bg-surface border border-border rounded-xl p-10 mb-8 text-center">
            <FiAlertTriangle className="mx-auto text-3xl text-accent mb-3" />
            <h3 className="text-lg font-semibold text-text mb-1">
              {isError ? 'Analysis failed' : 'No flow data captured'}
            </h3>
            <p className="text-sm text-textSecondary">
              {isError
                ? (status.error || 'Something went wrong while analyzing the capture.')
                : 'The capture finished but no usable flows were recorded. Try capturing for longer, or check Scapy/Npcap permissions.'}
            </p>
          </div>
        )}

        {hasData && (
          <>
            <TabNav tabs={LIVE_TABS} active={activeTab} onChange={setActiveTab} />

            {/* TRAFFIC — one chart with a Packets/s|Bytes/s|Duration toggle */}
            {activeTab === 'traffic' && (
              <div className="bg-surface rounded-lg shadow-card p-5 mb-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-border">
                  <h2 className="text-lg font-semibold text-primary">Traffic flow — BENIGN vs DDoS</h2>
                  <SegmentedToggle options={TRAFFIC_METRICS} value={trafficMetric} onChange={setTrafficMetric} />
                </div>
                <div className="h-[420px] w-full">
                  <BenignDDoSChart
                    data={trafficData}
                    maxSeconds={maxSeconds}
                    metric={trafficMetric}
                    metricLabel={TRAFFIC_METRICS.find((mo) => mo.key === trafficMetric)?.label}
                    markers={markers}
                  />
                </div>
              </div>
            )}

            {/* ALERTS — one chart with a Low|Medium|High toggle */}
            {activeTab === 'alerts' && (
              <div className="bg-surface rounded-lg shadow-card p-5 mb-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-2 border-b border-border">
                  <h2 className="text-lg font-semibold text-primary">
                    {ALERT_LEVELS.find((l) => l.key === alertLevel)?.label}
                  </h2>
                  <SegmentedToggle options={ALERT_LEVELS} value={alertLevel} onChange={setAlertLevel} />
                </div>
                <div className="h-[420px] w-full">
                  <AlertLevelChart data={trafficData} maxSeconds={maxSeconds} level={alertLevel} markers={markers} />
                </div>
              </div>
            )}

            {/* SUMMARY — alert counts + model thresholds */}
            {activeTab === 'summary' && (
              <>
                <div className="mb-6">
                  <AlertSummaryCards
                    traffic={trafficData}
                    attackStart={markers.attackStart}
                    attackPeak={markers.attackPeak}
                    showTiming={false}
                  />
                </div>
                {thresholds && (
                  <div className="mb-6">
                    <ThresholdsCard thresholds={thresholds} />
                  </div>
                )}
              </>
            )}

            {/* DATA — per-second table with CSV export */}
            {activeTab === 'data' && (
              <div className="bg-surface/80 rounded-2xl shadow-card p-6 mb-14 backdrop-blur-md border border-border">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-primary">Per-Second Data</h2>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={handleExportCsv}
                      disabled={exporting}
                      className={`flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium transition-colors duration-200 ${
                        exporting
                          ? 'bg-background text-textSecondary cursor-not-allowed'
                          : 'bg-background hover:bg-border text-textSecondary hover:text-primary'
                      }`}
                    >
                      <FiDownload />
                      {exporting ? 'Saving…' : 'Export CSV'}
                    </button>
                    {exportNote && (
                      <span className={`text-xs ${exportNote.ok ? 'text-secondary' : 'text-danger'}`}>
                        {exportNote.text}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ag-theme-alpine dark-ag-grid font-sans rounded-lg overflow-hidden" style={{ height: 500, width: '100%' }}>
                  <AgGridReact
                    rowData={trafficData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    modules={[ClientSideRowModelModule]}
                    pagination
                    paginationPageSize={20}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default LiveCapture;
