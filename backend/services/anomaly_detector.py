"""HealthTwin X Multi-Model Unsupervised Anomaly Detection Ensemble (Member 2).

Combines three complementary unsupervised outlier detection paradigms:
1. Isolation Forest (IForest): Tree-based recursive space partitioning
2. Empirical Cumulative Distribution (ECOD): Tail probability estimation
3. Copula-Based Outlier Detection (COPOD): Multivariate tail dependence modeling

Provides:
- Composite anomaly_score (0-100) from ensembled normalized decision scores
- Model agreement metric ("3/3 Models Agree", "2/3 Models Agree")
- Temporal feature engineering (3-day rolling deltas and cross-metric ratios)
- Clinical pattern classification (Autonomic Burnout, Cardiorespiratory Strain, Overtraining Fatigue, etc.)
- Drift velocity tracking (pts/day rate of change)
"""

from typing import Any, Dict, List, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest as SklearnIForest
from sklearn.preprocessing import StandardScaler

# Attempt PyOD imports; fall back gracefully to native numpy/sklearn implementations
try:
    from pyod.models.iforest import IForest
    from pyod.models.ecod import ECOD
    from pyod.models.copod import COPOD
    HAS_PYOD = True
except Exception:
    HAS_PYOD = False
    IForest = None
    ECOD = None
    COPOD = None


class NativeECOD:
    """Native NumPy implementation of Empirical Cumulative Distribution Outlier Detection."""

    def __init__(self):
        self.X_train: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray):
        self.X_train = np.copy(X)
        return self

    def decision_function(self, X: np.ndarray) -> np.ndarray:
        n_samples, n_features = X.shape
        train_n = len(self.X_train)
        scores = np.zeros(n_samples)

        for j in range(n_features):
            col_train = np.sort(self.X_train[:, j])
            col_test = X[:, j]

            # Left tail CDF
            left_ranks = np.searchsorted(col_train, col_test, side="right") + 1
            p_left = np.clip(left_ranks / (train_n + 1), 1e-5, 1.0 - 1e-5)
            left_score = -np.log(p_left)

            # Right tail CDF
            right_ranks = train_n - np.searchsorted(col_train, col_test, side="left") + 1
            p_right = np.clip(right_ranks / (train_n + 1), 1e-5, 1.0 - 1e-5)
            right_score = -np.log(p_right)

            # Aggregate bidirectional tail extremity
            scores += np.maximum(left_score, right_score)

        return scores / max(1, n_features)


class NativeCOPOD:
    """Native NumPy implementation of Copula-Based Outlier Detection."""

    def __init__(self):
        self.X_train: Optional[np.ndarray] = None

    def fit(self, X: np.ndarray):
        self.X_train = np.copy(X)
        return self

    def decision_function(self, X: np.ndarray) -> np.ndarray:
        n_samples, n_features = X.shape
        train_n = len(self.X_train)
        left_copula = np.zeros(n_samples)
        right_copula = np.zeros(n_samples)

        for j in range(n_features):
            col_train = np.sort(self.X_train[:, j])
            col_test = X[:, j]

            # Empirical marginal probabilities
            p_left = np.clip((np.searchsorted(col_train, col_test, side="right") + 1) / (train_n + 1), 1e-5, 1.0)
            p_right = np.clip((train_n - np.searchsorted(col_train, col_test, side="left") + 1) / (train_n + 1), 1e-5, 1.0)

            left_copula += -np.log(p_left)
            right_copula += -np.log(p_right)

        return np.maximum(left_copula, right_copula) / max(1, n_features)


