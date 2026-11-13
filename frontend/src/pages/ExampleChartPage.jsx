import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgGridReact } from '@ag-grid-community/react';
import { ClientSideRowModelModule } from '@ag-grid-community/client-side-row-model';
import '@ag-grid-community/styles/ag-grid.css';
import '@ag-grid-community/styles/ag-theme-alpine.css';
import { FiUpload, FiFile, FiActivity, FiRefreshCw, FiDownload, FiAlertTriangle } from 'react-icons/fi';

import useDltAnalysis from '../hooks/useDltAnalysis';
import ProgressBar from '../components/dlt/ProgressBar';
import BenignDDoSChart from '../components/dlt/BenignDDoSChart';
import AlertLevelChart from '../components/dlt/AlertLevelChart';
import ThresholdsCard from '../components/dlt/ThresholdsCard';
import AlertSummaryCards from '../components/dlt/AlertSummaryCards';
import ConfusionMatrixPanel from '../components/dlt/ConfusionMatrixPanel';
import { computeAttackMarkers } from '../components/dlt/attackMarkers';
import { TabNav, SegmentedToggle, TRAFFIC_METRICS, ALERT_LEVELS } from '../components/dlt/SectionControls';
import { exportTrafficCsv } from '../api/dltExport';

// CSV Analysis page (Prevention -> "Dataset Upload" -> /flow-analysis).

const ChartWrapper = ({ children, title }) => (
  <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl shadow-card overflow-hidden mb-8">
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-8 bg-primary rounded-full" />
        <h2 className="text-2xl font-bold text-text">{title}</h2>
      </div>
      <div className="h-[440px] w-full">{children}</div>
    </div>
  </div>
);

const Card = ({ children, title }) => (
  <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl shadow-card overflow-hidden mb-8">
    <div className="p-6 sm:p-8">
      {title && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <h2 className="text-2xl font-bold text-text">{title}</h2>
        </div>
      )}
      {children}
    </div>
  </div>
);

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

// The result view is split into these sub-sections (one visible at a time).
const TABS = [
  { key: 'traffic', label: 'Traffic' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'summary', label: 'Summary' },
  { key: 'matrices', label: 'Matrices' },
  { key: 'data', label: 'Data' },
];

