"""
Live network packet capture — aggregates packets into the per-flow feature rows the analysis pipeline expects.
Requires: scapy (pip install scapy). On Windows, the Npcap packet-capture driver
(https://npcap.com) must also be installed at runtime — this is the usual reason
capture "works on the dev machine but not on a client PC". The packaged Windows
installer bundles Npcap and installs it during setup; see installer/ews.iss.
"""
import os
import sys
import threading
import time
import numpy as np
import pandas as pd
from scapy.layers.inet import IP, TCP, UDP
try:
    from scapy.layers.inet6 import IPv6
except Exception:  # noqa: BLE001 - IPv6 layer should always be present, but never fail import
    IPv6 = None
from pathlib import Path
from datetime import datetime
from collections import defaultdict

_capture_thread = None
_stop_event = threading.Event()
_capture_data = defaultdict(lambda: {"packets": 0, "bytes": 0})
_capture_start = None
_capture_file = None
_capture_last_error = None

_flows = defaultdict(lambda: {
    "timestamps": [],
    "sizes": [],
    "src_ip": None,
    "dst_ip": None,
    "proto": None,
    "src_port": None,
    "dst_port": None,
})


def _is_windows():
    return sys.platform.startswith("win")


# Actionable message shown in the UI when packet capture can't run because the
# Npcap driver is missing (the #1 "works in dev, not on the client" cause).
NPCAP_HINT = (
    "Live capture needs the Npcap packet-capture driver, which is not installed. "
    "Install Npcap from https://npcap.com (tick 'Install Npcap in WinPcap "
    "API-compatible Mode') and relaunch the app as Administrator. Installing Nmap "
    "(https://nmap.org) also installs Npcap, which is why capture already works on "
    "machines that have Nmap. The bundled Windows installer installs Npcap for you "
    "automatically."
)


def _npcap_installed():
    """Best-effort check that a pcap provider is available.

    On Windows this looks for Npcap/WinPcap's wpcap.dll (the runtime library scapy
    binds to). On Linux/macOS libpcap is the standard provider, so this is a no-op
    that always returns True — the dev workflow is unchanged."""
    if not _is_windows():
        return True
    windir = os.environ.get("WINDIR", r"C:\Windows")
    candidates = [
        os.path.join(windir, "System32", "Npcap", "wpcap.dll"),
        os.path.join(windir, "System32", "wpcap.dll"),
        os.path.join(windir, "SysWOW64", "Npcap", "wpcap.dll"),
        os.path.join(windir, "SysWOW64", "wpcap.dll"),
    ]
    return any(os.path.isfile(p) for p in candidates)


def _ensure_scapy():
    """Verify scapy is importable AND a pcap provider (Npcap) is present. Returns
    (ok, error_message). Both parts matter: scapy imports fine on Windows even
    without Npcap, but sniff() then fails at runtime — so we check the driver up
    front and surface a clear, actionable message instead of a cryptic error."""
    try:
        # Import inside function so backend still starts even if scapy is missing
        from scapy.all import sniff  # noqa: F401
    except ImportError:
        return False, "Scapy is not installed. Run: pip install scapy"
    if not _npcap_installed():
        return False, NPCAP_HINT
    return True, None


