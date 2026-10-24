# HealthTwin X: Personal Digital Twin & Predictive Health Monitoring

HealthTwin X is a real-time clinical digital twin platform that models individual physiological baselines, continuously detects subtle multivariate health drift using machine learning, and provides counterfactual what-if simulation with explainable clinical prescriptions.

---

## Architecture Overview

- **Personal Baseline Modeling**: Fits personalized normal reference distributions per patient, accounting for individual baseline differences rather than generic population averages.
- **Unsupervised Drift & Anomaly Detection**: Employs PyOD Isolation Forest on 6 core vitals, 3-day rolling deltas, and vital ratios to detect multivariate strain before acute decompensation.
- **Dynamic Digital Twin Simulation**: Simulates physiological organ responses and forecasts forward vitals across varying lifestyle interventions.
- **Explainable Clinical Prescriptions (XAI)**: Attributes root causes of detected drift to specific biometric metrics and generates targeted behavioral interventions.
- **Reactive Clinical Dashboard**: Modern dark-themed dashboard rendering interactive rolling baseline bands (±2σ), anomaly pulse indicators, and live simulation controls.

---

## Team Ownership Table

| Member | Role | Core Ownership / Scope |
| :--- | :--- | :--- |
| **Member 1** | Backend Lead & Orchestration | FastAPI core application, DB/pipeline, routing, telemetry streaming |
| **Member 2 (ML + Frontend)** | ML & Baseline Visualization | `backend/services/anomaly_detector.py`, `backend/saved_models/*`, `frontend/src/components/BaselineCharts.jsx` |
| **Member 3** | Digital Twin Simulation | Physiological simulation engine, forward forecasting, counterfactual models |
| **Member 4** | XAI & Clinical Prescription | SHAP feature attribution, severity categorizer, clinical prescription engine |
| **Member 5** | Frontend Lead & UX | Main Dashboard layout, Twin visualizer (3D/canvas), global state, navigation |

---

## Backend Setup (Windows)

```powershell
# 1. Activate Python virtual environment
venv\Scripts\Activate.ps1

# 2. Upgrade pip and install dependencies
py -m pip install --upgrade pip
py -m pip install -r requirements.txt

# 3. Test Anomaly Detector service
py backend/services/anomaly_detector.py
```

---

## Frontend Setup

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev
```

---

## API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Service health status check |
| `GET` | `/api/patients` | Retrieve list of monitored patients |
| `GET` | `/api/patients/{id}/telemetry` | Retrieve 60-day historical vitals telemetry |
| `POST` | `/api/anomaly/detect` | Run IForest anomaly detector; returns last 14 days with anomaly flags and scores |
| `POST` | `/api/twin/forecast` | Run counterfactual simulation for what-if slider interventions |
| `POST` | `/api/xai/explain` | Generate SHAP feature attribution and clinical intervention recommendations |
