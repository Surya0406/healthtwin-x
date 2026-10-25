"""HealthTwin X FastAPI Backend Server.

Provides REST endpoints for personalized health monitoring, digital twin state,
counterfactual simulation, XAI alert explanation, and vitals logging.
"""

from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
import threading
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel, Field

from backend.core.baseline_engine import BaselineEngine
from backend.core.data_generator import DEFAULT_CSV_PATH, generate_sample_patient_data

# Real ML services are owned by other members; fall back to contract stubs if missing.
try:
    from backend.services.anomaly_detector import AnomalyDetector
except Exception:  # pragma: no cover
    AnomalyDetector = None
try:
    from backend.services.twin_simulator import DigitalTwinSimulator
except Exception:  # pragma: no cover
    DigitalTwinSimulator = None
try:
    from backend.services.xai_explainer import XAIExplainer
except Exception:  # pragma: no cover
    XAIExplainer = None

CSV_FILE_PATH = Path(DEFAULT_CSV_PATH)

# Global in-memory data store and lock for concurrent safety
_df_lock = threading.Lock()
_patients_df: pd.DataFrame = pd.DataFrame()

PATIENTS_METADATA = [
    {
        "patient_id": "patient_1",
        "name": "Healthy Athlete",
        "description": "Healthy athlete with consistent lifestyle, low noise, and stable cardiovascular metrics.",
    },
    {
        "patient_id": "patient_2",
        "name": "Executive under Stress",
        "description": "Normal for days 1-45, then days 46-60 gradual HR +14 bpm, sleep -2.5 h, systolic BP +12 mmHg, stress rising.",
    },
    {
        "patient_id": "patient_3",
        "name": "Post-Viral Recovery",
        "description": "High strain early on with steady recovery over the last 15 days.",
    },
]

VALID_PATIENT_IDS = {p["patient_id"] for p in PATIENTS_METADATA}


