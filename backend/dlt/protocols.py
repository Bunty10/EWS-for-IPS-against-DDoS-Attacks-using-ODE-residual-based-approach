"""
IP protocol number → human-readable name mapping.

Live capture records the IP protocol as its numeric value (e.g. 6, 17, 1); some
CSV datasets do the same. This maps those to names (TCP, UDP, ICMP, …) for
display, while passing through values that are already names.
"""

# Common IANA IP protocol numbers.
_PROTO_NAMES = {
    0: "HOPOPT", 1: "ICMP", 2: "IGMP", 6: "TCP", 8: "EGP", 9: "IGP",
    17: "UDP", 41: "IPv6", 47: "GRE", 50: "ESP", 51: "AH", 58: "IPv6-ICMP",
    88: "EIGRP", 89: "OSPF", 103: "PIM", 112: "VRRP", 132: "SCTP",
}


def name(proto):
    """Return a protocol name for a number/numeric-string; pass names through.

    Examples: 6 → 'TCP', '17' → 'UDP', 'TCP' → 'TCP', None → '-'."""
    if proto is None or proto == "":
        return "-"
    # Already a name?
    if isinstance(proto, str) and not proto.strip().lstrip("-").isdigit():
        return proto.strip().upper()
    try:
        num = int(float(proto))
    except (TypeError, ValueError):
        return str(proto)
    return _PROTO_NAMES.get(num, f"IP-{num}")
