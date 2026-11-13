import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

// DLT-NN engine (ported from EWS-Approach-v1's backend), served by its own process
// (backend/dlt_app.py, default port 5001) kept separate from the existing app.py
// (port 5000) -- see dlt_app.py's docstring for why.
//
// Calls go through the Vite dev proxy (vite.config.js: '/api/dlt' -> :5001), so this
// hook uses a relative base -- no CORS, no hardcoded host, works the same in prod
// once backend/dlt_app.py is reverse-proxied the same way.
//
// See backend/dlt/service.py for the workflow this hook drives:
//   CSV upload -> POST /upload (complete read, analysis starts server-side)
//   Live capture -> POST /capture/start ... POST /capture/stop (stop -> save -> analyze)
// Both flows are then polled the same way via GET /status, which is what makes the
// results feel continuous in the UI even though CSV upload runs v1's "read the whole
// file, then analyze" workflow under the hood.
const API_BASE = '/api/dlt';
const POLL_INTERVAL_MS = 1000;

const INITIAL_STATUS = {
  job_type: null,
  status: 'idle',
  message: '',
  progress: { seconds_revealed: 0, max_seconds: 0, pct: 0 },
  capture: { capturing: false, seconds: 0, last_error: null },
  result: null,
  error: null,
};

// Friendlier wording for the one connection failure people actually hit in local dev:
// forgetting to start the second backend process.
function describeError(err, fallback) {
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
    return `Can't reach the DLT-NN engine. Make sure it's running: cd backend && python dlt_app.py (port 5001).`;
  }
  return err.response?.data?.error || err.message || fallback;
}

function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Web Audio unavailable (e.g. autoplay policy before any user gesture) -- silent no-op.
  }
}

export default function useDltAnalysis() {
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const seenHighSecondsRef = useRef(new Set());

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollOnce = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/status`);
      setStatus(res.data);

      // Live alert: beep the first time a HIGH-severity second appears that we
      // haven't already announced (v1's Results.jsx did the same during graph
      // playback; here it fires as real new data arrives during live capture).
      const traffic = res.data?.result?.test1?.traffic_data;
      if (Array.isArray(traffic)) {
        for (const row of traffic) {
          if (row.Warning === 'HIGH' && !seenHighSecondsRef.current.has(row.second)) {
            seenHighSecondsRef.current.add(row.second);
            if (res.data.status === 'capturing') playAlertBeep();
          }
        }
      }

      const s = res.data.status;
      if (s === 'done' || s === 'error') {
        stopPolling();
      }
      return res.data;
    } catch (err) {
      setError(describeError(err, 'Failed to poll analysis status.'));
      return null;
    }
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(pollOnce, POLL_INTERVAL_MS);
  }, [pollOnce, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const uploadCsv = useCallback(async (file) => {
    setError(null);
    setStatus(INITIAL_STATUS);
    seenHighSecondsRef.current.clear();
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post(`${API_BASE}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await pollOnce();
      startPolling();
    } catch (err) {
      setError(describeError(err, 'Upload failed.'));
      throw err;
    }
  }, [pollOnce, startPolling]);

  const startCapture = useCallback(async () => {
    setError(null);
    setStatus(INITIAL_STATUS);
    seenHighSecondsRef.current.clear();
    try {
      const res = await axios.post(`${API_BASE}/capture/start`);
      if (res.data?.error) {
        setError(res.data.error);
        return;
      }
      startPolling();
    } catch (err) {
      setError(describeError(err, 'Failed to start capture.'));
      throw err;
    }
  }, [startPolling]);

  const stopCapture = useCallback(async () => {
    setError(null);
    try {
      // Stop performs v1's stop -> save -> analyze synchronously; keep polling through
      // it so the UI sees the "analyzing" status transition and then the final result.
      const stopPromise = axios.post(`${API_BASE}/capture/stop`);
      startPolling();
      const res = await stopPromise;
      await pollOnce();
      if (res.data?.error && !res.data?.results) {
        setError(res.data.error);
      }
    } catch (err) {
      setError(describeError(err, 'Failed to stop capture.'));
      throw err;
    }
  }, [pollOnce, startPolling]);

  const reset = useCallback(async () => {
    stopPolling();
    setStatus(INITIAL_STATUS);
    setError(null);
    seenHighSecondsRef.current.clear();
    try {
      await axios.post(`${API_BASE}/reset`);
    } catch {
      // best-effort
    }
  }, [stopPolling]);

  const test1 = status.result?.test1 ?? null;

  return {
    status,
    error,
    uploadCsv,
    startCapture,
    stopCapture,
    reset,
    isBusy: status.status === 'processing' || status.status === 'capturing' || status.status === 'analyzing',
    isDone: status.status === 'done',
    isError: status.status === 'error',
    isIdle: status.status === 'idle',
    trafficData: test1?.traffic_data ?? [],
    maxSeconds: test1?.max_seconds ?? 0,
    warnings: test1?.warnings ?? {},
    thresholds: test1?.thresholds ?? null,
    detectionRate: test1?.detection_rate,
    falsePositiveRate: test1?.false_positive_rate,
    firstLow: test1?.first_low,
    firstMed: test1?.first_med,
    firstHigh: test1?.first_high,
    lastLow: test1?.last_low,
    lastMed: test1?.last_med,
    lastHigh: test1?.last_high,
    peakSec: test1?.peak_sec,
    peakVal: test1?.peak_val,
  };
}