const ExampleChartPage = () => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('traffic');
  const [trafficMetric, setTrafficMetric] = useState('FlowPackets_s');
  const [alertLevel, setAlertLevel] = useState('LOW');
  const [exportNote, setExportNote] = useState(null);
  const [exporting, setExporting] = useState(false);
  const {
    status, error, uploadCsv, reset, isBusy, isDone, isError,
    trafficData, maxSeconds, thresholds,
  } = useDltAnalysis();

  // Attack window (first/last DDoS second + peak intensity), shared by every chart,
  // the alert-timing summary, and the attack-phase confusion matrix.
  const markers = useMemo(() => computeAttackMarkers(trafficData), [trafficData]);

  const handleFileChange = (e) => setFile(e.target.files[0] || null);

  const acceptFile = (f) => {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.csv')) return;
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  const handleProcess = async () => {
    if (!file) return;
    try {
      await uploadCsv(file);
    } catch {
      // error surfaced via hook state
    }
  };

  const handleStartOver = async () => {
    await reset();
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Ask the backend to write the per-second table into backend/dlt_results/.
  const handleExportCsv = async () => {
    setExportNote(null);
    setExporting(true);
    try {
      const out = await exportTrafficCsv({
        filename: 'per-second-data.csv',
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

  const defaultColDef = useMemo(() => ({ flex: 1, minWidth: 120, resizable: true }), []);
  const dataProcessed = trafficData.length > 0;
  const showEmptyOrError = !dataProcessed && (isDone || isError);

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient text-text font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none z-0 opacity-30 bg-grid" aria-hidden="true" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
          <div>
            <h1 className="font-display text-4xl md:text-5xl font-semibold text-text tracking-tightest mb-3">
              Network traffic <span className="text-primary">analyzer</span>
            </h1>
            <p className="text-textSecondary text-lg max-w-2xl text-pretty">
              Upload network traffic CSV data. The early-warning pipeline reads
              the full file, then flags LOW/MEDIUM/HIGH severity seconds against its
              learned benign baseline.
            </p>
          </div>
          <div className="flex gap-3">
            {(dataProcessed || isBusy) && (
              <button
                onClick={handleStartOver}
                className="flex items-center gap-2 px-5 py-3 bg-surfaceElevated hover:bg-surface border border-border rounded-lg text-textSecondary hover:text-text transition-all duration-200 font-medium"
              >
                <FiRefreshCw className="text-lg" />
                Start over
              </button>
            )}
            <button
              onClick={() => navigate('/prevention')}
              className="flex items-center gap-2 px-5 py-3 bg-surfaceElevated hover:bg-surface border border-border rounded-lg text-textSecondary hover:text-text transition-all duration-200 font-medium"
            >
              Back
            </button>
          </div>
        </div>

        {/* Upload area */}
        <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl shadow-card overflow-hidden mb-8">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-textSecondary mb-2">Select CSV file</label>
                <label
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ${
                    dragOver
                      ? 'border-primary bg-primary/10'
                      : file
                        ? 'border-secondary bg-secondary/10'
                        : 'border-border bg-background hover:bg-surfaceElevated'
                  }`}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4">
                    <FiUpload className="w-8 h-8 mb-2 text-textSecondary" />
                    <p className="mb-2 text-sm text-textSecondary">
                      <span className="font-semibold text-text">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-textSecondary/80">Requires: Timestamp, Label, and flow feature columns</p>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
                </label>
                {file && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-text">
                    <FiFile className="text-primary" />
                    <span className="truncate max-w-xs">{file.name}</span>
                  </div>
                )}
              </div>
              <button
                onClick={handleProcess}
                disabled={!file || isBusy}
                className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
                  !file || isBusy
                    ? 'bg-surfaceElevated text-textSecondary cursor-not-allowed'
                    : 'bg-primary text-background hover:brightness-110 active:scale-[0.98] shadow-neon'
                }`}
              >
                <FiActivity className="text-lg" />
                {isBusy ? 'Analyzing...' : 'Process data'}
              </button>
            </div>
            {error && <p className="text-sm text-danger mt-4">{error}</p>}
          </div>
        </div>

        <ProgressBar status={status} />

        {showEmptyOrError && (
          <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl p-10 mb-8 text-center">
            <FiAlertTriangle className="mx-auto text-3xl text-accent mb-3" />
            <h3 className="text-lg font-semibold text-text mb-1">
              {isError ? 'Analysis failed' : 'No traffic data in the result'}
            </h3>
            <p className="text-sm text-textSecondary">
              {isError
                ? (status.error || 'Something went wrong while analyzing this file.')
                : 'The pipeline finished but produced no per-second rows. Check that the CSV has enough rows and valid Timestamp values.'}
            </p>
          </div>
        )}

        {dataProcessed && (
          <>
            <TabNav tabs={TABS} active={activeTab} onChange={setActiveTab} />

            {/* TRAFFIC — one consolidated chart with a Packets/s|Bytes/s|Duration toggle */}
            {activeTab === 'traffic' && (
              <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl shadow-card overflow-hidden mb-8">
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-8 bg-primary rounded-full" />
                      <h2 className="text-2xl font-bold text-text">Traffic flow — Normal vs DDoS</h2>
                    </div>
                    <SegmentedToggle options={TRAFFIC_METRICS} value={trafficMetric} onChange={setTrafficMetric} />
                  </div>
                  <div className="h-[440px] w-full">
                    <BenignDDoSChart
                      data={trafficData}
                      maxSeconds={maxSeconds}
                      metric={trafficMetric}
                      metricLabel={TRAFFIC_METRICS.find((mo) => mo.key === trafficMetric)?.label}
                      markers={markers}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ALERTS — one chart with a Low|Medium|High toggle (like the Traffic split) */}
            {activeTab === 'alerts' && (
              <div className="bg-surface/70 backdrop-blur-sm border border-border rounded-xl shadow-card overflow-hidden mb-8">
                <div className="p-6 sm:p-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-1 h-8 bg-primary rounded-full" />
                      <h2 className="text-2xl font-bold text-text">
                        {ALERT_LEVELS.find((l) => l.key === alertLevel)?.label}
                      </h2>
                    </div>
                    <SegmentedToggle options={ALERT_LEVELS} value={alertLevel} onChange={setAlertLevel} />
                  </div>
                  <div className="h-[440px] w-full">
                    <AlertLevelChart data={trafficData} maxSeconds={maxSeconds} level={alertLevel} markers={markers} />
                  </div>
                </div>
              </div>
            )}

            {/* SUMMARY — alert counts/timelines + model thresholds */}
            {activeTab === 'summary' && (
              <>
                <Card>
                  <AlertSummaryCards
                    traffic={trafficData}
                    attackStart={markers.attackStart}
                    attackPeak={markers.attackPeak}
                    showTiming
                  />
                </Card>
                {thresholds && (
                  <Card>
                    <ThresholdsCard thresholds={thresholds} />
                  </Card>
                )}
              </>
            )}

            {/* MATRICES — Attack / Normal / Till-peak confusion matrices */}
            {activeTab === 'matrices' && (
              <ConfusionMatrixPanel traffic={trafficData} markers={markers} />
            )}

            {/* DATA — per-second table with CSV export */}
            {activeTab === 'data' && (
              <Card>
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-primary rounded-full" />
                    <h2 className="text-2xl font-bold text-text">Per-second data</h2>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={handleExportCsv}
                      disabled={exporting}
                      className={`flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium transition-colors duration-200 ${
                        exporting
                          ? 'bg-surfaceElevated text-textSecondary cursor-not-allowed'
                          : 'bg-surfaceElevated hover:bg-surface text-textSecondary hover:text-text'
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
                <div className="ag-theme-alpine font-sans rounded-lg overflow-hidden" style={{ height: 500, width: '100%' }}>
                  <AgGridReact
                    rowData={trafficData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    modules={[ClientSideRowModelModule]}
                    pagination
                    paginationPageSize={20}
                    animateRows
                  />
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ExampleChartPage;
