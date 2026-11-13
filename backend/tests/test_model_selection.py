"""
Validation for the per-workflow baseline-selection rule:

    Live Traffic Capture & Analysis  ->  VNRVJIET baseline
    Upload CSV Analysis              ->  CICDDoS2019 baseline

The two workflows never share a baseline. Run directly for a PASS/FAIL report,
or under pytest for the test_* functions.
"""
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
SERVICE = (BACKEND / "dlt" / "service.py").read_text()
ROUTES = (BACKEND / "dlt" / "routes.py").read_text()


def _calls(src):
    return [src[m.start():m.start() + 200] for m in re.finditer(r"run_test_only\(", src)]


def check_live_pinned_to_live():
    for args in _calls(SERVICE):
        if "snapshot_df" in args or "live_path" in args:
            assert 'mode="LIVE"' in args and 'mode="CSV"' not in args, args
    return True


def check_csv_pinned_to_csv():
    for args in _calls(SERVICE):
        if "csv_path" in args:
            assert 'mode="CSV"' in args and 'mode="LIVE"' not in args, args
    return True


def check_upload_route_uses_csv_mode():
    # The upload guard resolves the CSV baseline and must never hard-code the
    # LIVE (VNRVJIET) artifacts.
    assert 'resolve_model_set("CSV")' in ROUTES
    assert "VNRVJIET" not in ROUTES
    return True


def check_dynamic_resolve():
    sys.path.insert(0, str(BACKEND))
    try:
        from dlt import pipeline
    except Exception as e:  # noqa: BLE001 - engine deps may be absent
        return f"skipped (engine deps not importable: {type(e).__name__})"
    want = {"LIVE": "VNRVJIET", "CSV": "CICDDoS2019"}
    for mode, dataset in want.items():
        _, mset = pipeline.resolve_model_set(mode)
        assert mset["dataset"] == dataset, (mode, mset)
    for bad in ("", None, "TRAIN"):
        try:
            pipeline.resolve_model_set(bad)
            raise AssertionError(f"accepted invalid mode {bad!r}")
        except ValueError:
            pass
    return "ok"


def test_live_pinned_to_live(): assert check_live_pinned_to_live()
def test_csv_pinned_to_csv(): assert check_csv_pinned_to_csv()
def test_upload_route_uses_csv_mode(): assert check_upload_route_uses_csv_mode()


def _main():
    checks = [
        ("Live capture pinned to the LIVE (VNRVJIET) baseline", check_live_pinned_to_live),
        ("CSV upload pinned to the CSV (CICDDoS2019) baseline", check_csv_pinned_to_csv),
        ("Upload route resolves the CSV baseline dynamically", check_upload_route_uses_csv_mode),
    ]
    print("Baseline-selection validation")
    print("=" * 52)
    ok = True
    for name, fn in checks:
        try:
            fn(); print(f"  PASS  {name}")
        except AssertionError as e:
            ok = False; print(f"  FAIL  {name}  -> {e}")
    print(f"  ----  Dynamic resolve: {check_dynamic_resolve()}")
    print("=" * 52)
    print("RESULT:", "ALL STATIC CHECKS PASSED" if ok else "FAILURES PRESENT")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(_main())