def load_dataset() -> pd.DataFrame:
    """Load sample patient data CSV into memory, generating it if absent."""
    global _patients_df
    if not CSV_FILE_PATH.exists():
        _patients_df = generate_sample_patient_data(CSV_FILE_PATH)
    else:
        _patients_df = pd.read_csv(CSV_FILE_PATH)
    return _patients_df


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to load data on startup."""
    with _df_lock:
        load_dataset()
    yield


app = FastAPI(
    title="HealthTwin X API",
    description="Personalized Health Monitoring & Digital Twin Simulation API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_patient_id(patient_id: str) -> None:
    """Ensure patient_id exists, raising HTTP 404 otherwise."""
    if patient_id not in VALID_PATIENT_IDS:
        raise HTTPException(
            status_code=404,
            detail=f"Patient '{patient_id}' not found. Valid IDs: {sorted(list(VALID_PATIENT_IDS))}",
        )


# -----------------------------------------------------------------------------
# Request & Response Models
# -----------------------------------------------------------------------------
class SimulateRequest(BaseModel):
    patient_id: str
    sleep_hours: float = Field(..., ge=0.0, le=24.0)
    daily_steps: int = Field(..., ge=0, le=100000)
    stress_index: int = Field(..., ge=0, le=100)


class LogVitalsRequest(BaseModel):
    patient_id: str
    timestamp: str | None = None
    heart_rate: int = Field(..., ge=20, le=250)
    spo2: int = Field(..., ge=50, le=100)
    systolic_bp: int = Field(..., ge=40, le=260)
    sleep_hours: float = Field(..., ge=0.0, le=24.0)
    daily_steps: int = Field(..., ge=0, le=100000)
    stress_index: int = Field(..., ge=0, le=100)


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/patients")
def get_patients() -> list[dict[str, str]]:
    """Return list of patient personas."""
    return PATIENTS_METADATA


@app.get("/api/patient/monitoring")
def get_monitoring(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return last 14 days of vitals, 7-day rolling baselines, and anomaly detection results."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].copy()

    if patient_df.empty:
        raise HTTPException(status_code=404, detail=f"No data available for patient '{patient_id}'")

    # Compute 7-day rolling baseline rows (last 14 days)
    baseline_days = BaselineEngine.compute_baselines(patient_df, window=7)

    merged_days: list[dict[str, Any]] = []

    # Real anomaly detection, keyed by timestamp; None means "use stub below"
    anomaly_by_ts: dict[str, dict[str, Any]] | None = None
    if AnomalyDetector is not None:
        try:
            rows = AnomalyDetector().fit_and_detect(patient_df, patient_id=patient_id)
            anomaly_by_ts = {str(r["timestamp"]): r for r in rows}
        except Exception:
            anomaly_by_ts = None

    for idx, day in enumerate(baseline_days):
        day_copy = dict(day)

        real = anomaly_by_ts.get(str(day_copy.get("timestamp"))) if anomaly_by_ts else None
        if real is not None:
            day_copy["anomaly_flag"] = int(real["anomaly_flag"])
            day_copy["anomaly_score"] = float(real["anomaly_score"])
            day_copy["severity_label"] = str(real["severity_label"])
            merged_days.append(day_copy)
            continue

        # Baseline stub anomaly output matching contract and personas
        if patient_id == "patient_1":
            day_copy["anomaly_flag"] = 0
            day_copy["anomaly_score"] = 12.4
            day_copy["severity_label"] = "Normal"
        elif patient_id == "patient_2":
            # Days 46-60 (the last 14 days) represent the gradual drift
            if idx < 3:
                day_copy["anomaly_flag"] = 0
                day_copy["anomaly_score"] = 32.0 + idx * 2.5
                day_copy["severity_label"] = "Normal"
            elif idx < 8:
                day_copy["anomaly_flag"] = 1
                day_copy["anomaly_score"] = 52.0 + idx * 3.0
                day_copy["severity_label"] = "Moderate Pattern Drift"
            else:
                day_copy["anomaly_flag"] = 1
                day_copy["anomaly_score"] = 72.0 + (idx - 8) * 4.2
                day_copy["severity_label"] = "Critical Multivariate Anomaly"
        elif patient_id == "patient_3":
            # Recovery phase
            score = max(18.0, 42.0 - (idx * 2.0))
            day_copy["anomaly_flag"] = 1 if score >= 40.0 else 0
            day_copy["anomaly_score"] = round(score, 1)
            day_copy["severity_label"] = "Moderate Pattern Drift" if score >= 40.0 else "Normal"
        else:
            day_copy["anomaly_flag"] = 0
            day_copy["anomaly_score"] = 15.0
            day_copy["severity_label"] = "Normal"

        merged_days.append(day_copy)

    return {
        "patient_id": patient_id,
        "days": merged_days,
    }


@app.get("/api/patient/twin-state")
def get_twin_state(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return Digital Twin status, subsystem scores (0-100), and organ highlights."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].sort_values("timestamp")

    if patient_df.empty:
        raise HTTPException(status_code=404, detail=f"No data for patient '{patient_id}'")

    latest_row = patient_df.iloc[-1].to_dict()

    if DigitalTwinSimulator is not None:
        try:
            state = DigitalTwinSimulator().compute_twin_state(latest_row)
            return {"patient_id": patient_id, **state}
        except Exception:
            pass

    # Stub response matching contract
    if patient_id == "patient_1":
        return {
            "patient_id": patient_id,
            "twin_status": "Optimal",
            "scores": {
                "cardio_strain_index": 92,
                "recovery_readiness": 90,
                "respiratory_stability": 95,
                "metabolic_stability": 94,
            },
            "organ_highlights": {
                "heart": "green",
                "brain_nervous": "green",
                "respiratory": "green",
                "metabolism": "green",
            },
        }
    elif patient_id == "patient_2":
        return {
            "patient_id": patient_id,
            "twin_status": "Strain Warning",
            "scores": {
                "cardio_strain_index": 48,
                "recovery_readiness": 42,
                "respiratory_stability": 88,
                "metabolic_stability": 58,
            },
            "organ_highlights": {
                "heart": "amber",
                "brain_nervous": "amber",
                "respiratory": "green",
                "metabolism": "amber",
            },
        }
    else:  # patient_3
        return {
            "patient_id": patient_id,
            "twin_status": "Optimal",
            "scores": {
                "cardio_strain_index": 78,
                "recovery_readiness": 76,
                "respiratory_stability": 84,
                "metabolic_stability": 82,
            },
            "organ_highlights": {
                "heart": "green",
                "brain_nervous": "green",
                "respiratory": "green",
                "metabolism": "green",
            },
        }


@app.post("/api/patient/simulate")
def post_simulate(payload: SimulateRequest) -> dict[str, Any]:
    """Simulate counterfactual what-if scenario over a 7-day horizon."""
    validate_patient_id(payload.patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == payload.patient_id].copy()

    if DigitalTwinSimulator is not None:
        try:
            return DigitalTwinSimulator().simulate_counterfactual(
                patient_df,
                {
                    "sleep_hours": payload.sleep_hours,
                    "daily_steps": payload.daily_steps,
                    "stress_index": payload.stress_index,
                },
            )
        except Exception:
            pass

    # Stub response matching contract
    base_hr = 78.2 if payload.patient_id == "patient_2" else (58.0 if payload.patient_id == "patient_1" else 68.0)
    base_risk = 64 if payload.patient_id == "patient_2" else (18 if payload.patient_id == "patient_1" else 35)

    # Dynamic counterfactual based on payload inputs
    sleep_benefit = (payload.sleep_hours - 7.0) * 1.5
    steps_benefit = (payload.daily_steps - 8000) / 1000.0 * 0.8
    stress_penalty = (payload.stress_index - 30) * 0.25
    hr_delta = -(sleep_benefit + steps_benefit - stress_penalty)
    risk_delta = int(hr_delta * 2.2)

    projections = []
    for day_i in range(1, 8):
        factor = day_i / 7.0
        c_hr = round(base_hr + (hr_delta * factor), 1)
        c_risk = int(max(5, min(95, base_risk + (risk_delta * factor))))
        b_hr = round(base_hr + (day_i * 0.2), 1)
        b_risk = int(min(98, base_risk + day_i))

        projections.append({
            "day": f"Day +{day_i}",
            "baseline_trajectory_hr": b_hr,
            "counterfactual_trajectory_hr": c_hr,
            "baseline_risk_score": b_risk,
            "counterfactual_risk_score": c_risk,
        })

    if payload.patient_id == "patient_1":
        prescription = "Twin is currently Optimal. Maintain 8.0h sleep and regular physical conditioning."
    else:
        prescription = (
            f"Target {payload.sleep_hours:.1f}h sleep, {payload.daily_steps} daily steps, "
            f"and maintain stress index under {payload.stress_index} to maintain recovery trajectory."
        )

    return {
        "scenario_projections": projections,
        "ai_prescription": prescription,
    }


@app.get("/api/patient/explain-alert")
def get_explain_alert(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return SHAP feature attributions and plain-language explanation for recent alert."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].copy()

    if XAIExplainer is not None:
        try:
            result = XAIExplainer().explain_latest_alert(patient_df.sort_values("timestamp"))
            return {"patient_id": patient_id, **result}
        except Exception:
            pass

    # Stub response matching contract
    if patient_id == "patient_1":
        return {
            "patient_id": patient_id,
            "explanation_summary": "All vitals are within personal baseline ranges. No significant deviation detected.",
            "feature_attributions": [
                {
                    "feature": "heart_rate",
                    "impact_percentage": 25.0,
                    "direction": "reduced_risk",
                    "current_value": 57.0,
                    "baseline_mean": 57.7,
                },
                {
                    "feature": "sleep_hours",
                    "impact_percentage": 22.0,
                    "direction": "reduced_risk",
                    "current_value": 8.1,
                    "baseline_mean": 8.1,
                },
                {
                    "feature": "stress_index",
                    "impact_percentage": 18.0,
                    "direction": "reduced_risk",
                    "current_value": 18.0,
                    "baseline_mean": 18.3,
                },
                {
                    "feature": "systolic_bp",
                    "impact_percentage": 15.0,
                    "direction": "reduced_risk",
                    "current_value": 112.0,
                    "baseline_mean": 112.4,
                },
                {
                    "feature": "spo2",
                    "impact_percentage": 12.0,
                    "direction": "reduced_risk",
                    "current_value": 98.0,
                    "baseline_mean": 98.3,
                },
                {
                    "feature": "daily_steps",
                    "impact_percentage": 8.0,
                    "direction": "reduced_risk",
                    "current_value": 11800.0,
                    "baseline_mean": 11416.0,
                },
            ],
        }
    elif patient_id == "patient_2":
        return {
            "patient_id": patient_id,
            "explanation_summary": "Elevated heart rate (+14 bpm) and reduced sleep (-2.5 h) are the primary drivers of multivariate anomaly detection against 7-day baseline.",
            "feature_attributions": [
                {
                    "feature": "heart_rate",
                    "impact_percentage": 34.5,
                    "direction": "increased_risk",
                    "current_value": 83.0,
                    "baseline_mean": 68.0,
                },
                {
                    "feature": "sleep_hours",
                    "impact_percentage": 28.0,
                    "direction": "increased_risk",
                    "current_value": 5.3,
                    "baseline_mean": 7.6,
                },
                {
                    "feature": "stress_index",
                    "impact_percentage": 20.5,
                    "direction": "increased_risk",
                    "current_value": 72.0,
                    "baseline_mean": 26.0,
                },
                {
                    "feature": "systolic_bp",
                    "impact_percentage": 11.0,
                    "direction": "increased_risk",
                    "current_value": 131.0,
                    "baseline_mean": 118.0,
                },
                {
                    "feature": "spo2",
                    "impact_percentage": 4.0,
                    "direction": "reduced_risk",
                    "current_value": 96.0,
                    "baseline_mean": 98.0,
                },
                {
                    "feature": "daily_steps",
                    "impact_percentage": 2.0,
                    "direction": "reduced_risk",
                    "current_value": 5400.0,
                    "baseline_mean": 8600.0,
                },
            ],
        }
    else:  # patient_3
        return {
            "patient_id": patient_id,
            "explanation_summary": "Steady normalization in resting heart rate and sleep duration indicate sustained post-viral recovery.",
            "feature_attributions": [
                {
                    "feature": "heart_rate",
                    "impact_percentage": 32.0,
                    "direction": "reduced_risk",
                    "current_value": 64.0,
                    "baseline_mean": 80.0,
                },
                {
                    "feature": "sleep_hours",
                    "impact_percentage": 28.0,
                    "direction": "reduced_risk",
                    "current_value": 7.9,
                    "baseline_mean": 5.9,
                },
                {
                    "feature": "stress_index",
                    "impact_percentage": 20.0,
                    "direction": "reduced_risk",
                    "current_value": 26.0,
                    "baseline_mean": 62.0,
                },
                {
                    "feature": "systolic_bp",
                    "impact_percentage": 10.0,
                    "direction": "reduced_risk",
                    "current_value": 115.0,
                    "baseline_mean": 128.0,
                },
                {
                    "feature": "daily_steps",
                    "impact_percentage": 6.0,
                    "direction": "reduced_risk",
                    "current_value": 8400.0,
                    "baseline_mean": 4200.0,
                },
                {
                    "feature": "spo2",
                    "impact_percentage": 4.0,
                    "direction": "reduced_risk",
                    "current_value": 98.0,
                    "baseline_mean": 95.5,
                },
            ],
        }


@app.post("/api/patient/log-vitals")
def post_log_vitals(payload: LogVitalsRequest) -> dict[str, Any]:
    """Append a new vital observation to in-memory DataFrame and write through to CSV."""
    validate_patient_id(payload.patient_id)

    timestamp = payload.timestamp or date.today().strftime("%Y-%m-%d")

    new_row = {
        "patient_id": payload.patient_id,
        "timestamp": timestamp,
        "heart_rate": payload.heart_rate,
        "spo2": payload.spo2,
        "systolic_bp": payload.systolic_bp,
        "sleep_hours": round(payload.sleep_hours, 1),
        "daily_steps": payload.daily_steps,
        "stress_index": payload.stress_index,
    }

    global _patients_df
    with _df_lock:
        if _patients_df.empty:
            load_dataset()

        new_row_df = pd.DataFrame([new_row])
        _patients_df = pd.concat([_patients_df, new_row_df], ignore_index=True)

        # Write through to CSV file
        CSV_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _patients_df.to_csv(CSV_FILE_PATH, index=False)

        patient_rows = int((_patients_df["patient_id"] == payload.patient_id).sum())

    return {
        "status": "ok",
        "rows": patient_rows,
    }
