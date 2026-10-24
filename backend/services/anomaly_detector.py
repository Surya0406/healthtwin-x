import os
import json
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from pyod.models.iforest import IForest
from sklearn.preprocessing import StandardScaler


class AnomalyDetector:
    """
    Multivariate Anomaly Detector for HealthTwin X using Isolation Forest (PyOD).
    Fits an individual patient's baseline reference window and scores vitals drift.
    """

    CORE_VITALS = [
        "heart_rate",
        "spo2",
        "systolic_bp",
        "sleep_hours",
        "daily_steps",
        "stress_index",
    ]

    FEATURE_COLS = CORE_VITALS + [
        "hr_diff3",
        "sleep_diff3",
        "stress_diff3",
        "hr_to_sleep_ratio",
    ]

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.model: Optional[IForest] = None
        self.scaler: Optional[StandardScaler] = None
        self.ref_min: float = 0.0
        self.ref_max: float = 1.0
        self.scored_df: Optional[pd.DataFrame] = None
        self.full_history: List[Dict[str, Any]] = []

    def _prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Sort by timestamp, compute 3-day rolling deltas and ratios, and fill rolling NaNs.
        """
        pdf = df.copy()
        if "timestamp" in pdf.columns:
            pdf = pdf.sort_values("timestamp")

        # Compute 3-day deltas for heart_rate, sleep_hours, and stress_index
        pdf["hr_diff3"] = pdf["heart_rate"].diff(3)
        pdf["sleep_diff3"] = pdf["sleep_hours"].diff(3)
        pdf["stress_diff3"] = pdf["stress_index"].diff(3)

        # Compute heart_rate to sleep_hours ratio safely
        pdf["hr_to_sleep_ratio"] = pdf["heart_rate"] / (pdf["sleep_hours"] + 1e-6)

        # Fill rolling NaNs (backward fill then fillna 0 for edge cases)
        pdf = pdf.bfill().fillna(0.0)
        return pdf

    def _determine_reference_window(self, pdf: pd.DataFrame) -> pd.DataFrame:
        """
        Determine the patient's personal normal reference window.
        Defaults to the first 30 days. If the patient experienced severe acute strain
        early and steadily recovered (detected via stress divergence), adjust the reference
        window to the recovered baseline period.
        """
        n_rows = len(pdf)
        ref_days = min(30, n_rows)
        first_window = pdf.iloc[:ref_days]

        if n_rows >= 45:
            last_window = pdf.iloc[-15:]
            # If early period had substantially higher stress than the later recovery window
            if first_window["stress_index"].mean() > last_window["stress_index"].mean() + 15.0:
                return last_window

        return first_window

    def fit_and_detect(
        self,
        df: pd.DataFrame,
        patient_id: Optional[str] = None,
        return_last_n: int = 14,
    ) -> List[Dict[str, Any]]:
        """
        Fit IForest on the patient's reference window and score all rows.
        Returns the last `return_last_n` rows (default 14) as a list of dicts.
        """
        if df.empty:
            return []

        # Safe multi-patient handling: filter or pick first patient
        work_df = df.copy()
        if "patient_id" in work_df.columns:
            unique_patients = work_df["patient_id"].unique()
            if patient_id is not None:
                work_df = work_df[work_df["patient_id"] == patient_id]
            elif len(unique_patients) > 1:
                # Default to the first patient if multi-patient df passed without filter
                work_df = work_df[work_df["patient_id"] == unique_patients[0]]

        # Prepare features
        prepared_df = self._prepare_features(work_df)

        # Select reference window
        ref_df = self._determine_reference_window(prepared_df)

        # Standardize features
        self.scaler = StandardScaler()
        X_ref = self.scaler.fit_transform(ref_df[self.FEATURE_COLS])
        X_all = self.scaler.transform(prepared_df[self.FEATURE_COLS])

        # Fit Isolation Forest (random_state=42, no hard-coded contamination)
        self.model = IForest(random_state=self.random_state)
        self.model.fit(X_ref)

        # Decision function scoring (higher decision score = more anomalous)
        raw_all = self.model.decision_function(X_all)
        raw_ref = self.model.decision_function(X_ref)

        self.ref_min = float(np.min(raw_ref))
        self.ref_max = float(np.max(raw_ref))
        spread = max(self.ref_max - self.ref_min, 1e-6)

        # Normalize to anomaly_score 0-100 (min-max against reference window's score range, clipped to 0-100)
        # Normal reference window maps within [0, 35], drift into moderate (40-69) and critical (>=70)
        scores = np.where(
            raw_all <= self.ref_max,
            np.clip((raw_all - self.ref_min) / spread * 35.0, 0.0, 35.0),
            np.clip(35.0 + (raw_all - self.ref_max) / spread * 65.0, 35.0, 100.0),
        )
        scores = np.round(scores, 1)

        # Compute flags and severity labels
        # anomaly_flag: 1 if score >= 40 else 0
        # severity_label: <40 "Normal", 40-69 "Moderate Pattern Drift", >=70 "Critical Multivariate Anomaly"
        anomaly_flags = (scores >= 40).astype(int)

        severity_labels = []
        for s in scores:
            if s >= 70.0:
                severity_labels.append("Critical Multivariate Anomaly")
            elif s >= 40.0:
                severity_labels.append("Moderate Pattern Drift")
            else:
                severity_labels.append("Normal")

        # Attach to dataframe
        prepared_df["anomaly_score"] = scores
        prepared_df["anomaly_flag"] = anomaly_flags
        prepared_df["severity_label"] = severity_labels

        self.scored_df = prepared_df.copy()

        # Build clean, JSON-serializable output list
        all_records: List[Dict[str, Any]] = []
        for _, row in prepared_df.iterrows():
            record = {
                "timestamp": str(row["timestamp"]),
                "heart_rate": float(row["heart_rate"]),
                "spo2": int(row["spo2"]) if not pd.isna(row["spo2"]) else 98,
                "systolic_bp": float(row["systolic_bp"]),
                "sleep_hours": float(row["sleep_hours"]),
                "daily_steps": int(row["daily_steps"]) if not pd.isna(row["daily_steps"]) else 0,
                "stress_index": float(row["stress_index"]),
                "anomaly_flag": int(row["anomaly_flag"]),
                "anomaly_score": float(np.round(row["anomaly_score"], 1)),
                "severity_label": str(row["severity_label"]),
            }
            all_records.append(record)

        self.full_history = all_records

        if return_last_n is not None and return_last_n > 0:
            return all_records[-return_last_n:]
        return all_records

    def fit_and_detect_all(self, df: pd.DataFrame, return_last_n: int = 14) -> Dict[str, List[Dict[str, Any]]]:
        """
        Convenience method to process all unique patients in a multi-patient dataframe.
        """
        results: Dict[str, List[Dict[str, Any]]] = {}
        if "patient_id" not in df.columns:
            results["default"] = self.fit_and_detect(df, return_last_n=return_last_n)
            return results

        for pid in df["patient_id"].unique():
            patient_df = df[df["patient_id"] == pid]
            detector = AnomalyDetector(random_state=self.random_state)
            results[str(pid)] = detector.fit_and_detect(patient_df, return_last_n=return_last_n)
        return results


def get_default_csv_path() -> str:
    """
    Default to shared_contracts/sample_patient_data.csv if it exists,
    otherwise local_dev/sample_patient_data.csv.
    """
    shared = Path("shared_contracts/sample_patient_data.csv")
    if shared.exists():
        return str(shared)
    return str(Path("local_dev/sample_patient_data.csv"))


if __name__ == "__main__":
    csv_file = get_default_csv_path()
    print(f"Loading data from: {csv_file}")
    patient_data = pd.read_csv(csv_file)

    detector = AnomalyDetector(random_state=42)
    patient_ids = patient_data["patient_id"].unique() if "patient_id" in patient_data.columns else ["default"]

    for pid in patient_ids:
        print(f"\n==================== Patient: {pid} (Last 14 Days) ====================")
        last_14 = detector.fit_and_detect(patient_data, patient_id=pid, return_last_n=14)
        print(json.dumps(last_14, indent=2))
