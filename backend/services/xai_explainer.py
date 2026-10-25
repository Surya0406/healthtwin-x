"""SHAP-based explanations for deviations from personal vital baselines."""

from typing import Any

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import RandomForestRegressor

VITALS = (
    "heart_rate",
    "spo2",
    "systolic_bp",
    "sleep_hours",
    "daily_steps",
    "stress_index",
)

_RISK_DIRECTIONS = np.array([1.0, -1.0, 1.0, -1.0, -1.0, 1.0])
_ZERO_VARIANCE_SCALES = np.array([1.0, 1.0, 1.0, 0.25, 500.0, 2.0])
_FEATURE_LABELS = {
    "heart_rate": "heart rate",
    "spo2": "SpO2",
    "systolic_bp": "systolic blood pressure",
    "sleep_hours": "sleep",
    "daily_steps": "daily steps",
    "stress_index": "stress index",
}
_FEATURE_UNITS = {
    "heart_rate": "bpm",
    "spo2": "percentage points",
    "systolic_bp": "mmHg",
    "sleep_hours": "hours",
    "daily_steps": "steps",
    "stress_index": "points",
}


class XAIExplainer:
    """Explain the latest observation against a trailing 7-day personal baseline."""

    def explain_latest_alert(self, df: pd.DataFrame) -> dict[str, Any]:
        """Return a proxy-risk explanation with six SHAP feature attributions."""
        if df is None or df.empty:
            return {
                "explanation_summary": "No observations are available to explain.",
                "feature_attributions": [],
            }

        work = df.copy().reset_index(drop=True)
        work["_source_order"] = np.arange(len(work))
        if "timestamp" in work.columns:
            work["_sort_timestamp"] = pd.to_datetime(
                work["timestamp"], errors="coerce", utc=True
            )
        else:
            work["_sort_timestamp"] = pd.NaT

        for feature in VITALS:
            if feature not in work.columns:
                work[feature] = np.nan
            work[feature] = pd.to_numeric(work[feature], errors="coerce")
            work[feature] = work[feature].replace([np.inf, -np.inf], np.nan)

        target_by_row = np.zeros(len(work), dtype=float)
        fallback_by_row = np.zeros((len(work), len(VITALS)), dtype=float)
        baseline_means = np.full((len(work), len(VITALS)), np.nan, dtype=float)
        oriented_zscores = np.zeros((len(work), len(VITALS)), dtype=float)

        if "patient_id" in work.columns:
            patient_groups = work.groupby("patient_id", sort=False, dropna=False)
        else:
            patient_groups = [(None, work)]

        for _, patient_rows in patient_groups:
            ordered = patient_rows.sort_values(
                ["_sort_timestamp", "_source_order"], kind="stable", na_position="last"
            )
            raw_values = ordered.loc[:, list(VITALS)].to_numpy(dtype=float)
            group_indices = ordered.index.to_numpy()
            patient_fallbacks = (
                ordered.loc[:, list(VITALS)]
                .median(axis=0)
                .fillna(0.0)
                .to_numpy(dtype=float)
            )
            fallback_by_row[group_indices] = patient_fallbacks

            for feature_index in range(len(VITALS)):
                history = pd.Series(raw_values[:, feature_index]).shift(1)
                trailing = history.rolling(window=7, min_periods=1)
                means = trailing.mean().to_numpy(dtype=float)
                standard_deviations = trailing.std(ddof=0).to_numpy(dtype=float)
                current_values = raw_values[:, feature_index]
                no_prior_mean = np.isnan(means)
                means[no_prior_mean] = current_values[no_prior_mean]
                baseline_means[group_indices, feature_index] = means

                comparable = np.isfinite(current_values) & np.isfinite(means)
                deviations = np.zeros(len(current_values), dtype=float)
                scales = standard_deviations.copy()
                too_small = ~np.isfinite(scales) | (scales <= 1e-8)
                scales[too_small] = _ZERO_VARIANCE_SCALES[feature_index]
                deviations[comparable] = (
                    current_values[comparable] - means[comparable]
                ) / scales[comparable]
                oriented_zscores[group_indices, feature_index] = (
                    deviations * _RISK_DIRECTIONS[feature_index]
                )

            for source_index in group_indices:
                target_by_row[source_index] = float(
                    np.maximum(oriented_zscores[source_index], 0.0).sum()
                )

        # Build the model matrix in original row order from patient-local imputations.
        model_matrix = np.empty((len(work), len(VITALS)), dtype=float)
        for feature_index, feature in enumerate(VITALS):
            raw_values = work[feature].to_numpy(dtype=float)
            missing = ~np.isfinite(raw_values)
            raw_values[missing] = baseline_means[missing, feature_index]
            still_missing = ~np.isfinite(raw_values)
            raw_values[still_missing] = fallback_by_row[
                still_missing, feature_index
            ]
            model_matrix[:, feature_index] = raw_values

        model = RandomForestRegressor(
            n_estimators=100,
            random_state=42,
            max_depth=5,
        )

        latest_index = int(
            work.sort_values(
                ["_sort_timestamp", "_source_order"], kind="stable", na_position="last"
            ).index[-1]
        )
        if "patient_id" in work.columns:
            latest_patient_id = work.loc[latest_index, "patient_id"]
            if pd.isna(latest_patient_id):
                training_mask = work["patient_id"].isna().to_numpy()
            else:
                training_mask = work["patient_id"].eq(latest_patient_id).to_numpy()
        else:
            training_mask = np.ones(len(work), dtype=bool)
        model.fit(model_matrix[training_mask], target_by_row[training_mask])

        latest_features = model_matrix[[latest_index]]
        shap_values = shap.TreeExplainer(model).shap_values(latest_features)
        if isinstance(shap_values, list):
            shap_values = shap_values[0]
        shap_array = np.asarray(shap_values, dtype=float)
        if shap_array.ndim == 3:
            shap_array = shap_array[0]
        signed_shap = shap_array.reshape(-1, len(VITALS))[0]
        signed_shap = np.nan_to_num(signed_shap, nan=0.0, posinf=0.0, neginf=0.0)
        absolute_shap = np.abs(signed_shap)

        latest_baselines = baseline_means[latest_index]
        latest_values = work.loc[latest_index, list(VITALS)].to_numpy(dtype=float)
        latest_zscores = oriented_zscores[latest_index]
        if absolute_shap.sum() <= 1e-12:
            absolute_shap = np.abs(latest_zscores)
        if absolute_shap.sum() <= 1e-12:
            absolute_shap = np.ones(len(VITALS), dtype=float)
        impact_percentages = self._normalize_impacts(absolute_shap)

        attributions = []
        for feature_index, feature in enumerate(VITALS):
            current_value = latest_values[feature_index]
            baseline_mean = latest_baselines[feature_index]
            attributions.append(
                {
                    "feature": feature,
                    "impact_percentage": impact_percentages[feature_index],
                    "direction": (
                        "increased_risk"
                        if (
                            signed_shap[feature_index] > 1e-12
                            or (
                                abs(signed_shap[feature_index]) <= 1e-12
                                and latest_zscores[feature_index] > 0.0
                            )
                        )
                        else "reduced_risk"
                    ),
                    "current_value": (
                        float(current_value) if np.isfinite(current_value) else None
                    ),
                    "baseline_mean": (
                        float(baseline_mean) if np.isfinite(baseline_mean) else None
                    ),
                }
            )

        return {
            "explanation_summary": self._make_summary(
                latest_values, latest_baselines, latest_zscores, signed_shap
            ),
            "feature_attributions": attributions,
        }

    @staticmethod
    def _normalize_impacts(weights: np.ndarray) -> list[float]:
        percentages = np.round(weights / weights.sum() * 100.0, 2)
        percentages[-1] = round(100.0 - float(percentages[:-1].sum()), 2)
        return [float(value) for value in percentages]

    @staticmethod
    def _make_summary(
        current_values: np.ndarray,
        baseline_means: np.ndarray,
        oriented_zscores: np.ndarray,
        signed_shap: np.ndarray,
    ) -> str:
        significant_risk = np.flatnonzero(
            (oriented_zscores >= 1.5) & (signed_shap > 1e-12)
        )
        if significant_risk.size:
            ranked = significant_risk[
                np.argsort(signed_shap[significant_risk])[::-1]
            ]
            top_drivers = ranked[:2]
            top_descriptions = [
                XAIExplainer._format_deviation(
                    int(index), current_values, baseline_means, oriented_zscores
                )
                for index in top_drivers
            ]
            additional_deviations = [
                XAIExplainer._format_deviation(
                    int(index), current_values, baseline_means, oriented_zscores
                )
                for index in ranked[2:]
            ]
            summary = (
                "The largest model-attributed risk contributions are "
                + " and ".join(top_descriptions)
                + " relative to the 7-day personal baseline."
            )
            if additional_deviations:
                summary += (
                    " Other significant risk-increasing deviations include "
                    + ", ".join(additional_deviations)
                    + "."
                )
            summary += " This is a proxy-model explanation, not a validated clinical diagnosis."
            return summary

        significant_favorable = np.flatnonzero(
            (oriented_zscores <= -1.5) & (signed_shap < -1e-12)
        )
        if significant_favorable.size:
            return (
                "No significant deviation from the 7-day personal baseline was detected that "
                "increased the proxy risk prediction; some model contributions reflect favorable "
                "variation. This is not a validated clinical diagnosis."
            )
        return (
            "No significant deviation from the 7-day personal baseline was detected. "
            "This proxy explanation is not a validated clinical diagnosis."
        )

    @staticmethod
    def _format_deviation(
        feature_index: int,
        current_values: np.ndarray,
        baseline_means: np.ndarray,
        oriented_zscores: np.ndarray,
    ) -> str:
        feature = VITALS[feature_index]
        current = current_values[feature_index]
        baseline = baseline_means[feature_index]
        if not np.isfinite(current) or not np.isfinite(baseline):
            return _FEATURE_LABELS[feature]
        difference = abs(float(current - baseline))
        unit = _FEATURE_UNITS[feature]
        description = (
            "elevated"
            if _RISK_DIRECTIONS[feature_index] > 0
            else "reduced"
        )
        if oriented_zscores[feature_index] < 0.0:
            description = "reduced" if description == "elevated" else "elevated"
        return (
            f"{description} {_FEATURE_LABELS[feature]} "
            f"({difference:g} {unit} from baseline)"
        )
