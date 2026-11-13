"""
Shared data pre-processing and result formatting for both detection approaches.

Both Approach 1 (Hybrid DLT-PINNs, neural network) and Approach 2 (Residual-based
ODE, system identification) read the same network flows, bin them into one-second
windows the same way, and return results in the same shape. Only the per-second
*scoring* differs, so everything that is common lives here and each approach module
supplies just its score.
"""
import numpy as np
import pandas as pd

from dlt import protocols

# The 27 flow features the engine analyses, in a fixed order.
FEATURES = ['FlowDuration', 'FlowBytes/s', 'FlowPackets/s',
            'FlowIATMean', 'FlowIATStd', 'FlowIATMax', 'FlowIATMin',
            'FwdIATTotal', 'FwdIATMean', 'FwdIATStd', 'FwdIATMax', 'FwdIATMin', 'FwdPackets/s',
            'BwdIATTotal', 'BwdIATMean', 'BwdIATStd', 'BwdIATMax', 'BwdIATMin', 'BwdPackets/s',
            'ActiveMean', 'ActiveStd', 'ActiveMax', 'ActiveMin',
            'IdleMean', 'IdleStd', 'IdleMax', 'IdleMin']
LABEL_COL = "Label"
NUM_FEATURES = len(FEATURES)

# Warning levels, lowest to highest.
ALERT_LEVELS = ("LOW", "MED", "HIGH")


def clean_columns(df):
    """Normalise column names (strip spaces) so "Flow Bytes/s" becomes "FlowBytes/s"."""
    df.columns = df.columns.str.strip().str.replace(" ", "", regex=False)
    return df


def preprocess_raw(df, features):
    """Drop rows with infinite or missing feature values."""
    df = df.replace([np.inf, -np.inf], np.nan)
    return df.dropna(subset=features).reset_index(drop=True)


def aggregate_data(df, threshold=0.07):
    """Bin flows into one-second windows.

    For each second we sum the flow features, label the second DDoS when the share
    of non-benign flows crosses `threshold`, and attach the dominant communicating
    socket (the SourceIP->DestinationIP pair carrying the most packets that second,
    with its most common ports/protocol) for display.
    """
    df["Timestamp"] = pd.to_datetime(df["Timestamp"], errors="coerce", format="mixed")
    df = df.dropna(subset=["Timestamp"])
    df.set_index("Timestamp", inplace=True)

    use_features = [f for f in FEATURES if f in df.columns]
    agg_dict = {f: "sum" for f in use_features}
    agg_dict['Label'] = ["size", lambda x: (x != "BENIGN").sum()]
    aggregated_df = df.resample("1s").agg(agg_dict).reset_index()

    aggregated_df.columns = ["Timestamp"] + [
        col[0] if col[0] in use_features else f"{col[0]}_{col[1]}"
        for col in aggregated_df.columns[1:]
    ]
    for f in use_features:
        if f in aggregated_df.columns:
            aggregated_df[f] = aggregated_df[f].fillna(0.0)

    # Per-second attack ratio -> adaptive BENIGN/DDoS label.
    label_size_col = next((c for c in aggregated_df.columns if "Label_size" in c), None)
    label_attack_col = next((c for c in aggregated_df.columns if "Label_" in c and c != label_size_col), None)
    aggregated_df["label_count"] = aggregated_df[label_size_col].fillna(0)
    aggregated_df["label_A_count"] = aggregated_df[label_attack_col].fillna(0)
    aggregated_df["attack_ratio"] = np.where(
        aggregated_df["label_count"] > 0,
        aggregated_df["label_A_count"] / aggregated_df["label_count"], 0)
    aggregated_df["Label"] = np.where(
        aggregated_df["attack_ratio"] >= threshold, "DDoS", "BENIGN")

    # Drop empty seconds (every feature zero) and the temporary label columns.
    zero_mask = pd.Series(True, index=aggregated_df.index)
    for f in use_features:
        if f in aggregated_df.columns:
            zero_mask &= (aggregated_df[f] == 0.0)
    aggregated_df = aggregated_df[~zero_mask]
    drop_cols = [c for c in ["label_count", "label_A_count", "attack_ratio",
                             label_size_col, label_attack_col] if c in aggregated_df.columns]
    aggregated_df.drop(columns=drop_cols, inplace=True)

    aggregated_df["Timestamp_sec"] = range(1, len(aggregated_df) + 1)
    aggregated_df = aggregated_df[["Timestamp_sec"] + [c for c in aggregated_df.columns if c != "Timestamp_sec"]]

    # Dominant socket per second: the (SourceIP, DestinationIP) pair with the most
    # packets, chosen jointly so the reported src/dst always belong to one flow.
    pair_cols = [c for c in ["SourceIP", "DestinationIP"] if c in df.columns]
    extra_socket_cols = [c for c in ["SourcePort", "DestinationPort", "Protocol"] if c in df.columns]
    if pair_cols:
        df["second"] = df.index.floor("s")
        weight_col = "FlowPackets/s" if "FlowPackets/s" in df.columns else None
        group_keys = ["second"] + pair_cols
        if weight_col:
            pair_weight = df.groupby(group_keys)[weight_col].sum().reset_index(name="_weight")
        else:
            pair_weight = df.groupby(group_keys).size().reset_index(name="_weight")
        dom_idx = pair_weight.groupby("second")["_weight"].idxmax()
        dom_pairs = pair_weight.loc[dom_idx, group_keys].reset_index(drop=True)
        if extra_socket_cols:
            def _mode_or_nan(s):
                m = s.mode()
                return m.iloc[0] if len(m) else np.nan
            dom_flows = df.reset_index()[group_keys + extra_socket_cols].merge(
                dom_pairs, on=group_keys, how="inner")
            modal = dom_flows.groupby("second")[extra_socket_cols].agg(_mode_or_nan).reset_index()
            dom_pairs = dom_pairs.merge(modal, on="second", how="left")
        aggregated_df = aggregated_df.merge(dom_pairs, left_on="Timestamp", right_on="second", how="left")
        aggregated_df.drop(columns=["second"], inplace=True, errors="ignore")

    final_columns = [
        "Timestamp", "Timestamp_sec",
        "SourceIP", "DestinationIP", "SourcePort", "DestinationPort", "Protocol",
        *FEATURES, "Label",
    ]
    return aggregated_df[[c for c in final_columns if c in aggregated_df.columns]]