def _packet_handler(pkt):
    """Aggregate packets into flows with metadata for feature extraction."""
    try:
        ts = getattr(pkt, "time", time.time())
        size = len(pkt)

        # Extract the IP layer. Only IP-bearing packets are recorded: a non-IP
        # frame (ARP, STP, LLDP, raw L2, ...) has no source/destination IP, so
        # keeping it produced rows with "NA" IPs and protocol number 0 — which the
        # protocol map renders as "HOPOPT". Dropping them means every stored/shown
        # row now has real Source/Destination IPs and a real protocol number.
        if IP in pkt:
            ip = pkt[IP]
            src_ip, dst_ip, proto = ip.src, ip.dst, int(ip.proto)
        elif IPv6 is not None and IPv6 in pkt:
            ip6 = pkt[IPv6]
            # nh = IPv6 "next header" == the upper-layer protocol number (6/17/58…).
            src_ip, dst_ip, proto = ip6.src, ip6.dst, int(ip6.nh)
        else:
            return  # non-IP packet — nothing to score, skip it entirely

        # Extract transport layer
        if TCP in pkt:
            src_port = pkt[TCP].sport
            dst_port = pkt[TCP].dport
        elif UDP in pkt:
            src_port = pkt[UDP].sport
            dst_port = pkt[UDP].dport
        else:
            src_port = dst_port = 0
        
        # Flow key
        key = (src_ip, dst_ip, proto, src_port, dst_port)
        flow = _flows[key]
        
        # Update flow data
        flow["timestamps"].append(ts)
        flow["sizes"].append(size)
        flow["src_ip"] = src_ip
        flow["dst_ip"] = dst_ip
        flow["proto"] = proto
        flow["src_port"] = src_port
        flow["dst_port"] = dst_port

    except Exception:
        pass


def stop_capture_thread():
    """Stop the sniffing thread WITHOUT saving to CSV. Used to pause live capture
    while a CSV upload is analyzed, and to avoid two sniff threads when capture is
    resumed. (stop_capture_and_save() is the heavier 'stop + persist' path.)"""
    global _capture_thread
    _stop_event.set()
    if _capture_thread and _capture_thread.is_alive():
        _capture_thread.join(timeout=3)
    _capture_thread = None


def start_capture(interface=None, results_folder="results"):
    """Start packet capture in background. Saves to results/live_capture.csv when stopped."""
    global _capture_thread, _stop_event, _capture_data, _capture_start, _capture_last_error
    ok, err = _ensure_scapy()
    if not ok:
        return {"error": err}

    # Stop any previous sniff thread first so resuming never leaves two running.
    stop_capture_thread()
    _stop_event.clear()
    _capture_data.clear()
    _capture_last_error = None
    _capture_start = time.time()

    def run():
        from scapy.all import sniff  # type: ignore
        global _capture_last_error
        try:
            # Use small batches so we can stop quickly when requested.
            # If an interface is provided, pass it through; otherwise let scapy choose the default.
            while not _stop_event.is_set():
                kwargs = {
                    "prn": _packet_handler,
                    "count": 0,          # unlimited until timeout
                    "timeout": 1,
                    "store": False,
                }
                if interface:
                    kwargs["iface"] = interface
                sniff(**kwargs)
        except Exception as e:
            # Record the error so the API can surface it to the frontend. A runtime
            # failure that mentions the pcap/Npcap layer almost always means the
            # driver is missing or the app isn't elevated — give the actionable hint.
            msg = str(e)
            low = msg.lower()
            if _is_windows() and any(k in low for k in ("pcap", "npcap", "winpcap", "libpcap", "l2listen", "no such device")):
                _capture_last_error = f"{NPCAP_HINT} (underlying error: {msg})"
            else:
                _capture_last_error = msg

    _capture_thread = threading.Thread(target=run, daemon=True)
    _capture_thread.start()
    return {
        "status": "capturing",
        "message": "Live capture started",
        "note": "If you see no packets, ensure Scapy/Npcap are installed and run as Administrator on Windows.",
    }


