import { useCallback, useEffect, useState } from 'react';
import {
  PlayIcon, StopIcon, ArrowPathIcon, DocumentArrowDownIcon,
  NoSymbolIcon, TrashIcon, EnvelopeIcon, PaperAirplaneIcon, PlusIcon,
} from '@heroicons/react/24/outline';
import {
  getStatus, startCapture, stopCapture, resetEngine,
  getBlockedIps, blockIp, unblockIp, getAlerts, reportUrl, describeError,
  getEmailSettings, addEmailRecipient, removeEmailRecipient, setEmailEnabled, sendTestEmail,
  getStorageInfo,
} from '../api/ews';
import PageHeader from '../components/ui/PageHeader';
import ThreatBadge from '../components/ui/ThreatBadge';

// Admin Panel: capture control, log viewer, report downloads, blocked-IP manager.
export default function AdminPanel() {
  const [status, setStatus] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [email, setEmail] = useState(null);
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState(null);
  const [logs, setLogs] = useState([]);
  const [newIp, setNewIp] = useState('');
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [storage, setStorage] = useState(null);

  const refreshBlocked = useCallback(async () => {
    try {
      const d = await getBlockedIps();
      setBlocked(d.blocked || []);
    } catch (e) { setError(describeError(e)); }
  }, []);

  const refreshEmail = useCallback(async () => {
    try { setEmail(await getEmailSettings()); }
    catch (e) { setError(describeError(e)); }
  }, []);

  const refreshStorage = useCallback(async () => {
    try { setStorage(await getStorageInfo()); }
    catch (e) { setError(describeError(e)); }
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const d = await getAlerts({ limit: 15 });
      setLogs(d.alerts || []);
    } catch (e) { setError(describeError(e)); }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try { const s = await getStatus(); if (alive) setStatus(s); } catch { /* ignore */ }
    };
    tick();
    refreshBlocked();
    refreshLogs();
    refreshEmail();
    refreshStorage();
    const id = setInterval(() => { tick(); refreshLogs(); refreshStorage(); }, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [refreshBlocked, refreshLogs, refreshEmail, refreshStorage]);

  const capturing = status?.capture?.capturing;

  const doStart = async () => { try { setMsg(null); await startCapture(); } catch (e) { setError(describeError(e)); } };
  const doStop = async () => { try { setMsg('Stopping and running final analysis…'); await stopCapture(); setMsg('Capture stopped.'); refreshLogs(); } catch (e) { setError(describeError(e)); } };
  const doReset = async () => { try { await resetEngine(); setMsg('Engine reset to idle.'); } catch (e) { setError(describeError(e)); } };

  const addIp = async (e) => {
    e.preventDefault();
    if (!newIp.trim()) return;
    try { await blockIp(newIp.trim(), 'Manual (admin panel)'); setNewIp(''); refreshBlocked(); }
    catch (err) { setError(describeError(err)); }
  };
  const removeIp = async (ip) => { try { await unblockIp(ip); refreshBlocked(); } catch (e) { setError(describeError(e)); } };

  const addEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    try { setEmailMsg(null); setEmail(await addEmailRecipient(newEmail.trim())); setNewEmail(''); }
    catch (err) { setEmailMsg(describeError(err)); }
  };
  const removeEmail = async (addr) => {
    try { setEmail(await removeEmailRecipient(addr)); } catch (e) { setEmailMsg(describeError(e)); }
  };
  const toggleEmail = async () => {
    try { setEmail(await setEmailEnabled(!email?.enabled)); } catch (e) { setEmailMsg(describeError(e)); }
  };
  const testEmail = async () => {
    try {
      setEmailMsg('Sending test…');
      const r = await sendTestEmail();
      setEmailMsg(r.sent ? `Test sent to ${r.recipients.join(', ')}.` : `Not sent: ${r.reason}`);
    } catch (e) { setEmailMsg(describeError(e)); }
  };

  const download = (fmt) => { window.open(reportUrl(fmt), '_blank'); };

  const fmtBytes = (n) => {
    if (!n && n !== 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-[100dvh] bg-background bg-ambient">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <PageHeader eyebrow="Control" title="Admin Panel"
          subtitle="Start or stop capture, review logs, download reports, and manage blocked IPs." />

        {error && <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</div>}
        {msg && <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">{msg}</div>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Capture control */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Packet capture</h2>
            <div className="mb-4 flex items-center gap-2 text-sm text-textSecondary">
              <span className={`h-2.5 w-2.5 rounded-full ${capturing ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`} />
              {capturing ? 'Capturing' : `Status: ${status?.status || 'idle'}`}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={doStart} disabled={capturing}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40">
                <PlayIcon className="h-4 w-4" /> Start
              </button>
              <button type="button" onClick={doStop} disabled={!capturing}
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-40">
                <StopIcon className="h-4 w-4" /> Stop
              </button>
              <button type="button" onClick={doReset}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surfaceElevated px-4 py-2 text-sm font-semibold text-textSecondary hover:text-text">
                <ArrowPathIcon className="h-4 w-4" /> Reset
              </button>
            </div>
            <p className="mt-3 text-xs text-textSecondary">
              Live capture requires the Npcap driver + capture privileges on the host running the backend.
              The Windows installer bundles and installs Npcap for you (Nmap installs Npcap too), and the app runs elevated.
            </p>
          </section>

          {/* Reports */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Generate reports</h2>
            <p className="mb-4 text-sm text-textSecondary">Download the full alert log.</p>
            <div className="flex flex-wrap gap-3">
              {[['CSV', 'csv'], ['Excel', 'xlsx'], ['PDF', 'pdf']].map(([label, fmt]) => (
                <button key={fmt} type="button" onClick={() => download(fmt)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-surfaceElevated px-4 py-2 text-sm font-semibold text-text hover:border-primary/40">
                  <DocumentArrowDownIcon className="h-4 w-4 text-primary" /> {label}
                </button>
              ))}
            </div>
          </section>

          {/* Storage location */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-2 font-display text-lg font-semibold text-text">Data storage location</h2>
            <p className="mb-3 text-xs text-textSecondary">
              Where your Live Traffic and Uploaded-CSV results are saved on this machine.
            </p>
            {storage ? (
              <>
                <div className="mb-3 rounded-lg border border-border bg-surfaceElevated px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-textSecondary">Results folder (CSV)</div>
                  <code className="block break-all font-mono text-xs text-text">{storage.results_dir}</code>
                </div>
                {storage.csv_files?.length ? (
                  <ul className="max-h-40 divide-y divide-border overflow-auto">
                    {storage.csv_files.map((f) => (
                      <li key={f.name} className="flex items-center justify-between gap-2 py-1.5 font-mono text-xs">
                        <span className="truncate text-text">{f.name}</span>
                        <span className="shrink-0 text-textSecondary">{fmtBytes(f.size)} · {f.modified}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-textSecondary">No CSV files stored yet.</p>
                )}
                {storage.frozen && (
                  <p className="mt-3 text-[11px] text-textSecondary">
                    Packaged app: data lives outside Program Files (per-user), so it stays writable.
                    Set the <code className="font-mono">EWS_DATA_DIR</code> environment variable to choose a custom folder.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-textSecondary">Loading…</p>
            )}
          </section>

          {/* Email notifications */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-text">
                <EnvelopeIcon className="h-5 w-5 text-primary" /> Email notifications
              </h2>
              {/* On/off toggle */}
              <button type="button" onClick={toggleEmail} role="switch" aria-checked={!!email?.enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${email?.enabled ? 'bg-green-500' : 'bg-slate-500/50'}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${email?.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <p className="mb-3 text-xs text-textSecondary">
              SMTP transport:{' '}
              <span className={email?.configured ? 'text-green-500' : 'text-amber-500'}>
                {email?.configured ? `configured (${email.smtp_host})` : 'not configured — set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS'}
              </span>
              {' · '}Notifications <span className={email?.enabled ? 'text-green-500' : 'text-amber-500'}>{email?.enabled ? 'ON' : 'OFF'}</span>
            </p>

            <form onSubmit={addEmail} className="mb-3 flex gap-2">
              <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                placeholder="admin@example.com"
                className="flex-1 rounded-lg border border-border bg-surfaceElevated px-3 py-2 text-sm text-text placeholder:text-textSecondary" />
              <button type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                <PlusIcon className="h-4 w-4" /> Add
              </button>
            </form>

            {(email?.recipients?.length || email?.env_recipients?.length) ? (
              <ul className="mb-3 divide-y divide-border">
                {(email?.env_recipients || []).map((addr) => (
                  <li key={`env-${addr}`} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-text">{addr}</span>
                    <span className="text-[11px] uppercase tracking-wide text-textSecondary">from env</span>
                  </li>
                ))}
                {(email?.recipients || []).map((r) => (
                  <li key={r.email} className="flex items-center justify-between py-2 text-sm">
                    <span className="font-mono text-text">{r.email}</span>
                    <button type="button" onClick={() => removeEmail(r.email)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-textSecondary hover:text-red-500">
                      <TrashIcon className="h-4 w-4" /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-textSecondary">No recipients yet. Add an email to receive HIGH alerts.</p>
            )}

            <div className="flex items-center gap-3">
              <button type="button" onClick={testEmail}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surfaceElevated px-4 py-2 text-sm font-semibold text-text hover:border-primary/40">
                <PaperAirplaneIcon className="h-4 w-4 text-primary" /> Send test
              </button>
              {emailMsg && <span className="text-xs text-textSecondary">{emailMsg}</span>}
            </div>
          </section>

          {/* Blocked IPs */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Blocked IPs</h2>
            <form onSubmit={addIp} className="mb-4 flex gap-2">
              <input value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="e.g. 10.0.0.5"
                className="flex-1 rounded-lg border border-border bg-surfaceElevated px-3 py-2 text-sm text-text placeholder:text-textSecondary" />
              <button type="submit"
                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
                <NoSymbolIcon className="h-4 w-4" /> Block
              </button>
            </form>
            {blocked.length === 0 ? (
              <p className="text-sm text-textSecondary">No IPs blocked.</p>
            ) : (
              <ul className="divide-y divide-border">
                {blocked.map((b) => (
                  <li key={b.ip} className="flex items-center justify-between py-2.5">
                    <span>
                      <span className="font-mono text-sm text-text">{b.ip}</span>
                      {b.reason && <span className="ml-2 text-xs text-textSecondary">{b.reason}</span>}
                    </span>
                    <button type="button" onClick={() => removeIp(b.ip)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-textSecondary hover:text-red-500">
                      <TrashIcon className="h-4 w-4" /> Unblock
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Logs */}
          <section className="rounded-xl border border-border bg-surface/70 p-5 shadow-card">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Recent logs</h2>
            <div className="max-h-72 overflow-auto">
              {logs.length === 0 ? (
                <p className="text-sm text-textSecondary">No alerts logged yet.</p>
              ) : (
                <ul className="space-y-2 font-mono text-xs">
                  {logs.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 border-b border-border pb-2">
                      <span className="text-textSecondary">{a.created_at}</span>
                      <span className="truncate">{a.source_ip || '-'} → {a.destination_ip || '-'}</span>
                      <ThreatBadge level={a.level} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
