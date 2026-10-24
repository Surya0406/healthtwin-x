"""HealthTwin X Baseline Engine.

Computes 7-day rolling baselines (mean, upper band, lower band, z-score)
for the 6 core vitals and returns JSON-safe dictionaries for the last 14 days.
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
    """Computes individual rolling physiological baselines."""

    @staticmethod
    def compute_baselines(
        df: pd.DataFrame,
        patient_id: str | None = None,
        window: int = 7,
    ) -> list[dict[str, Any]]:
        """Filter by patient_id, sort by timestamp, and compute 7-day rolling baselines.

        For each of the 6 vitals, computes:
          - {col}_mean: rolling mean
          - {col}_upper_band: mean + 2 * std
          - {col}_lower_band: mean - 2 * std
          - {col}_zscore: (current - mean) / std (guarded against std=0 and NaN)

        Returns:
          The last 14 days as list of JSON-safe dictionaries.
        """
        if df.empty:
            return []

        sub_df = df.copy()

        # If patient_id is provided, filter by it;
        # otherwise if multiple patient_ids exist in df and one wasn't specified,
        # use the first patient_id or expect sub_df to already be filtered.
        if patient_id is not None:
            sub_df = sub_df[sub_df["patient_id"] == patient_id]
        elif "patient_id" in sub_df.columns and sub_df["patient_id"].nunique() > 1:
            first_patient = sub_df["patient_id"].iloc[0]
            sub_df = sub_df[sub_df["patient_id"] == first_patient]

        if sub_df.empty:
            return []

        # Sort chronologically
        sub_df = sub_df.sort_values("timestamp").reset_index(drop=True)

        # Compute rolling stats for each vital
        for col in VITALS:
            if col not in sub_df.columns:
                continue

            series = pd.to_numeric(sub_df[col], errors="coerce").astype(float)
            rolling = series.rolling(window=window, min_periods=1)
            rolling_mean = rolling.mean()
            rolling_std = rolling.std(ddof=0).fillna(0.0)

            upper_band = rolling_mean + (2.0 * rolling_std)
            lower_band = rolling_mean - (2.0 * rolling_std)

            # Guard against zero std or NaN
            with np.errstate(divide="ignore", invalid="ignore"):
                diff = series - rolling_mean
                zscore = np.where(rolling_std > 1e-6, diff / rolling_std, 0.0)
                zscore = np.nan_to_num(zscore, nan=0.0, posinf=0.0, neginf=0.0)

            sub_df[f"{col}_mean"] = rolling_mean.round(2)
            sub_df[f"{col}_upper_band"] = upper_band.round(2)
            sub_df[f"{col}_lower_band"] = lower_band.round(2)
            sub_df[f"{col}_zscore"] = np.round(zscore, 2)

        # Slice the last 14 days
        last_14 = sub_df.tail(14).copy()

        # Build clean JSON-safe dicts
        results: list[dict[str, Any]] = []
        for _, row in last_14.iterrows():
            day_dict: dict[str, Any] = {
                "timestamp": str(row["timestamp"]),
                "heart_rate": int(row["heart_rate"]),
                "spo2": int(row["spo2"]),
                "systolic_bp": int(row["systolic_bp"]),
                "sleep_hours": round(float(row["sleep_hours"]), 1),
                "daily_steps": int(row["daily_steps"]),
                "stress_index": int(row["stress_index"]),
            }

            for col in VITALS:
                day_dict[f"{col}_mean"] = float(row[f"{col}_mean"])
                day_dict[f"{col}_upper_band"] = float(row[f"{col}_upper_band"])
                day_dict[f"{col}_lower_band"] = float(row[f"{col}_lower_band"])
                day_dict[f"{col}_zscore"] = float(row[f"{col}_zscore"])

            results.append(day_dict)

        return results
