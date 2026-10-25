"""Digital Twin Simulation Service for HealthTwin X.

Usage in main.py:
-----------------
from backend.services.twin_simulator import DigitalTwinSimulator

simulator = DigitalTwinSimulator()

# 1. In GET /api/patient/twin-state:
twin_state = simulator.compute_twin_state(latest_row)

# 2. In POST /api/patient/simulate:
simulation_result = simulator.simulate_counterfactual(patient_df, payload)
"""

from typing import Any
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from xgboost import XGBRegressor


# -----------------------------------------------------------------------------
# Named Module-Level Constants: Thresholds & Weights
# -----------------------------------------------------------------------------
SCORE_GREEN_MIN: int = 70
SCORE_AMBER_MIN: int = 45

# Physiological Ideal and Boundary Constants
HR_IDEAL: float = 60.0
HR_MAX: float = 100.0

BP_IDEAL: float = 115.0
BP_MAX: float = 150.0

SPO2_IDEAL: float = 98.0
SPO2_MIN: float = 90.0

SLEEP_IDEAL: float = 8.0
SLEEP_MIN: float = 5.0

STEPS_TARGET: float = 10000.0
STEPS_MIN: float = 3000.0

STRESS_IDEAL: float = 20.0
STRESS_MAX: float = 80.0

# Subsystem Component Weights
WEIGHT_CARDIO_HR: float = 0.60
WEIGHT_CARDIO_BP: float = 0.40

WEIGHT_RECOVERY_SLEEP: float = 0.50
WEIGHT_RECOVERY_STRESS: float = 0.50

WEIGHT_METABOLIC_STEPS: float = 0.60
WEIGHT_METABOLIC_SLEEP: float = 0.40

# Risk Calculation Constants
BASELINE_NORMAL_RISK: float = 15.0
WEIGHT_RISK_HR: float = 5.0
WEIGHT_RISK_BP: float = 3.0

# Safe Fallback Defaults for Missing / NaN Vitals
DEFAULT_HR: float = 70.0
DEFAULT_BP: float = 120.0
DEFAULT_SPO2: float = 98.0
DEFAULT_SLEEP: float = 7.5
DEFAULT_STEPS: float = 8000.0
DEFAULT_STRESS: float = 30.0

# Simulation Boundary Clips
HR_CLIP_MIN: float = 40.0
HR_CLIP_MAX: float = 180.0
BP_CLIP_MIN: float = 80.0
BP_CLIP_MAX: float = 200.0


def _score_linear_descending(val: float, ideal: float, worst: float) -> float:
    """Score where lower value is better (e.g., HR, BP, Stress)."""
    if val <= ideal:
        return 100.0
    if val >= worst:
        return 0.0
    return float(100.0 * (worst - val) / (worst - ideal))


def _score_linear_ascending(val: float, ideal: float, worst: float) -> float:
    """Score where higher value is better (e.g., SpO2, Sleep, Steps)."""
    if val >= ideal:
        return 100.0
    if val <= worst:
        return 0.0
    return float(100.0 * (val - worst) / (ideal - worst))


def _get_organ_color(score: int) -> str:
    """Determine organ highlight color based on score thresholds."""
    if score >= SCORE_GREEN_MIN:
        return "green"
    if score >= SCORE_AMBER_MIN:
        return "amber"
    return "red"


def _extract_vital(row: dict[str, Any], key: str, default: float) -> float:
    """Safely extract and convert a vital from input dictionary."""
    val = row.get(key)
    if val is None:
        return default
    try:
        f_val = float(val)
        if np.isnan(f_val):
            return default
        return f_val
    except (ValueError, TypeError):
        return default


