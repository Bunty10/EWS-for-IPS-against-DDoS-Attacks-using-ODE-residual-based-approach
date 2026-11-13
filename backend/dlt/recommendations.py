"""
Alert-level → recommended-action mapping, shared by the API (Attack Details /
Auto Recommendations pages) and the email notifier so the guidance is identical
everywhere it appears.
"""

RECOMMENDATIONS = {
    "LOW": {
        "severity": "Low",
        "headline": "Monitor continuously",
        "actions": [
            "Keep monitoring traffic — no immediate action required.",
            "Note the source/destination pair for trend analysis.",
        ],
    },
    "MED": {
        "severity": "Medium",
        "headline": "Inspect suspicious connections and increase logging",
        "actions": [
            "Inspect the flagged source/destination connections.",
            "Increase logging verbosity for the affected hosts.",
            "Watch for escalation to HIGH over the next intervals.",
        ],
    },
    "HIGH": {
        "severity": "High",
        "headline": "Notify admin, block the source IP, apply mitigation rules",
        "actions": [
            "Notify the administrator immediately.",
            "Block the offending source IP.",
            "Apply rate-limiting / mitigation rules at the firewall.",
        ],
    },
}

# Fallback for BENIGN or unknown levels.
_DEFAULT = {
    "severity": "None",
    "headline": "No action needed",
    "actions": ["Traffic looks normal."],
}


def for_level(level):
    """Return the recommendation block for an alert level (LOW/MED/HIGH)."""
    return RECOMMENDATIONS.get((level or "").upper(), _DEFAULT)


def all_recommendations():
    """Full LOW/MED/HIGH map, for the Auto Recommendations reference page."""
    return RECOMMENDATIONS
