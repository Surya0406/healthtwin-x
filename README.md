# HealthTwin X: Clinical Digital Twin & Predictive Health Monitoring

HealthTwin X is a real-time clinical digital twin command center that models individual physiological baselines, continuously detects subtle multivariate health drift using an unsupervised machine learning ensemble, predicts biological twin age, and provides multi-output counterfactual simulation with explainable root-cause clinical prescriptions.

---

## Architecture Overview

- **Expanded 12-Persona Clinical Dataset**: 90 days of daily multivariate vitals across 12 diverse archetypes (Endurance Athlete, Overtraining Burnout, Corporate Autonomic Strain, Early Respiratory Infection, Pre-Hypertension Drift, Circadian Disruption, Senior Citizens with age-adjusted baselines, Metabolic Syndrome, and Recovery Cohorts).
- **Multi-Scale Personal Baseline Engine**: Computes both 7-day short-term acute bands ($\mu \pm 2\sigma$) and 30-day long-term chronic reference lines, dynamic normal bounds, baseline stability scores (0-100), and drift percentages ($\Delta\%$).
- **PyOD Multi-Model Ensemble**: Combines Isolation Forest (`IForest`), Empirical Cumulative Distribution (`ECOD`), and Copula Outlier Detection (`COPOD`) into a composite anomaly score (0-100) with model agreement metrics ("3/3 Models Agree"), clinical pattern categorization, and drift velocity tracking (pts/day).
- **Biological Twin Age & Counterfactual Forecasting**: Estimates Biological Age vs Chronological Age dynamically based on cardiovascular strain and sleep deficit. Features 14-day multi-output forward forecasting (Heart Rate, Systolic BP, Risk Score) with automated optimal habit targets.
- **Temporal Root-Cause XAI & Onset Localizer**: Integrates TreeSHAP feature attributions, localizes the exact chronological drift onset date, and constructs a root-cause chain-reaction cascade narrative.
- **Interactive Sticky Split-Screen Command Center**:
  - Sticky Left Panel (4 cols): Interactive SVG Human Digital Twin with clickable anatomical organ nodes (Heart, Brain/Nervous System, Lungs, Metabolism), real-time healing preview, and biological age breakdown.
  - Workspace Tabs (8 cols): 90-day timeline scrubber with clickable points, traditional vs dynamic baseline toggle, 6-vitals switcher, 14-day counterfactual simulator with Auto-Optimize and Pin Scenario, Clinical Copilot Q&A chat, and SmartWatch live streaming.
  - Clinical Exporters: 1-click printable clinical PDF report (`window.print()`) and CSV dataset ingestion uploader.

---

## Team Ownership Table

| Member | Role | Core Ownership / Scope |
| :--- | :--- | :--- |
| **Member 1** | Ingestion & Orchestration | `data_generator.py` (12 personas, 90 days), `baseline_engine.py` (7d/30d multi-scale baselines, stability score), `main.py` routing, CSV ingestion |
| **Member 2** | ML Ensemble & Baseline Visualization | `anomaly_detector.py` (PyOD IForest + ECOD + COPOD ensemble, pattern classification, drift velocity), `BaselineCharts.jsx` |
| **Member 3** | Digital Twin Simulation & Biological Age | `twin_simulator.py` (subsystems, biological twin age vs chronological age, 14-day multi-output forward trajectories, optimal targets) |
| **Member 4** | Temporal Root-Cause XAI | `xai_explainer.py` (TreeSHAP attributions, drift onset date localization, root-cause cascade narrative, diagnostic Q&A) |
| **Member 5** | Frontend Lead & Command Center UX | `App.jsx` (sticky split-screen layout, 12 personas dropdown, 90-day scrubber, PDF report exporter, CSV uploader), `TwinVisualizer.jsx`, `WhatIfSandbox.jsx` |

---

## Quick Start

### Linux & macOS
```bash
./start.sh
```

### Windows (PowerShell)
```powershell
.\start.ps1
```

### Manual Setup
```bash
# Backend (from repository root)
python3 -m uvicorn backend.main:app --port 8000

# Frontend (in another terminal)
cd frontend
npm install
npm run dev
```

- **Frontend Command Center**: [http://localhost:5173](http://localhost:5173)
- **FastAPI Interactive Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/patients` | List all 12 diverse patient personas with clinical archetypes |
| `GET` | `/api/patient/monitoring?patient_id=` | 90 days: vitals, 7d/30d baselines, PyOD ensemble score, agreement, drift velocity, stability |
| `GET` | `/api/patient/twin-state?patient_id=` | Digital twin status, subsystem scores, organ highlights, biological twin age vs chronological age |
| `POST` | `/api/patient/simulate` | 14-day multi-output trajectory projections (HR, BP, Risk) & optimal habit targets |
| `GET` | `/api/patient/explain-alert?patient_id=` | SHAP feature attributions, drift onset date localizer, chain-reaction cascade |
| `POST` | `/api/patient/log-vitals` | Append a daily vital observation to in-memory DataFrame & CSV |
| `POST` | `/api/patient/simulate-next-day` | Auto-generate next chronological day of wearable telemetry (3s live stream) |
| `POST` | `/api/patient/inject-event` | Inject acute sympathetic stress spike or restorative recovery day |
| `POST` | `/api/patients/upload-csv` | Upload custom patient vitals CSV file and reload in-memory dataset |
