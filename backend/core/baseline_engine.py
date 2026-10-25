"""HealthTwin X Baseline Engine.

Computes multi-scale rolling baselines:
- 7-day short-term baseline (acute response window, mean, upper/lower bounds ±2σ, z-score)
- 30-day long-term baseline (chronic homeostasis reference, mean, upper/lower bounds ±2σ, z-score)
- Dynamic baseline stability score (0-100)
- Drift percentage (Δ% between 7-day acute mean vs 30-day chronic reference)
"""

from typing import Any
import numpy as np
import pandas as pd

VITALS = [
    "heart_rate",
    "spo2",
    "systolic_bp",
    "sleep_hours",
    "daily_steps",
    "stress_index",
]


class BaselineEngine:
    """Computes individual multi-scale rolling physiological baselines."""

    @staticmethod
    def compute_stability_score(series: pd.Series, window: int = 14) -> float:
        """Compute baseline stability score (0-100) based on rolling coefficient of variation."""
        if len(series) < 3:
            return 90.0
        rolling_std = series.rolling(window=window, min_periods=2).std().fillna(0.0)
        rolling_mean = series.rolling(window=window, min_periods=1).mean().abs() + 1e-5
        cv = (rolling_std / rolling_mean).iloc[-1]
        # Low CV (0.01 - 0.05) -> 95-100 score; High CV (> 0.25) -> < 50 score
        score = max(5.0, min(100.0, 100.0 - (cv * 220.0)))
        return round(float(score), 1)

    @staticmethod
    def compute_baselines(
        df: pd.DataFrame,
        patient_id: str | None = None,
        return_all_days: bool = True,
        tail_count: int = 90,
    ) -> list[dict[str, Any]]:
        """Filter by patient_id, sort by timestamp, and compute 7-day & 30-day rolling baselines.

        For each of the 6 vitals, computes:
          - {col}_mean (7-day rolling mean)
          - {col}_upper_band (7-day mean + 2 * std)
          - {col}_lower_band (7-day mean - 2 * std)
          - {col}_zscore (7-day zscore)
          - {col}_mean_30d (30-day rolling mean)
          - {col}_upper_30d (30-day mean + 2 * std)
          - {col}_lower_30d (30-day mean - 2 * std)
          - {col}_zscore_30d (30-day zscore)
          - {col}_drift_pct (Δ% 7d vs 30d baseline)
          - {col}_stability (0-100 stability score)

        Returns:
          Timeline as list of JSON-safe dictionaries.
        """
        if df.empty:
            return []

        sub_df = df.copy()

        if patient_id is not None:
            sub_df = sub_df[sub_df["patient_id"] == patient_id]
        elif "patient_id" in sub_df.columns and sub_df["patient_id"].nunique() > 1:
            first_patient = sub_df["patient_id"].iloc[0]
            sub_df = sub_df[sub_df["patient_id"] == first_patient]

        if sub_df.empty:
            return []

        # Sort chronologically
        sub_df = sub_df.sort_values("timestamp").reset_index(drop=True)

        # Compute multi-scale rolling stats for each vital
        for col in VITALS:
            if col not in sub_df.columns:
                continue

            series = pd.to_numeric(sub_df[col], errors="coerce").astype(float)

            # 1. 7-day short-term baseline
            rolling_7 = series.rolling(window=7, min_periods=1)
            mean_7 = rolling_7.mean()
            std_7 = rolling_7.std(ddof=0).fillna(0.0)
            upper_7 = mean_7 + (2.0 * std_7)
            lower_7 = mean_7 - (2.0 * std_7)

            with np.errstate(divide="ignore", invalid="ignore"):
                diff_7 = series - mean_7
                z_7 = np.where(std_7 > 1e-6, diff_7 / std_7, 0.0)
                z_7 = np.nan_to_num(z_7, nan=0.0, posinf=0.0, neginf=0.0)

            # 2. 30-day long-term chronic baseline
            rolling_30 = series.rolling(window=30, min_periods=1)
            mean_30 = rolling_30.mean()
            std_30 = rolling_30.std(ddof=0).fillna(0.0)
            upper_30 = mean_30 + (2.0 * std_30)
            lower_30 = mean_30 - (2.0 * std_30)

            with np.errstate(divide="ignore", invalid="ignore"):
                diff_30 = series - mean_30
                z_30 = np.where(std_30 > 1e-6, diff_30 / std_30, 0.0)
                z_30 = np.nan_to_num(z_30, nan=0.0, posinf=0.0, neginf=0.0)

            # 3. Drift percentage: difference between 7d acute mean vs 30d chronic reference
            with np.errstate(divide="ignore", invalid="ignore"):
                drift_pct = np.where(mean_30 > 1e-6, ((mean_7 - mean_30) / mean_30) * 100.0, 0.0)
                drift_pct = np.nan_to_num(drift_pct, nan=0.0, posinf=0.0, neginf=0.0)

            # Store computed columns
            sub_df[f"{col}_mean"] = mean_7.round(2)
            sub_df[f"{col}_upper_band"] = upper_7.round(2)
            sub_df[f"{col}_lower_band"] = lower_7.round(2)
            sub_df[f"{col}_zscore"] = np.round(z_7, 2)

            sub_df[f"{col}_mean_30d"] = mean_30.round(2)
            sub_df[f"{col}_upper_30d"] = upper_30.round(2)
            sub_df[f"{col}_lower_30d"] = lower_30.round(2)
            sub_df[f"{col}_zscore_30d"] = np.round(z_30, 2)
            sub_df[f"{col}_drift_pct"] = np.round(drift_pct, 1)

            # Stability score rolling estimate
            rolling_stability = (
                100.0 - (std_7 / (mean_7 + 1e-5) * 200.0)
            ).clip(lower=10.0, upper=100.0)
            sub_df[f"{col}_stability"] = np.round(rolling_stability, 1)

        # Slice requested window or return all
        result_df = sub_df if return_all_days else sub_df.tail(tail_count)

        # Overall composite baseline stability
        overall_stability = np.mean([sub_df[f"{col}_stability"] for col in VITALS], axis=0)
        result_df["baseline_stability_score"] = np.round(overall_stability, 1)

        # Build clean JSON-safe dicts
        results: list[dict[str, Any]] = []
        for _, row in result_df.iterrows():
            day_dict: dict[str, Any] = {
                "timestamp": str(row["timestamp"]),
                "heart_rate": int(row["heart_rate"]),
                "spo2": int(row["spo2"]),
                "systolic_bp": int(row["systolic_bp"]),
                "sleep_hours": round(float(row["sleep_hours"]), 1),
                "daily_steps": int(row["daily_steps"]),
                "stress_index": int(row["stress_index"]),
                "baseline_stability_score": float(row.get("baseline_stability_score", 85.0)),
            }

            for col in VITALS:
                day_dict[f"{col}_mean"] = float(row[f"{col}_mean"])
                day_dict[f"{col}_upper_band"] = float(row[f"{col}_upper_band"])
                day_dict[f"{col}_lower_band"] = float(row[f"{col}_lower_band"])
                day_dict[f"{col}_zscore"] = float(row[f"{col}_zscore"])
                day_dict[f"{col}_mean_30d"] = float(row[f"{col}_mean_30d"])
                day_dict[f"{col}_upper_30d"] = float(row[f"{col}_upper_30d"])
                day_dict[f"{col}_lower_30d"] = float(row[f"{col}_lower_30d"])
                day_dict[f"{col}_zscore_30d"] = float(row[f"{col}_zscore_30d"])
                day_dict[f"{col}_drift_pct"] = float(row[f"{col}_drift_pct"])
                day_dict[f"{col}_stability"] = float(row[f"{col}_stability"])

            results.append(day_dict)

        return results
