import { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { getStatistics, describeError } from '../api/ews';
import { useChartTheme } from '../theme/ThemeContext';
import { THREAT, threat } from '../theme/threatColors';
import PageHeader from '../components/ui/PageHeader';

// Attack / Alert Statistics — pie (severity mix), line (alerts over time),
// bar (top source IPs). All data comes from the SQLite alert store.
export default function Statistics() {
  const chart = useChartTheme();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    getStatistics()
      .then((d) => { if (alive) { setStats(d); setError(null); } })
      .catch((e) => { if (alive) setError(describeError(e)); });
    return () => { alive = false; };
  }, []);

  const breakdown = stats?.level_breakdown || {};
  const pieData = ['HIGH', 'MED', 'LOW'].map((k) => ({ name: threat(k).label, level: k, value: breakdown[k] || 0 }))
    .filter((d) => d.value > 0);
  const lineData = (stats?.over_time || []).map((a, i) => ({
    idx: i + 1,
    confidence: a.confidence != null ? Math.round(a.confidence * 100) : 0,
    level: a.level,
  }));
  const barData = (stats?.top_source_ips || []).map((d) => ({ ip: d.source_ip, count: d.count }));
  const totals = stats?.totals || {};

  const tooltipStyle = {
    backgroundColor: chart.tooltipBg, border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 8, color: chart.tooltipText, fontSize: 12,
  };

  // Pie slice labels are drawn on the page background, so their color must follow
  // the theme (default black is invisible in dark mode). Same for legend text.
  const renderPieLabel = ({ name, value, percent }) => `${name}: ${value} (${Math.round(percent * 100)}%)`;
  const legendFormatter = (value) => <span style={{ color: chart.axisLabel }}>{value}</span>;

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Analytics" title="Attack & Alert Statistics"
          subtitle="Severity distribution, alert trend, and the busiest attacking sources." />

        {error && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}

        {/* Totals row */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[['Total alerts', totals.alerts, 'text-primary'], ['High', totals.HIGH, 'text-red-500'],
            ['Medium', totals.MED, 'text-amber-500'], ['Low', totals.LOW, 'text-green-500']].map(([label, v, c]) => (
            <div key={label} className="rounded-xl border border-border bg-surface/70 p-4 text-center shadow-card">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-textSecondary">{label}</p>
              <p className={`mt-1 font-mono text-2xl font-semibold ${c}`}>{v ?? 0}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Pie: severity mix */}
          <ChartCard title="Severity distribution (Pie)">
            {pieData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    outerRadius={100} label={renderPieLabel} labelLine={{ stroke: chart.axis }}
                    stroke={chart.tooltipBg} strokeWidth={2}>
                    {pieData.map((d) => <Cell key={d.level} fill={THREAT[d.level].hex} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: chart.tooltipText }} />
                  <Legend formatter={legendFormatter} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Bar: top source IPs */}
          <ChartCard title="Top attacking source IPs (Bar)">
            {barData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={barData} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="ip" tick={{ fill: chart.axis, fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} tick={{ fill: chart.axis, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: chart.grid }} />
                  <Bar dataKey="count" fill={chart.ddos} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Line: alerts over time */}
          <ChartCard title="Alert confidence over time (Line)" wide>
            {lineData.length === 0 ? <Empty /> : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={lineData} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis dataKey="idx" tick={{ fill: chart.axis, fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: chart.axis, fontSize: 11 }} unit="%" />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="confidence" stroke={chart.ddos} strokeWidth={2} dot={false} name="Confidence %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, wide }) {
  return (
    <div className={`rounded-xl border border-border bg-surface/70 p-5 shadow-card ${wide ? 'lg:col-span-2' : ''}`}>
      <h2 className="mb-4 font-display text-lg font-semibold text-text">{title}</h2>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="flex h-[300px] items-center justify-center text-sm text-textSecondary">No alert data yet.</div>;
}