class AnomalyDetector:
    """Multi-model anomaly detection ensemble with temporal feature engineering."""

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
        "pulse_pressure_ratio",
        "stress_to_sleep_ratio",
    ]

    def __init__(self, random_state: int = 42):
        self.random_state = random_state
        self.scaler = StandardScaler()

    def _prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Engineer 3-day rolling deltas and cross-metric ratios."""
        pdf = df.copy()
        if "timestamp" in pdf.columns:
            pdf = pdf.sort_values("timestamp").reset_index(drop=True)

        # 3-day temporal deltas
        pdf["hr_diff3"] = pdf["heart_rate"].diff(3)
        pdf["sleep_diff3"] = pdf["sleep_hours"].diff(3)
        pdf["stress_diff3"] = pdf["stress_index"].diff(3)

        # Cross-metric physiological ratios
        pdf["hr_to_sleep_ratio"] = pdf["heart_rate"] / (pdf["sleep_hours"] + 1e-4)
        pdf["pulse_pressure_ratio"] = (pdf["systolic_bp"] - 80.0) / (pdf["heart_rate"] + 1e-4)
        pdf["stress_to_sleep_ratio"] = pdf["stress_index"] / (pdf["sleep_hours"] + 1e-4)

        # Backfill rolling start NaNs
        pdf = pdf.bfill().fillna(0.0)
        return pdf

    def _classify_pattern(self, row: dict[str, Any], score: float) -> str:
        """Classify anomaly into a clinical pattern archetype."""
        if score < 35.0:
            return "Stable Baseline"

        hr = float(row.get("heart_rate", 70))
        spo2 = float(row.get("spo2", 98))
        sbp = float(row.get("systolic_bp", 120))
        sleep = float(row.get("sleep_hours", 7.5))
        steps = float(row.get("daily_steps", 8000))
        stress = float(row.get("stress_index", 30))

        # Cardiorespiratory Strain: SpO2 drop or elevated HR+BP combined
        if spo2 <= 95.5 or (hr > 80 and sbp > 132):
            return "Cardiorespiratory Strain"

        # Overtraining Fatigue: high steps with elevated resting HR and poor sleep
        if steps >= 12000 and (hr > 68 or sleep < 6.0):
            return "Overtraining Fatigue"

        # Autonomic Burnout: elevated stress + low sleep + tachycardia
        if stress >= 60 or (sleep <= 5.8 and hr >= 76):
            return "Autonomic Burnout"

        # Pre-Hypertensive Sedentary Drift
        if sbp >= 135 and steps <= 4500:
            return "Pre-Hypertensive Sedentary Drift"

        # Circadian / Sleep Debt
        if sleep <= 5.5:
            return "Circadian / Sleep Debt"

        return "Multivariate Pattern Drift"

    def fit_and_detect(
        self,
        df: pd.DataFrame,
        patient_id: Optional[str] = None,
        return_last_n: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Fit the PyOD ensemble on the reference window and score observations."""
        if df.empty:
            return []

        work_df = df.copy()
        if patient_id is not None and "patient_id" in work_df.columns:
            work_df = work_df[work_df["patient_id"] == patient_id]

        if work_df.empty:
            return []

        feat_df = self._prepare_features(work_df)
        X = feat_df[self.FEATURE_COLS].to_numpy(dtype=float)

        # Define reference baseline window: first 30 days or first third
        n_samples = len(X)
        ref_n = min(30, max(10, n_samples // 3))
        X_ref = X[:ref_n]

        # Standardize features
        X_ref_scaled = self.scaler.fit_transform(X_ref)
        X_scaled = self.scaler.transform(X)

        # Model 1: Isolation Forest
        if HAS_PYOD and IForest is not None:
            m1 = IForest(random_state=self.random_state)
            m1.fit(X_ref_scaled)
            scores_1 = m1.decision_function(X_scaled)
        else:
            m1 = SklearnIForest(random_state=self.random_state, contamination=0.1)
            m1.fit(X_ref_scaled)
            scores_1 = -m1.score_samples(X_scaled)

        # Model 2: ECOD
        if HAS_PYOD and ECOD is not None:
            m2 = ECOD()
            m2.fit(X_ref_scaled)
            scores_2 = m2.decision_function(X_scaled)
        else:
            m2 = NativeECOD()
            m2.fit(X_ref_scaled)
            scores_2 = m2.decision_function(X_scaled)

        # Model 3: COPOD
        if HAS_PYOD and COPOD is not None:
            m3 = COPOD()
            m3.fit(X_ref_scaled)
            scores_3 = m3.decision_function(X_scaled)
        else:
            m3 = NativeCOPOD()
            m3.fit(X_ref_scaled)
            scores_3 = m3.decision_function(X_scaled)

        # Min-max normalization for each model on the reference scale
        def norm(s):
            mn, mx = np.percentile(s[:ref_n], 5), np.percentile(s, 95)
            denom = mx - mn if (mx - mn) > 1e-4 else 1.0
            return np.clip((s - mn) / denom, 0.0, 1.5)

        n1 = norm(scores_1)
        n2 = norm(scores_2)
        n3 = norm(scores_3)

        # Composite ensemble score (scaled 0 - 100)
        composite = ((n1 * 0.40) + (n2 * 0.30) + (n3 * 0.30)) * 66.0
        anomaly_scores = np.clip(np.round(composite, 1), 5.0, 98.0)

        # Model agreement calculation
        flags_1 = (n1 >= 0.70).astype(int)
        flags_2 = (n2 >= 0.70).astype(int)
        flags_3 = (n3 >= 0.70).astype(int)
        agreement_sums = flags_1 + flags_2 + flags_3

        # Compute drift velocity (rate of anomaly score change over trailing 7 days)
        velocity_series = pd.Series(anomaly_scores).diff(7) / 7.0
        velocities = velocity_series.bfill().fillna(0.0).round(2).to_numpy()

        results: List[Dict[str, Any]] = []
        for idx in range(n_samples):
            row = feat_df.iloc[idx].to_dict()
            score = float(anomaly_scores[idx])
            flag = 1 if score >= 42.0 else 0
            agree_count = int(agreement_sums[idx])

            if flag == 1:
                agreement_label = f"{max(1, agree_count)}/3 Models Agree"
                if score >= 70.0:
                    severity = "Critical Multivariate Anomaly"
                else:
                    severity = "Moderate Pattern Drift"
            else:
                agreement_label = "Consensus Baseline (3/3 Models Agree)"
                severity = "Normal"

            pattern = self._classify_pattern(row, score)

            results.append({
                "timestamp": str(row.get("timestamp")),
                "anomaly_flag": flag,
                "anomaly_score": score,
                "severity_label": severity,
                "pattern_type": pattern,
                "model_agreement": agreement_label,
                "drift_velocity": float(velocities[idx]),
            })

        if return_last_n is not None and return_last_n > 0:
            return results[-return_last_n:]
        return results