def _flows_to_rows(flows_snapshot):
    """Build extended-feature rows (matching FEATURES in dlt/pipeline.py) from a
    flows dict. Shared by stop_capture_and_save() and snapshot_flows_df() so that
    a mid-capture snapshot and the final saved CSV use identical feature math."""
    rows = []
    for key, flow in flows_snapshot.items():
        ts_arr = np.array(flow["timestamps"])
        sizes = np.array(flow["sizes"])
        if len(ts_arr) < 2:
            continue

        # Flow duration
        duration = ts_arr[-1] - ts_arr[0]

        # Inter-arrival times
        iats = np.diff(ts_arr)
        if len(iats) == 0:
            continue

        # Active/Idle times (simple heuristic: active = iats < 1s, idle = iats >= 1s)
        active_times = iats[iats < 1.0] if len(iats) else []
        idle_times = iats[iats >= 1.0] if len(iats) else []

        def stats(arr):
            return {
                "mean": float(np.mean(arr)) if len(arr) else 0.0,
                "std": float(np.std(arr)) if len(arr) else 0.0,
                "min": float(np.min(arr)) if len(arr) else 0.0,
                "max": float(np.max(arr)) if len(arr) else 0.0,
                "total": float(np.sum(arr)) if len(arr) else 0.0,
            }

        active_stats = stats(active_times)
        idle_stats = stats(idle_times)
        iat_stats = stats(iats)

        # Forward/Backward split (heuristic: src_ip is forward, dst_ip is backward)
        # In real IDS, you'd track direction by TCP flags or roles.
        fwd_iats = iats[::2]  # crude split
        bwd_iats = iats[1::2]
        fwd_stats = stats(fwd_iats)
        bwd_stats = stats(bwd_iats)

        # Rates
        packets_per_s = len(ts_arr) / duration if duration > 0 else 0
        bytes_per_s = sizes.sum() / duration if duration > 0 else 0

        rows.append({
            "Timestamp": datetime.fromtimestamp(ts_arr[0]).strftime("%Y-%m-%d %H:%M:%S"),
            "Source IP": flow["src_ip"],
            "Destination IP": flow["dst_ip"],
            "Protocol": flow["proto"],
            "Source Port": flow["src_port"],
            "Destination Port": flow["dst_port"],
            "Active Mean": active_stats["mean"],
            "Active Std": active_stats["std"],
            "Active Min": active_stats["min"],
            "Active Max": active_stats["max"],
            "Idle Mean": idle_stats["mean"],
            "Idle Std": idle_stats["std"],
            "Idle Min": idle_stats["min"],
            "Idle Max": idle_stats["max"],
            "Flow Duration": duration,
            "Flow Packets/s": packets_per_s,
            "Flow Bytes/s": bytes_per_s,
            "Flow IAT Mean": iat_stats["mean"],
            "Flow IAT Std": iat_stats["std"],
            "Flow IAT Min": iat_stats["min"],
            "Flow IAT Max": iat_stats["max"],
            "Fwd IAT Mean": fwd_stats["mean"],
            "Fwd IAT Std": fwd_stats["std"],
            "Fwd IAT Min": fwd_stats["min"],
            "Fwd IAT Max": fwd_stats["max"],
            "Fwd IAT Total": fwd_stats["total"],
            "Bwd IAT Mean": bwd_stats["mean"],
            "Bwd IAT Std": bwd_stats["std"],
            "Bwd IAT Min": bwd_stats["min"],
            "Bwd IAT Max": bwd_stats["max"],
            "Bwd IAT Total": bwd_stats["total"],
            "Fwd Packets/s": packets_per_s / 2,  # crude split
            "Bwd Packets/s": packets_per_s / 2,
            "Label": "BENIGN",
        })
    return rows


def snapshot_flows_df(results_folder="results"):
    """Non-destructive snapshot of in-progress flows for continuous mid-capture
    analysis. Does NOT stop the capture thread or touch the saved CSV. Returns a
    DataFrame in the same shape stop_capture_and_save() writes, built from
    whatever flow data has been observed so far."""
    global _flows
    rows = _flows_to_rows(dict(_flows))
    return pd.DataFrame(rows)


def stop_capture_and_save(results_folder="results"):
    """Stop capture and save to CSV with extended flow features."""
    global _stop_event, _capture_thread, _flows, _capture_start, _capture_last_error
    _stop_event.set()
    if _capture_thread:
        _capture_thread.join(timeout=3)

    Path(results_folder).mkdir(parents=True, exist_ok=True)
    out_path = os.path.join(results_folder, "live_capture.csv")

    rows = _flows_to_rows(_flows)

    df = pd.DataFrame(rows)
    df.to_csv(out_path, index=False)

    return {
        "status": "saved",
        "path": out_path,
        "rows": len(rows),
        "column_names": list(df.columns),
        "preview": rows[:5],
    }


