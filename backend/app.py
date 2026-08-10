from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import json
from pathlib import Path

from dlt_pipeline import run_full_pipeline, run_test_only

app = Flask(__name__)
CORS(app)

_BASE_DIR = Path(__file__).resolve().parent
UPLOAD_FOLDER = str(_BASE_DIR / "uploads")
RESULTS_FOLDER = str(_BASE_DIR / "results")
MODEL_FOLDER = str(_BASE_DIR / "models")
Path(UPLOAD_FOLDER).mkdir(parents=True, exist_ok=True)
Path(RESULTS_FOLDER).mkdir(parents=True, exist_ok=True)
Path(MODEL_FOLDER).mkdir(parents=True, exist_ok=True)


def _nan_to_none(obj):
    """Recursively replace float('nan') with None so json.dump does not fail."""
    if isinstance(obj, dict):
        return {k: _nan_to_none(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_nan_to_none(v) for v in obj]
    if isinstance(obj, float) and (obj != obj):  # NaN
        return None
    return obj


def _save_results(results):
    path = os.path.join(RESULTS_FOLDER, "results.json")
    safe = _nan_to_none(results)
    with open(path, "w") as f:
        json.dump(safe, f, indent=2)


@app.route("/")
def home():
    return jsonify({"message": "AI Powered DLT-NN IDS Backend Running"})


# Legacy: 3-file upload (train + test1 + test2)
@app.route("/upload", methods=["POST"])
def upload():
    try:
        train = request.files.get("train")
        test1 = request.files.get("test1")
        test2 = request.files.get("test2")

        if not train or not test1 or not test2:
            return jsonify({"error": "Please upload all three datasets (train, test1, test2)"}), 400

        train_path = os.path.join(UPLOAD_FOLDER, "train.csv")
        test1_path = os.path.join(UPLOAD_FOLDER, "test1.csv")
        test2_path = os.path.join(UPLOAD_FOLDER, "test2.csv")

        train.save(train_path)
        test1.save(test1_path)
        test2.save(test2_path)

        return jsonify({"message": "Datasets Uploaded Successfully"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/process", methods=["POST"])
def process():
    try:
        train_path = os.path.join(UPLOAD_FOLDER, "train.csv")
        test1_path = os.path.join(UPLOAD_FOLDER, "test1.csv")
        test2_path = os.path.join(UPLOAD_FOLDER, "test2.csv")

        if not os.path.isfile(train_path) or not os.path.isfile(test1_path) or not os.path.isfile(test2_path):
            return jsonify({"error": "Upload all three datasets (train, test1, test2) first"}), 400

        results = run_full_pipeline(train_path, test1_path, test2_path, RESULTS_FOLDER, MODEL_FOLDER)
        _save_results(results)

        return jsonify({"message": "DLT-NN Processing Complete", "results": results})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# New: Single test upload (uses pre-trained models from results folder)
@app.route("/upload-test", methods=["POST"])
def upload_test():
    try:
        test = request.files.get("test")
        if not test:
            return jsonify({"error": "Please upload a test dataset (CSV file)"}), 400

        # thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_CICDDoS2019.pkl")
        thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_VNRVJIET.pkl")
        if  not os.path.isfile(thresholds_path):
            return jsonify({
                "error": "Pre-trained models not found. Run full pipeline once (train+test) to create thresholds.pkl in results folder."
            }), 400

        test_path = os.path.join(UPLOAD_FOLDER, "test.csv")
        test.save(test_path)
        return jsonify({"message": "Test dataset uploaded"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/process-test", methods=["POST"])
def process_test():
    try:
        test_path = os.path.join(UPLOAD_FOLDER, "test.csv")
        if not os.path.isfile(test_path):
            return jsonify({"error": "Upload a test dataset first"}), 400

        # thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_CICDDoS2019.pkl")
        thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_VNRVJIET.pkl")
        if not os.path.isfile(thresholds_path):
            return jsonify({
                "error": "Pre-trained models not found. Ensure thresholds.pkl exist in backend/results (run full pipeline once with train+test to create them)."
            }), 400

        test_result = run_test_only(test_path, RESULTS_FOLDER, MODEL_FOLDER)
        results = {"train": None, "test1": test_result, "test2": None}
        _save_results(results)

        return jsonify({"message": "Analysis Complete", "results": results})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    # except Exception as e:
    #     return jsonify({"error": str(e)}), 500
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# Live capture
@app.route("/live/start", methods=["POST"])
def live_start():
    try:
        from live_capture import start_capture
        out = start_capture(results_folder=RESULTS_FOLDER)
        if "error" in out:
            return jsonify({"error": out["error"]}), 400
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/live/stop", methods=["POST"])
def live_stop():
    try:
        from live_capture import stop_capture_and_save
        out = stop_capture_and_save(results_folder=RESULTS_FOLDER)
        if "error" in out and not out.get("path"):
            return jsonify({"error": out["error"]}), 400
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/live/status")
def live_status():
    try:
        from live_capture import get_capture_status
        return jsonify(get_capture_status())
    except Exception:
        return jsonify({"capturing": False, "seconds": 0})


@app.route("/live/preview")
def live_preview():
    """Return preview of last saved capture (from file) for visibility."""
    try:
        from live_capture import get_capture_preview_from_file
        preview = get_capture_preview_from_file(results_folder=RESULTS_FOLDER)
        return jsonify(preview)
    except Exception:
        return jsonify({"total_packets": 0, "total_bytes": 0, "seconds_with_data": 0, "sample_rows": []})


@app.route("/live/process", methods=["POST"])
def live_process():
    """Process the captured live CSV with the same model as test CSV; return same results shape."""
    try:
        live_path = os.path.join(RESULTS_FOLDER, "live_capture.csv")
        if not os.path.isfile(live_path):
            return jsonify({"error": "No live capture file found. Capture traffic first."}), 400

        # thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_CICDDoS2019.pkl")
        thresholds_path = os.path.join(MODEL_FOLDER, "thresholds_M2_VNRVJIET.pkl")
        if not os.path.isfile(thresholds_path):
            return jsonify({
                "error": "Pre-trained model not found. Run full pipeline once (train+test1+test2) to create thresholds.pkl, then live capture can be analyzed like uploaded CSV."
            }), 400

        test_result = run_test_only(live_path, RESULTS_FOLDER, MODEL_FOLDER)
        results = {"train": None, "test1": test_result, "test2": None}
        _save_results(results)

        return jsonify({"message": "Live capture analysis complete", "results": results})
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    # except Exception as e:
    #     return jsonify({"error": str(e)}), 500
    
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@app.route("/results")
def get_results():
    """Return results. Normalize so frontend always gets { train, test1, test2 }."""
    try:
        path = os.path.join(RESULTS_FOLDER, "results.json")
        if not os.path.isfile(path):
            return jsonify({"error": "No results found"}), 404
        with open(path, "r") as f:
            data = json.load(f)
        # If file has wrapper shape, return as-is
        if isinstance(data, dict) and ("test1" in data or "train" in data):
            return jsonify(data)
        # If file has flat result (e.g. single test or live analysis saved without wrapper), wrap it
        if isinstance(data, dict) and ("traffic_data" in data or "detection_rate" in data):
            data = {"train": None, "test1": data, "test2": None}
        return jsonify(data)
    except Exception:
        return jsonify({"error": "No results found"}), 404


if __name__ == "__main__":
    app.run(debug=False, port=5000)
