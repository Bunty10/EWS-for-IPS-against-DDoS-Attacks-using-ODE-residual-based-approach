# DLT-NN IDS Web Application

AI-powered Intrusion Prevention using `Ordinary Differential Equation (ODE) residual‑based model`: per-second aggregation, adaptive thresholding, and LOW/MED/HIGH warnings.

## Requirements

- **Backend:** Python 3.8+, Flask, pandas, numpy, PyTorch, scikit-learn
- **Frontend:** Node 18+, npm

## Run the Application

### 1. Backend (Flask)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Backend runs at `http://localhost:5000`.

### 2. Frontend (Vite + React)

```bash
cd frontend
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`).

## Usage

1. **Home** – Overview of the pipeline (aggregation, DLT-NN baseline, residuals, early warnings).
2. **Upload** – Select three CSV datasets:
   - **Train:** BENIGN-only traffic (used to train the model and compute thresholds) from UDP and BENIGN from training day of CICDDoS2019.
   - **Test1 / Test2:** Mixed or attack traffic (e.g. BENIGN+UDPLag). All three are processed: train once, then test1 and test2 using the same model and thresholds.
3. Click **Upload & Analyze** – Files are uploaded, then the full ODE pipeline runs for all three datasets. When done, you are redirected to Results.
4. **Results** – First choose a **dataset** (Train | Test1 | Test2), then use the content tabs:
   - **Train dataset:** Thresholds (per-instance, residual stats), Graphs (TRAIN FlowPackets/s and FlowBytes/s vs Seconds in order).
   - **Test1 / Test2:** Overview (detection rate, FPR, warning counts), Graphs (in notebook order: TEST label plots, LOW/MED/HIGH alerts, Combined).
   - Graphs build sequentially from 0s to end; use **Play (0 → end)** and **Previous/Next** to move through the graph list.

## CSV Format

- Must include columns: `Timestamp`, `FlowDuration`,`FlowBytes/s`,`FlowPackets/s`,`FlowIATMean`,`FlowIATStd`,
                        `FlowIATMax`,`FlowIATMin`,`FwdIATTotal`,`FwdIATMean`,`FwdIATStd`,`FwdIATMax`,
                        `FwdIATMin`,`FwdPackets/s`,`BwdIATTotal`,`BwdIATMean`,`BwdIATStd`,`BwdIATMax`,
                        `BwdIATMin`,`BwdPackets/s`,`ActiveMean`,`ActiveStd`,`ActiveMax`,`ActiveMin`,
                        `IdleMean`,`IdleStd`,`IdleMax`,`IdleMin`, `Label`.
- `Label`: `BENIGN` or attack type (e.g. `UDPLAG`). Column names are normalized (spaces stripped).

## Pipeline (matches notebook)

1. Clean column names (strip spaces).
2. Preprocess: drop inf/NaN in features.
3. **Train:** aggregate by second (BENIGN only), sum  27 time-based features.
4. **Test:** aggregate by second, label ATTACK/BENIGN; select flow by label.
5. Normalize features (per-dataset mean/std).
6. ODE model -> System matrix, Residual value based on DLT and PINN.
7. Train residuals → Euclidean Distance formula based thresholds (μ+1σ, μ+2σ, μ+3σ).
8. Test: generate baseline, residuals, Euclidean distance, assign BENIGN/LOW/MED/HIGH.
9. Confusion matrices and metrics for LOW, MED, HIGH as “predicted ATTACK”.