def get_capture_preview():
    """Return a summary of captured flows for user visibility (during capture)."""
    global _flows
    preview = {
        "total_flows": 0,
        "total_packets": 0,
        "total_bytes": 0,
        "seconds_with_data": 0,
        "sample_rows": [],
        "column_info": "Timestamp, Source IP, Destination IP, Protocol, Source Port, Destination Port, Flow Duration, Flow Packets/s, Flow Bytes/s, Label",
    }

    if not _flows:
        return preview

    total_packets = sum(len(flow["timestamps"]) for flow in _flows.values())
    total_bytes = sum(sum(flow["sizes"]) for flow in _flows.values())
    preview["total_flows"] = len(_flows)
    preview["total_packets"] = total_packets
    preview["total_bytes"] = total_bytes
    preview["seconds_with_data"] = int(time.time() - (_capture_start or time.time()))

    # Build sample rows (up to 5 flows)
    for i, (key, flow) in enumerate(_flows.items()):
        if i >= 5:
            break
        ts0 = datetime.fromtimestamp(flow["timestamps"][0]).strftime("%Y-%m-%d %H:%M:%S")
        duration = flow["timestamps"][-1] - flow["timestamps"][0] if len(flow["timestamps"]) > 1 else 0
        packets_per_s = len(flow["timestamps"]) / duration if duration > 0 else 0
        bytes_per_s = sum(flow["sizes"]) / duration if duration > 0 else 0
        preview["sample_rows"].append({
            "Timestamp": ts0,
            "Source IP": flow["src_ip"],
            "Destination IP": flow["dst_ip"],
            "Protocol": flow["proto"],
            "Source Port": flow["src_port"],
            "Destination Port": flow["dst_port"],
            "Flow Duration": duration,
            "Flow Packets/s": packets_per_s,
            "Flow Bytes/s": bytes_per_s,
            "Label": "BENIGN",
        })

    return preview


def get_capture_preview_from_file(results_folder="results"):
    """Read saved live_capture.csv and return preview for display."""
    import pandas as pd
    path = Path(results_folder) / "live_capture.csv"
    preview = {
        "total_flows": 0,
        "total_packets": 0,
        "total_bytes": 0,
        "seconds_with_data": 0,
        "sample_rows": [],
        "column_info": "Extended flow features",
    }
    if not path.exists():
        return preview

    try:
        df = pd.read_csv(path, nrows=1000)
        if df.empty:
            return preview

        preview["total_flows"] = len(df)
        preview["total_packets"] = int(df["Flow Packets/s"].sum())
        preview["total_bytes"] = int(df["Flow Bytes/s"].sum())
        preview["seconds_with_data"] = int(df["Flow Duration"].sum())

        for _, row in df.head(5).iterrows():
            preview["sample_rows"].append({
                "Timestamp": row.get("Timestamp"),
                "Source IP": row.get("Source IP"),
                "Destination IP": row.get("Destination IP"),
                "Protocol": row.get("Protocol"),
                "Source Port": row.get("Source Port"),
                "Destination Port": row.get("Destination Port"),
                "Flow Duration": row.get("Flow Duration"),
                "Flow Packets/s": row.get("Flow Packets/s"),
                "Flow Bytes/s": row.get("Flow Bytes/s"),
                "Label": row.get("Label"),
            })
    except Exception:
        pass
    return preview


def get_capture_status():
    """Return current capture status and live preview of captured flows."""
    if _flows:
        seconds_val = int(time.time() - (_capture_start or time.time()))
    elif _capture_start:
        seconds_val = max(0, int(time.time() - _capture_start))
    else:
        seconds_val = 0

    status = {
        "capturing": not _stop_event.is_set() if _stop_event else False,
        "seconds": seconds_val,
        "last_error": _capture_last_error,
        "preview": get_capture_preview(),
    }
    return status
