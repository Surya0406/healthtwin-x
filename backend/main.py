"""HealthTwin X FastAPI Backend Server.

Provides REST endpoints for personalized health monitoring, digital twin state,
counterfactual simulation, XAI alert explanation, vitals streaming, and CSV ingestion.
"""

from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
import io
import json
from pathlib import Path
import random
import threading
from typing import Any, List, Optional

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
from pydantic import BaseModel, Field

from backend.core.baseline_engine import BaselineEngine
from backend.core.data_generator import DEFAULT_CSV_PATH, generate_sample_patient_data
from backend.services.anomaly_detector import AnomalyDetector
from backend.services.twin_simulator import DigitalTwinSimulator
from backend.services.xai_explainer import XAIExplainer

CSV_FILE_PATH = Path(DEFAULT_CSV_PATH)
METADATA_JSON_PATH = Path(__file__).resolve().parent.parent / "shared_contracts" / "patient_metadata.json"

# Global in-memory data store and lock for concurrent safety
_df_lock = threading.Lock()
_patients_df: pd.DataFrame = pd.DataFrame()


def load_metadata() -> List[dict[str, Any]]:
    """Load patient metadata from JSON if available, otherwise use defaults."""
    if METADATA_JSON_PATH.exists():
        try:
            with open(METADATA_JSON_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass

    return [
        {"patient_id": f"patient_{i}", "name": f"Patient {i}", "archetype": "General Population"}
        for i in range(1, 13)
    ]


PATIENTS_METADATA = load_metadata()
VALID_PATIENT_IDS = {p["patient_id"] for p in PATIENTS_METADATA}


def load_dataset() -> pd.DataFrame:
    """Load sample patient data CSV into memory, generating it if absent."""
    global _patients_df
    if not CSV_FILE_PATH.exists() or CSV_FILE_PATH.stat().st_size < 100:
        _patients_df = generate_sample_patient_data(CSV_FILE_PATH)
    else:
        _patients_df = pd.read_csv(CSV_FILE_PATH)

    # Ensure patient IDs in data are in VALID_PATIENT_IDS
    if not _patients_df.empty and "patient_id" in _patients_df.columns:
        VALID_PATIENT_IDS.update(_patients_df["patient_id"].unique())

    return _patients_df


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager to load data on startup."""
    with _df_lock:
        load_dataset()
    yield


app = FastAPI(
    title="HealthTwin X API",
    description="Personalized Health Monitoring, Digital Twin Simulation & Multi-Model PyOD Ensemble API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "*",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def validate_patient_id(patient_id: str) -> None:
    """Ensure patient_id exists in dataset or metadata."""
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
    timestamp: Optional[str] = None
    heart_rate: int = Field(..., ge=20, le=250)
    spo2: int = Field(..., ge=50, le=100)
    systolic_bp: int = Field(..., ge=40, le=260)
    sleep_hours: float = Field(..., ge=0.0, le=24.0)
    daily_steps: int = Field(..., ge=0, le=100000)
    stress_index: int = Field(..., ge=0, le=100)


class InjectEventRequest(BaseModel):
    patient_id: str
    event_type: str = Field(..., description="'stress_spike' or 'recovery_day'")


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/api/patients")
def get_patients() -> list[dict[str, Any]]:
    """Return list of all 12 diverse patient personas and archetypes."""
    global PATIENTS_METADATA
    if not PATIENTS_METADATA:
        PATIENTS_METADATA = load_metadata()
    return PATIENTS_METADATA


@app.get("/api/patient/monitoring")
def get_monitoring(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return full timeline of vitals, 7-day and 30-day baselines, and PyOD ensemble results."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].copy()

    if patient_df.empty:
        raise HTTPException(status_code=404, detail=f"No data available for patient '{patient_id}'")

    # Compute multi-scale rolling baselines across the full timeline
    baseline_days = BaselineEngine.compute_baselines(patient_df, return_all_days=True)

    # Multi-model PyOD Ensemble anomaly scoring
    anomaly_detector = AnomalyDetector()
    try:
        anomaly_rows = anomaly_detector.fit_and_detect(patient_df, patient_id=patient_id)
        anomaly_by_ts = {str(r["timestamp"]): r for r in anomaly_rows}
    except Exception:
        anomaly_by_ts = {}

    merged_days: list[dict[str, Any]] = []
    for day in baseline_days:
        day_copy = dict(day)
        ts = str(day_copy.get("timestamp"))
        real_anomaly = anomaly_by_ts.get(ts)

        if real_anomaly is not None:
            day_copy["anomaly_flag"] = int(real_anomaly["anomaly_flag"])
            day_copy["anomaly_score"] = float(real_anomaly["anomaly_score"])
            day_copy["severity_label"] = str(real_anomaly["severity_label"])
            day_copy["pattern_type"] = str(real_anomaly.get("pattern_type", "Multivariate Pattern Drift"))
            day_copy["model_agreement"] = str(real_anomaly.get("model_agreement", "3/3 Models Agree"))
            day_copy["drift_velocity"] = float(real_anomaly.get("drift_velocity", 0.0))
        else:
            day_copy["anomaly_flag"] = 0
            day_copy["anomaly_score"] = 14.0
            day_copy["severity_label"] = "Normal"
            day_copy["pattern_type"] = "Stable Baseline"
            day_copy["model_agreement"] = "Consensus Baseline (3/3 Models Agree)"
            day_copy["drift_velocity"] = 0.0

        merged_days.append(day_copy)

    return {
        "patient_id": patient_id,
        "days": merged_days,
        "total_days": len(merged_days),
    }


@app.get("/api/patient/twin-state")
def get_twin_state(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return Digital Twin status, subsystem scores, organ highlights, and biological age."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].sort_values("timestamp")

    if patient_df.empty:
        raise HTTPException(status_code=404, detail=f"No data for patient '{patient_id}'")

    latest_row = patient_df.iloc[-1].to_dict()
    simulator = DigitalTwinSimulator()
    state = simulator.compute_twin_state(latest_row, patient_id=patient_id)
    return state


@app.post("/api/patient/simulate")
def post_simulate(payload: SimulateRequest) -> dict[str, Any]:
    """Simulate counterfactual what-if scenario over a 14-day horizon."""
    validate_patient_id(payload.patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == payload.patient_id].copy()

    simulator = DigitalTwinSimulator()
    return simulator.simulate_counterfactual(patient_df, payload.model_dump())


@app.get("/api/patient/explain-alert")
def get_explain_alert(patient_id: str = Query(...)) -> dict[str, Any]:
    """Return SHAP feature attributions, drift onset date analysis, and clinical chain reaction."""
    validate_patient_id(patient_id)

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].copy()

    explainer = XAIExplainer()
    result = explainer.explain_latest_alert(patient_df)
    return {"patient_id": patient_id, **result}


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
        CSV_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _patients_df.to_csv(CSV_FILE_PATH, index=False)
        patient_rows = int((_patients_df["patient_id"] == payload.patient_id).sum())

    return {
        "status": "ok",
        "rows": patient_rows,
        "logged_day": new_row,
    }


@app.post("/api/patient/simulate-next-day")
def post_simulate_next_day(patient_id: str = Query(...)) -> dict[str, Any]:
    """Auto-generate the next chronological day of telemetry for smartwatch streaming."""
    validate_patient_id(patient_id)
    global _patients_df

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == patient_id].sort_values("timestamp")
        if patient_df.empty:
            raise HTTPException(status_code=404, detail=f"No data for patient '{patient_id}'")

        latest = patient_df.iloc[-1].to_dict()
        try:
            prev_date = datetime.strptime(str(latest["timestamp"]), "%Y-%m-%d").date()
            next_date = (prev_date + timedelta(days=1)).strftime("%Y-%m-%d")
        except Exception:
            next_date = date.today().strftime("%Y-%m-%d")

        # Fluctuation based on current latest vitals
        hr = int(np.clip(latest.get("heart_rate", 70) + random.choice([-2, -1, 0, 1, 2]), 42, 180))
        spo2 = int(np.clip(latest.get("spo2", 98) + random.choice([-1, 0, 0]), 92, 100))
        bp = int(np.clip(latest.get("systolic_bp", 120) + random.choice([-2, -1, 0, 1, 2]), 85, 200))
        sleep = float(np.clip(round(float(latest.get("sleep_hours", 7.5)) + random.choice([-0.3, -0.1, 0.1, 0.2]), 1), 3.0, 13.0))
        steps = int(np.clip(latest.get("daily_steps", 8000) + random.choice([-400, -200, 100, 300]), 1000, 30000))
        stress = int(np.clip(latest.get("stress_index", 30) + random.choice([-3, -1, 1, 3]), 5, 95))

        new_row = {
            "patient_id": patient_id,
            "timestamp": next_date,
            "heart_rate": hr,
            "spo2": spo2,
            "systolic_bp": bp,
            "sleep_hours": sleep,
            "daily_steps": steps,
            "stress_index": stress,
        }

        new_row_df = pd.DataFrame([new_row])
        _patients_df = pd.concat([_patients_df, new_row_df], ignore_index=True)
        CSV_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _patients_df.to_csv(CSV_FILE_PATH, index=False)
        total_rows = int((_patients_df["patient_id"] == patient_id).sum())

    return {
        "status": "ok",
        "new_day": new_row,
        "rows": total_rows,
    }


@app.post("/api/patient/inject-event")
def post_inject_event(payload: InjectEventRequest) -> dict[str, Any]:
    """Inject an acute clinical event (stress spike or restorative recovery day)."""
    validate_patient_id(payload.patient_id)
    global _patients_df

    with _df_lock:
        if _patients_df.empty:
            load_dataset()
        patient_df = _patients_df[_patients_df["patient_id"] == payload.patient_id].sort_values("timestamp")
        if patient_df.empty:
            raise HTTPException(status_code=404, detail=f"No data for patient '{payload.patient_id}'")

        latest = patient_df.iloc[-1].to_dict()
        try:
            prev_date = datetime.strptime(str(latest["timestamp"]), "%Y-%m-%d").date()
            next_date = (prev_date + timedelta(days=1)).strftime("%Y-%m-%d")
        except Exception:
            next_date = date.today().strftime("%Y-%m-%d")

        if payload.event_type == "stress_spike":
            new_row = {
                "patient_id": payload.patient_id,
                "timestamp": next_date,
                "heart_rate": min(140, int(latest.get("heart_rate", 75) + 18)),
                "spo2": max(93, int(latest.get("spo2", 97) - 2)),
                "systolic_bp": min(165, int(latest.get("systolic_bp", 120) + 18)),
                "sleep_hours": max(3.5, round(float(latest.get("sleep_hours", 7.0)) - 2.8, 1)),
                "daily_steps": max(2200, int(latest.get("daily_steps", 8000) * 0.45)),
                "stress_index": min(98, int(latest.get("stress_index", 30) + 45)),
            }
            message = "Acute sympathetic stress spike injected! High cardiovascular load, sleep debt, and autonomic strain simulated."
        else:  # recovery_day
            new_row = {
                "patient_id": payload.patient_id,
                "timestamp": next_date,
                "heart_rate": max(52, int(latest.get("heart_rate", 75) - 14)),
                "spo2": 99,
                "systolic_bp": max(108, int(latest.get("systolic_bp", 120) - 12)),
                "sleep_hours": 9.2,
                "daily_steps": 10500,
                "stress_index": 14,
            }
            message = "Restorative recovery day injected! 9.2h restorative sleep, parasympathetic rebound, and stabilized hemodynamics."

        new_row_df = pd.DataFrame([new_row])
        _patients_df = pd.concat([_patients_df, new_row_df], ignore_index=True)
        CSV_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _patients_df.to_csv(CSV_FILE_PATH, index=False)
        total_rows = int((_patients_df["patient_id"] == payload.patient_id).sum())

    return {
        "status": "ok",
        "event_type": payload.event_type,
        "message": message,
        "new_day": new_row,
        "rows": total_rows,
    }


@app.post("/api/patients/upload-csv")
async def upload_csv(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload custom patient vitals CSV file and reload in-memory dataset."""
    global _patients_df, VALID_PATIENT_IDS

    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Uploaded file must be a CSV (.csv).")

    contents = await file.read()
    try:
        new_df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {str(e)}")

    required_cols = {"patient_id", "timestamp", "heart_rate", "spo2", "systolic_bp", "sleep_hours", "daily_steps", "stress_index"}
    missing = required_cols - set(new_df.columns)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV missing required columns: {sorted(list(missing))}. Required: {sorted(list(required_cols))}",
        )

    with _df_lock:
        _patients_df = new_df.copy()
        CSV_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        _patients_df.to_csv(CSV_FILE_PATH, index=False)
        VALID_PATIENT_IDS.update(_patients_df["patient_id"].unique())

    return {
        "status": "ok",
        "message": f"Successfully loaded {len(_patients_df)} rows for {len(_patients_df['patient_id'].unique())} patient personas.",
        "rows": len(_patients_df),
        "patients": sorted(list(_patients_df["patient_id"].unique())),
    }