class DigitalTwinSimulator:
    """Digital Twin Simulator providing physiological state scoring and counterfactual projections."""

    def __init__(self) -> None:
        """Initialize simulator instance with zero side effects at import/instantiation."""
        pass

    def compute_twin_state(self, latest_row: dict[str, Any] | pd.Series) -> dict[str, Any]:
        """Compute digital twin state, subsystem scores (0-100), and organ status.

        Args:
            latest_row: Dictionary or pd.Series representing the patient's latest vital readings.

        Returns:
            Dictionary matching the API contract with twin_status, scores, and organ_highlights.
            Includes patient_id only if present in the input.
        """
        # Ensure input is not mutated
        if isinstance(latest_row, pd.Series):
            row = latest_row.to_dict()
        elif isinstance(latest_row, dict):
            row = dict(latest_row)
        else:
            row = dict(latest_row)

        hr = _extract_vital(row, "heart_rate", DEFAULT_HR)
        bp = _extract_vital(row, "systolic_bp", DEFAULT_BP)
        spo2 = _extract_vital(row, "spo2", DEFAULT_SPO2)
        sleep = _extract_vital(row, "sleep_hours", DEFAULT_SLEEP)
        steps = _extract_vital(row, "daily_steps", DEFAULT_STEPS)
        stress = _extract_vital(row, "stress_index", DEFAULT_STRESS)

        # 1. Cardio strain index (drives heart)
        hr_score = _score_linear_descending(hr, HR_IDEAL, HR_MAX)
        bp_score = _score_linear_descending(bp, BP_IDEAL, BP_MAX)
        cardio_raw = (WEIGHT_CARDIO_HR * hr_score) + (WEIGHT_CARDIO_BP * bp_score)
        cardio_score = int(round(np.clip(cardio_raw, 0.0, 100.0)))

        # 2. Recovery readiness (drives brain_nervous)
        sleep_score = _score_linear_ascending(sleep, SLEEP_IDEAL, SLEEP_MIN)
        stress_score = _score_linear_descending(stress, STRESS_IDEAL, STRESS_MAX)
        recovery_raw = (WEIGHT_RECOVERY_SLEEP * sleep_score) + (WEIGHT_RECOVERY_STRESS * stress_score)
        recovery_score = int(round(np.clip(recovery_raw, 0.0, 100.0)))

        # 3. Respiratory stability (drives respiratory)
        spo2_score = _score_linear_ascending(spo2, SPO2_IDEAL, SPO2_MIN)
        respiratory_score = int(round(np.clip(spo2_score, 0.0, 100.0)))

        # 4. Metabolic stability (drives metabolism)
        steps_score = _score_linear_ascending(steps, STEPS_TARGET, STEPS_MIN)
        metabolic_raw = (WEIGHT_METABOLIC_STEPS * steps_score) + (WEIGHT_METABOLIC_SLEEP * sleep_score)
        metabolic_score = int(round(np.clip(metabolic_raw, 0.0, 100.0)))

        # Organ highlights
        heart_color = _get_organ_color(cardio_score)
        brain_color = _get_organ_color(recovery_score)
        respiratory_color = _get_organ_color(respiratory_score)
        metabolism_color = _get_organ_color(metabolic_score)

        organ_highlights = {
            "heart": heart_color,
            "brain_nervous": brain_color,
            "respiratory": respiratory_color,
            "metabolism": metabolism_color,
        }

        # Overall twin status determination:
        # Optimal if all four organs are green; Critical Drift if any organ is red or 2+ are amber; otherwise Strain Warning.
        red_count = sum(1 for c in organ_highlights.values() if c == "red")
        amber_count = sum(1 for c in organ_highlights.values() if c == "amber")

        if red_count == 0 and amber_count == 0:
            twin_status = "Optimal"
        elif red_count > 0 or amber_count >= 2:
            twin_status = "Critical Drift"
        else:
            twin_status = "Strain Warning"

        result: dict[str, Any] = {
            "twin_status": twin_status,
            "scores": {
                "cardio_strain_index": cardio_score,
                "recovery_readiness": recovery_score,
                "respiratory_stability": respiratory_score,
                "metabolic_stability": metabolic_score,
            },
            "organ_highlights": organ_highlights,
        }

        # Include patient_id only if it exists in input
        if "patient_id" in row and row["patient_id"] is not None:
            result["patient_id"] = str(row["patient_id"])

        return result

    def simulate_counterfactual(
        self,
        df: pd.DataFrame,
        modified_inputs: dict[str, Any] | Any,
        horizon_days: int = 7,
    ) -> dict[str, Any]:
        """Simulate counterfactual what-if scenario over a multi-day horizon.

        Args:
            df: Patient vitals history DataFrame.
            modified_inputs: Dict or Pydantic model with sleep_hours, daily_steps, stress_index.
            horizon_days: Number of forward projection days (default 7).

        Returns:
            Dictionary matching the API contract containing scenario_projections and ai_prescription.
        """
        # Ensure input DataFrame is not mutated
        df_copy = df.copy()

        # Handle multiple patients if present
        if "patient_id" in df_copy.columns and df_copy["patient_id"].nunique() > 1:
            first_patient = df_copy["patient_id"].iloc[0]
            df_copy = df_copy[df_copy["patient_id"] == first_patient].copy()

        # Sort chronologically if timestamp exists
        if "timestamp" in df_copy.columns:
            df_copy = df_copy.sort_values("timestamp").reset_index(drop=True)
        else:
            df_copy = df_copy.reset_index(drop=True)

        # Parse modified_inputs safely (accepting dict or Pydantic object)
        if hasattr(modified_inputs, "model_dump"):
            mod_dict = modified_inputs.model_dump()
        elif hasattr(modified_inputs, "dict"):
            mod_dict = modified_inputs.dict()
        elif isinstance(modified_inputs, dict):
            mod_dict = dict(modified_inputs)
        else:
            mod_dict = dict(modified_inputs)

        mod_sleep = _extract_vital(mod_dict, "sleep_hours", DEFAULT_SLEEP)
        mod_steps = _extract_vital(mod_dict, "daily_steps", DEFAULT_STEPS)
        mod_stress = _extract_vital(mod_dict, "stress_index", DEFAULT_STRESS)

        # Handle graceful fallback if history is very short (< 10 rows)
        if len(df_copy) < 10:
            return self._build_fallback_projection(df_copy, mod_sleep, mod_steps, mod_stress, horizon_days)

        # Prepare feature matrix X and targets y
        feature_cols = ["sleep_hours", "daily_steps", "stress_index"]
        target_cols = ["heart_rate", "systolic_bp"]

        X_train = df_copy[feature_cols].values.astype(float)
        y_train = df_copy[target_cols].values.astype(float)

        # Fit XGBoost Regressor (multi-target, deterministic random_state=42)
        xgb_model = XGBRegressor(
            n_estimators=60,
            max_depth=2,
            learning_rate=0.1,
            random_state=42,
        )
        xgb_model.fit(X_train, y_train)

        # Fit Ridge Regression with standardized inputs
        ridge_pipe = make_pipeline(StandardScaler(), Ridge(alpha=1.0))
        ridge_pipe.fit(X_train, y_train)

        # Predict function: ensemble average of XGBoost and Ridge
        def _predict_ensemble(X_in: np.ndarray) -> np.ndarray:
            pred_xgb = xgb_model.predict(X_in)
            pred_ridge = ridge_pipe.predict(X_in)
            return 0.5 * (pred_xgb + pred_ridge)

        # Latest row vital anchoring
        latest_row = df_copy.iloc[-1].to_dict()
        actual_latest_hr = float(latest_row.get("heart_rate", DEFAULT_HR))
        actual_latest_bp = float(latest_row.get("systolic_bp", DEFAULT_BP))

        latest_X = X_train[-1:]
        pred_latest = _predict_ensemble(latest_X)[0]
        residual_hr = actual_latest_hr - float(pred_latest[0])
        residual_bp = actual_latest_bp - float(pred_latest[1])

        # Baseline recent 7-day average lifestyle
        recent_window = df_copy.tail(7)
        base_sleep = float(recent_window["sleep_hours"].mean())
        base_steps = float(recent_window["daily_steps"].mean())
        base_stress = float(recent_window["stress_index"].mean())

        # Patient's normal baseline stats from the first 30 rows
        normal_window = df_copy.iloc[:30]
        norm_hr_mean = float(normal_window["heart_rate"].mean())
        norm_hr_std = max(float(normal_window["heart_rate"].std(ddof=0)), 1.0)
        norm_bp_mean = float(normal_window["systolic_bp"].mean())
        norm_bp_std = max(float(normal_window["systolic_bp"].std(ddof=0)), 1.0)

        def _calc_risk_score(hr_val: float, bp_val: float) -> int:
            z_hr = max(0.0, (hr_val - norm_hr_mean) / norm_hr_std)
            z_bp = max(0.0, (bp_val - norm_bp_mean) / norm_bp_std)
            raw = BASELINE_NORMAL_RISK + (WEIGHT_RISK_HR * z_hr) + (WEIGHT_RISK_BP * z_bp)
            return int(round(np.clip(raw, 0.0, 100.0)))

        # Build projections across horizon days
        projections: list[dict[str, Any]] = []

        # Baseline trajectory inputs: recent 7-day average held constant
        base_features = np.array([[base_sleep, base_steps, base_stress]])
        pred_base_raw = _predict_ensemble(base_features)[0]
        base_hr_val = float(np.clip(pred_base_raw[0] + residual_hr, HR_CLIP_MIN, HR_CLIP_MAX))
        base_bp_val = float(np.clip(pred_base_raw[1] + residual_bp, BP_CLIP_MIN, BP_CLIP_MAX))
        base_risk_val = _calc_risk_score(base_hr_val, base_bp_val)

        day7_cf_hr = base_hr_val
        day7_cf_bp = base_bp_val

        for day_idx in range(1, horizon_days + 1):
            alpha = float(day_idx) / float(horizon_days)

            # Counterfactual eases linearly from recent 7-day average to modified_inputs
            cf_sleep = base_sleep + alpha * (mod_sleep - base_sleep)
            cf_steps = base_steps + alpha * (mod_steps - base_steps)
            cf_stress = base_stress + alpha * (mod_stress - base_stress)

            cf_features = np.array([[cf_sleep, cf_steps, cf_stress]])
            pred_cf_raw = _predict_ensemble(cf_features)[0]

            cf_hr_val = float(np.clip(pred_cf_raw[0] + residual_hr, HR_CLIP_MIN, HR_CLIP_MAX))
            cf_bp_val = float(np.clip(pred_cf_raw[1] + residual_bp, BP_CLIP_MIN, BP_CLIP_MAX))
            cf_risk_val = _calc_risk_score(cf_hr_val, cf_bp_val)

            if day_idx == horizon_days:
                day7_cf_hr = cf_hr_val
                day7_cf_bp = cf_bp_val

            projections.append({
                "day": f"Day +{day_idx}",
                "baseline_trajectory_hr": round(base_hr_val, 1),
                "counterfactual_trajectory_hr": round(cf_hr_val, 1),
                "baseline_risk_score": base_risk_val,
                "counterfactual_risk_score": cf_risk_val,
            })

        # Generate AI prescription reacting to slider values and grid search
        ai_prescription = self._generate_prescription(
            latest_row=latest_row,
            predict_ensemble_fn=_predict_ensemble,
            residual_hr=residual_hr,
            residual_bp=residual_bp,
            base_lifestyle=(base_sleep, base_steps, base_stress),
            slider_inputs=(mod_sleep, mod_steps, mod_stress),
            day7_vitals=(day7_cf_hr, day7_cf_bp),
        )

        return {
            "scenario_projections": projections,
            "ai_prescription": ai_prescription,
        }

    def _generate_prescription(
        self,
        latest_row: dict[str, Any],
        predict_ensemble_fn: Any,
        residual_hr: float,
        residual_bp: float,
        base_lifestyle: tuple[float, float, float],
        slider_inputs: tuple[float, float, float],
        day7_vitals: tuple[float, float],
    ) -> str:
        """Generate clinical AI prescription reacting to slider settings and grid search."""
        # 1. If patient's current state is already Optimal, acknowledge directly
        current_state = self.compute_twin_state(latest_row)
        if current_state["twin_status"] == "Optimal":
            return "Twin is currently Optimal. Maintain your current healthy routine and lifestyle balance."

        mod_sleep, mod_steps, mod_stress = slider_inputs
        day7_hr, day7_bp = day7_vitals
        spo2_val = _extract_vital(latest_row, "spo2", DEFAULT_SPO2)

        # 2. Check if the slider plan restores the twin to Optimal by Day 7
        slider_day7_row = {
            "heart_rate": day7_hr,
            "systolic_bp": day7_bp,
            "spo2": spo2_val,
            "sleep_hours": mod_sleep,
            "daily_steps": mod_steps,
            "stress_index": mod_stress,
        }
        slider_day7_state = self.compute_twin_state(slider_day7_row)

        if slider_day7_state["twin_status"] == "Optimal":
            return (
                f"Your chosen plan restores your twin to Optimal by Day 7 "
                f"({mod_sleep:.1f} hours of sleep, {int(mod_steps):,} daily steps, and a stress index near {int(mod_stress)})."
            )

        # 3. Otherwise, search grid preferring the lowest stress change that works
        base_sl, base_stp, base_str = base_lifestyle
        sleep_range = np.arange(6.0, 9.1, 0.5)
        step_range = np.arange(4000, 12001, 1000)
        stress_range = np.arange(10, 51, 5)

        grid_points = []
        for sl in sleep_range:
            for stp in step_range:
                for str_val in stress_range:
                    grid_points.append([round(float(sl), 1), int(stp), int(str_val)])

        grid_X = np.array(grid_points, dtype=float)
        batch_preds = predict_ensemble_fn(grid_X)
        pred_hrs = np.clip(batch_preds[:, 0] + residual_hr, HR_CLIP_MIN, HR_CLIP_MAX)
        pred_bps = np.clip(batch_preds[:, 1] + residual_bp, BP_CLIP_MIN, BP_CLIP_MAX)

        scale_sl = 3.0
        scale_stp = 8000.0
        scale_str = 40.0

        optimal_candidates: list[tuple[float, float, float, int, int]] = []
        best_candidate: tuple[float, float, int, int] | None = None
        best_avg_score = -1.0

        for idx, (sl, stp, str_val) in enumerate(grid_points):
            synth_row = {
                "heart_rate": pred_hrs[idx],
                "systolic_bp": pred_bps[idx],
                "spo2": spo2_val,
                "sleep_hours": sl,
                "daily_steps": stp,
                "stress_index": str_val,
            }
            state = self.compute_twin_state(synth_row)

            stress_diff = abs(str_val - base_str)
            dist = (
                ((sl - base_sl) / scale_sl) ** 2
                + ((stp - base_stp) / scale_stp) ** 2
                + ((str_val - base_str) / scale_str) ** 2
            )

            avg_score = sum(state["scores"].values()) / 4.0
            if avg_score > best_avg_score:
                best_avg_score = avg_score
                best_candidate = (dist, sl, stp, str_val)

            if state["twin_status"] == "Optimal":
                # Sort by lowest stress change first, then overall normalized distance
                optimal_candidates.append((stress_diff, dist, sl, stp, str_val))

        if optimal_candidates:
            optimal_candidates.sort(key=lambda item: (item[0], item[1]))
            _, _, best_sl, best_stp, best_str = optimal_candidates[0]
            return (
                f"The chosen plan does not restore your twin to Optimal by Day 7. "
                f"Recommended target: aim for {best_sl:.1f} hours of sleep, "
                f"{best_stp:,} daily steps, and a stress index near {best_str}."
            )

        if best_candidate is not None:
            _, best_sl, best_stp, best_str = best_candidate
            return (
                f"The chosen plan does not restore your twin to Optimal by Day 7. "
                f"Best available target: aim for {best_sl:.1f} hours of sleep, "
                f"{best_stp:,} daily steps, and a stress index near {best_str}."
            )

        return "Maintain regular sleep schedule, moderate activity, and stress management."

    def _build_fallback_projection(
        self,
        df: pd.DataFrame,
        mod_sleep: float,
        mod_steps: float,
        mod_stress: float,
        horizon_days: int,
    ) -> dict[str, Any]:
        """Graceful fallback projection when dataset has fewer than 10 records."""
        latest_hr = float(df["heart_rate"].iloc[-1]) if not df.empty and "heart_rate" in df.columns else DEFAULT_HR
        projections = []
        for d in range(1, horizon_days + 1):
            projections.append({
                "day": f"Day +{d}",
                "baseline_trajectory_hr": round(latest_hr, 1),
                "counterfactual_trajectory_hr": round(latest_hr, 1),
                "baseline_risk_score": 25,
                "counterfactual_risk_score": 25,
            })
        return {
            "scenario_projections": projections,
            "ai_prescription": "Maintain regular sleep schedule, moderate activity, and stress management.",
        }
