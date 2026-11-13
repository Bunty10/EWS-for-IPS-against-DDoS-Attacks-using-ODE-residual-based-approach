import axios from 'axios';

// Single client for every EWS backend endpoint. All calls are relative to
// /api/dlt so they flow through the Vite proxy (→ :5001) in dev and a matching
// reverse-proxy in prod — no CORS, no hard-coded host. See vite.config.js.
const API_BASE = '/api/dlt';

const client = axios.create({ baseURL: API_BASE });

// Friendly message for the one failure people actually hit locally: forgetting
// to start the backend process.
export function describeError(err, fallback = 'Request failed.') {
  if (err?.code === 'ERR_NETWORK' || err?.message === 'Network Error') {
    return "Can't reach the EWS engine. Start it with: cd backend && python dlt_app.py (port 5001).";
  }
  return err?.response?.data?.error || err?.message || fallback;
}

// ── Dashboard & live monitoring ──────────────────────────────────────────────
export const getDashboard = () => client.get('/dashboard').then((r) => r.data);
export const getLiveMonitor = (limit = 50) =>
  client.get('/live/monitor', { params: { limit } }).then((r) => r.data);

// ── Analysis workflow (shared with useDltAnalysis) ──────────────────────────
export const getStatus = () => client.get('/status').then((r) => r.data);

// ── Alerts ───────────────────────────────────────────────────────────────────
export const getAlerts = (params = {}) => client.get('/alerts', { params }).then((r) => r.data);
export const getAlert = (id) => client.get(`/alerts/${id}`).then((r) => r.data);

// ── Statistics / recommendations / ML info / topology ───────────────────────
export const getStatistics = (sessionId) =>
  client.get('/statistics', { params: sessionId ? { session_id: sessionId } : {} }).then((r) => r.data);
export const getRecommendations = () => client.get('/recommendations').then((r) => r.data);
export const getMlInfo = () => client.get('/ml-info').then((r) => r.data);
export const getTopology = (sessionId) =>
  client.get('/topology', { params: sessionId ? { session_id: sessionId } : {} }).then((r) => r.data);

// ── Admin ────────────────────────────────────────────────────────────────────
export const getBlockedIps = () => client.get('/admin/blocked-ips').then((r) => r.data);
export const blockIp = (ip, reason) => client.post('/admin/blocked-ips', { ip, reason }).then((r) => r.data);
export const unblockIp = (ip) => client.delete(`/admin/blocked-ips/${encodeURIComponent(ip)}`).then((r) => r.data);
export const startCapture = () => client.post('/capture/start').then((r) => r.data);
export const stopCapture = () => client.post('/capture/stop').then((r) => r.data);
export const resetEngine = () => client.post('/reset').then((r) => r.data);
export const getStorageInfo = () => client.get('/admin/storage').then((r) => r.data);

// ── Email notifications (admin) ──────────────────────────────────────────────
export const getEmailSettings = () => client.get('/admin/email').then((r) => r.data);
export const addEmailRecipient = (email) => client.post('/admin/email/recipients', { email }).then((r) => r.data);
export const removeEmailRecipient = (email) =>
  client.delete(`/admin/email/recipients/${encodeURIComponent(email)}`).then((r) => r.data);
export const setEmailEnabled = (enabled) => client.post('/admin/email/toggle', { enabled }).then((r) => r.data);
export const sendTestEmail = (to) => client.post('/admin/email/test', to ? { to } : {}).then((r) => r.data);

// Report download URL (opened directly so the browser saves the file).
export const reportUrl = (format = 'csv', sessionId) => {
  const q = new URLSearchParams({ format });
  if (sessionId) q.set('session_id', sessionId);
  return `${API_BASE}/admin/report?${q.toString()}`;
};

export default client;