def prepare(test_df):
    """Read (if a path), validate, clean, filter and aggregate a test dataset.

    Returns the per-second DataFrame ready for scoring. Raises ValueError with a
    clear message when the input is empty or missing required columns.
    """
    from pathlib import Path
    if isinstance(test_df, (str, Path)):
        test_df = pd.read_csv(test_df)
    if test_df.empty:
        raise ValueError("The dataset is empty.")
    test_df = clean_columns(test_df)
    missing = [c for c in FEATURES + ["Label", "Timestamp"] if c not in test_df.columns]
    if missing:
        raise ValueError(
            f"Dataset is missing required columns: {missing}. "
            "Expected Timestamp, Label and the flow features (names are space-normalised)."
        )
    test_df = preprocess_raw(test_df, FEATURES)
    if test_df.empty:
        raise ValueError("No valid rows after preprocessing (check for NaN/inf in the flow features).")
    df_agg = aggregate_data(test_df)
    if len(df_agg) == 0:
        raise ValueError("No per-second traffic after aggregation.")
    return df_agg


def _warn(score, low, med, high):
    """Map one anomaly score to a warning level (ungraded seconds stay BENIGN)."""
    if pd.isna(score) or score <= low:
        return "BENIGN"
    if score <= med:
        return "LOW"
    if score <= high:
        return "MED"
    return "HIGH"


def build_test_result(df_agg, thresholds, graded, mode_meta):
    """Turn a scored per-second frame into the API result both approaches return.

    `df_agg` must carry a "Score" column (NaN where a second could not be scored).
    `thresholds` is {"LOW","MED","HIGH"}; `mode_meta` describes which approach,
    workflow mode and dataset produced the result.
    """
    low, med, high = thresholds["LOW"], thresholds["MED"], thresholds["HIGH"]
    df = df_agg
    df["Warning"] = df["Score"].apply(lambda s: _warn(s, low, med, high))

    # Detection performance: any alert vs benign.
    y_true = (df["Label"] != "BENIGN").astype(int).values
    y_pred = (df["Warning"] != "BENIGN").astype(int).values
    tp = int(((y_true == 1) & (y_pred == 1)).sum())
    fn = int(((y_true == 1) & (y_pred == 0)).sum())
    fp = int(((y_true == 0) & (y_pred == 1)).sum())
    tn = int(((y_true == 0) & (y_pred == 0)).sum())
    detection_rate = tp / (tp + fn) if (tp + fn) else 0.0
    false_positive_rate = fp / (fp + tn) if (fp + tn) else 0.0

    def first(level):
        hit = df.loc[df["Warning"] == level, "Timestamp_sec"]
        return float(hit.min()) if len(hit) else None
    def last(level):
        hit = df.loc[df["Warning"] == level, "Timestamp_sec"]
        return float(hit.max()) if len(hit) else None

    peak_idx = df["FlowPackets/s"].idxmax()
    dom_cols = [c for c in ["SourceIP", "DestinationIP", "SourcePort", "DestinationPort", "Protocol"]
                if c in df.columns]
    has_ts = "Timestamp" in df.columns

    traffic_data = []
    for _, row in df.iterrows():
        score = row["Score"]
        entry = {
            "second": int(row["Timestamp_sec"]),
            "FlowPackets_s": float(row["FlowPackets/s"]),
            "FlowBytes_s": float(row["FlowBytes/s"]),
            "FlowDuration": float(row["FlowDuration"]),
            "Label": str(row["Label"]),
            "Warning": str(row["Warning"]),
            "score": float(score) if pd.notna(score) else None,
        }
        if has_ts:
            entry["Timestamp"] = str(row["Timestamp"])
        for c in dom_cols:
            val = row.get(c)
            entry[c] = str(val) if pd.notna(val) else ""
        if "Protocol" in entry:
            entry["Protocol"] = protocols.name(entry["Protocol"])
        # Carry the complete per-second feature vector so exports keep every feature.
        for f in FEATURES:
            entry[f.replace("/", "_").replace(" ", "_")] = (
                float(row[f]) if (f in df.columns and pd.notna(row[f])) else 0.0)
        traffic_data.append(entry)

    return {
        "detection_rate": detection_rate,
        "false_positive_rate": false_positive_rate,
        "warnings": {k: int(v) for k, v in df["Warning"].value_counts().to_dict().items()},
        "traffic_data": traffic_data,
        "max_seconds": int(df["Timestamp_sec"].max()),
        "first_low": first("LOW"), "first_med": first("MED"), "first_high": first("HIGH"),
        "last_low": last("LOW"), "last_med": last("MED"), "last_high": last("HIGH"),
        "peak_sec": int(df.loc[peak_idx, "Timestamp_sec"]),
        "peak_val": float(df.loc[peak_idx, "FlowPackets/s"]),
        "graded": graded,
        "thresholds": {"LOW": float(low), "MED": float(med), "HIGH": float(high)},
        "model_info": mode_meta,
    }
