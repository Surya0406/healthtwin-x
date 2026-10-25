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

## Quick Start (Windows, one command)

Prerequisites: Python 3.10+ and Node.js 18+.

```powershell
.\start.ps1
```

This creates `.venv` and installs backend packages on the first run, runs `npm install` for the frontend, then starts both servers:

- API: http://localhost:8000 (interactive docs at `/docs`)
- Dashboard: http://localhost:5173 (opens on `patient_2`)

If the dashboard shows an amber "Backend not reachable" banner, it is displaying offline demo data. Check that the API window is running.

### Manual setup

```powershell
# Backend (from the repo root)
py -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m uvicorn backend.main:app --port 8000

# Frontend (second terminal)
cd frontend
npm install
npm run dev
```

---

## API Endpoints

Full request and response shapes are in `shared_contracts/api_contract.md`.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/patients` | List the three patient personas |
| `GET` | `/api/patient/monitoring?patient_id=` | Last 14 days: vitals, 7-day baselines and bands, z-scores, anomaly flag, score and severity |
| `GET` | `/api/patient/twin-state?patient_id=` | Digital twin status, four subsystem scores, organ colours |
| `POST` | `/api/patient/simulate` | 7-day what-if projection and AI prescription for new sleep, steps and stress |
| `GET` | `/api/patient/explain-alert?patient_id=` | SHAP feature attributions and a plain-language summary |
| `POST` | `/api/patient/log-vitals` | Append a day of vitals (in memory, written through to the CSV) |

Unknown `patient_id` values return HTTP 404.

---

## Project Layout

```
backend/            FastAPI app (main.py), core/ (data + baselines), services/ (ML)
frontend/           Vite + React + Tailwind + Recharts dashboard
shared_contracts/   api_contract.md and sample_patient_data.csv
start.ps1           one-command launcher
```
