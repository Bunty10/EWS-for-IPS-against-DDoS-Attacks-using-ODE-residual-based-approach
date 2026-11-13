import axios from 'axios';

// Ask the DLT-NN backend to write the per-second table to a CSV inside
// backend/dlt_results/. Goes through the same Vite proxy as the rest of the
// engine (/api/dlt -> :5001). `columns` fixes the column order/headers to match
// the on-screen grid; `rows` are the traffic_data objects.
const API_BASE = '/api/dlt';

export async function exportTrafficCsv({ filename, columns, rows }) {
  const res = await axios.post(`${API_BASE}/export`, { filename, columns, rows });
  return res.data; // { status, filename, path, rows }
}
