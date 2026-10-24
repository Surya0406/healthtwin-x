# HealthTwin X: Shared API Contract

This contract defines the shared API schema for HealthTwin X. All services (ML, simulator, XAI, frontend) build against this contract.

---

## 1. Frozen System Decisions

- **Severity Labels**: `Normal`, `Moderate Pattern Drift`, `Critical Multivariate Anomaly`
- **6 Core Vitals**: `heart_rate`, `spo2`, `systolic_bp`, `sleep_hours`, `daily_steps`, `stress_index`
- **Patient IDs**: `patient_1`, `patient_2`, `patient_3`
- **Twin Score Keys (0-100, higher = healthier)**:
  - `cardio_strain_index`
  - `recovery_readiness`
  - `respiratory_stability`
  - `metabolic_stability`
- **Organ Keys**: `heart`, `brain_nervous`, `respiratory`, `metabolism`
  - **Values**: `green`, `amber`, `red` (Frontend maps to `emerald`, `amber`, `rose`)
- **Data Persistence**: In-memory append with CSV write-through to `shared_contracts/sample_patient_data.csv`.

---

## 2. Endpoints

### 1. `GET /api/patients`
Returns list of available patient personas.

#### Response: `200 OK`
```json
[
  {
    "patient_id": "patient_1",
    "name": "Healthy Athlete",
    "description": "Healthy athlete with consistent lifestyle, low noise, and stable cardiovascular metrics."
  },
  {
    "patient_id": "patient_2",
    "name": "Executive under Stress",
    "description": "Normal for days 1-45, then days 46-60 gradual HR +14 bpm, sleep -2.5 h, systolic BP +12 mmHg, stress rising."
  },
  {
    "patient_id": "patient_3",
    "name": "Post-Viral Recovery",
    "description": "High strain early on with steady recovery over the last 15 days."
  }
]
```

---

### 2. `GET /api/patient/monitoring?patient_id={patient_id}`
Returns the last 14 days of vitals, rolling baseline metrics, and anomaly detection results.

#### Query Parameters:
- `patient_id` (required): `patient_1`, `patient_2`, or `patient_3`

#### Response: `200 OK`
```json
{
  "patient_id": "patient_1",
  "days": [
    {
      "timestamp": "2026-03-01",
      "heart_rate": 62,
      "spo2": 98,
      "systolic_bp": 114,
      "sleep_hours": 7.8,
      "daily_steps": 11000,
      "stress_index": 22,
      "heart_rate_mean": 61.5,
      "heart_rate_upper_band": 66.0,
      "heart_rate_lower_band": 57.0,
      "heart_rate_zscore": 0.3,
      "spo2_mean": 98.2,
      "spo2_upper_band": 99.8,
      "spo2_lower_band": 96.6,
      "spo2_zscore": -0.25,
      "systolic_bp_mean": 113.8,
      "systolic_bp_upper_band": 118.0,
      "systolic_bp_lower_band": 109.6,
      "systolic_bp_zscore": 0.1,
      "sleep_hours_mean": 7.9,
      "sleep_hours_upper_band": 8.5,
      "sleep_hours_lower_band": 7.3,
      "sleep_hours_zscore": -0.33,
      "daily_steps_mean": 11200.0,
      "daily_steps_upper_band": 12800.0,
      "daily_steps_lower_band": 9600.0,
      "daily_steps_zscore": -0.25,
      "stress_index_mean": 21.0,
      "stress_index_upper_band": 27.0,
      "stress_index_lower_band": 15.0,
      "stress_index_zscore": 0.33,
      "anomaly_flag": 0,
      "anomaly_score": 18.4,
      "severity_label": "Normal"
    }
  ]
}
```

---

### 3. `GET /api/patient/twin-state?patient_id={patient_id}`
Returns current digital twin status, organ system highlights, and subsystem scores.

#### Query Parameters:
- `patient_id` (required): `patient_1`, `patient_2`, or `patient_3`

#### Response: `200 OK`
```json
{
  "patient_id": "patient_2",
  "twin_status": "Strain Warning",
  "scores": {
    "cardio_strain_index": 52,
    "recovery_readiness": 44,
    "respiratory_stability": 88,
    "metabolic_stability": 60
  },
  "organ_highlights": {
    "heart": "amber",
    "brain_nervous": "amber",
    "respiratory": "green",
    "metabolism": "amber"
  }
}
```
*(twin_status values: `Optimal`, `Strain Warning`, `Critical Drift`)*

---

### 4. `POST /api/patient/simulate`
Simulates counterfactual what-if scenarios over a 7-day horizon when lifestyle inputs (sleep, steps, stress) are modified.

#### Request Body:
```json
{
  "patient_id": "patient_2",
  "sleep_hours": 7.5,
  "daily_steps": 8000,
  "stress_index": 30
}
```

#### Response: `200 OK`
```json
{
  "scenario_projections": [
    {
      "day": "Day +1",
      "baseline_trajectory_hr": 78.2,
      "counterfactual_trajectory_hr": 76.9,
      "baseline_risk_score": 64,
      "counterfactual_risk_score": 51
    },
    {
      "day": "Day +2",
      "baseline_trajectory_hr": 78.5,
      "counterfactual_trajectory_hr": 75.8,
      "baseline_risk_score": 65,
      "counterfactual_risk_score": 48
    },
    {
      "day": "Day +3",
      "baseline_trajectory_hr": 78.8,
      "counterfactual_trajectory_hr": 74.5,
      "baseline_risk_score": 66,
      "counterfactual_risk_score": 44
    },
    {
      "day": "Day +4",
      "baseline_trajectory_hr": 79.0,
      "counterfactual_trajectory_hr": 73.4,
      "baseline_risk_score": 67,
      "counterfactual_risk_score": 41
    },
    {
      "day": "Day +5",
      "baseline_trajectory_hr": 79.2,
      "counterfactual_trajectory_hr": 72.5,
      "baseline_risk_score": 68,
      "counterfactual_risk_score": 38
    },
    {
      "day": "Day +6",
      "baseline_trajectory_hr": 79.4,
      "counterfactual_trajectory_hr": 71.8,
      "baseline_risk_score": 69,
      "counterfactual_risk_score": 35
    },
    {
      "day": "Day +7",
      "baseline_trajectory_hr": 79.5,
      "counterfactual_trajectory_hr": 71.2,
      "baseline_risk_score": 70,
      "counterfactual_risk_score": 33
    }
  ],
  "ai_prescription": "Target 7.5h sleep, 8000 daily steps, and reduce stress index below 30 to restore twin to Optimal status."
}
```

---

### 5. `GET /api/patient/explain-alert?patient_id={patient_id}`
Returns SHAP-based feature attributions and clinical plain-text explanation for recent alert/status.

#### Query Parameters:
- `patient_id` (required): `patient_1`, `patient_2`, or `patient_3`

#### Response: `200 OK`
```json
{
  "patient_id": "patient_2",
  "explanation_summary": "Elevated heart rate (+14 bpm) and reduced sleep (-2.5 h) are the primary drivers of multivariate anomaly detection against 7-day baseline.",
  "feature_attributions": [
    {
      "feature": "heart_rate",
      "impact_percentage": 34.5,
      "direction": "increased_risk",
      "current_value": 84.0,
      "baseline_mean": 68.0
    },
    {
      "feature": "sleep_hours",
      "impact_percentage": 28.0,
      "direction": "increased_risk",
      "current_value": 5.0,
      "baseline_mean": 7.5
    },
    {
      "feature": "stress_index",
      "impact_percentage": 20.5,
      "direction": "increased_risk",
      "current_value": 72.0,
      "baseline_mean": 28.0
    },
    {
      "feature": "systolic_bp",
      "impact_percentage": 11.0,
      "direction": "increased_risk",
      "current_value": 130.0,
      "baseline_mean": 118.0
    },
    {
      "feature": "spo2",
      "impact_percentage": 4.0,
      "direction": "reduced_risk",
      "current_value": 97.0,
      "baseline_mean": 97.5
    },
    {
      "feature": "daily_steps",
      "impact_percentage": 2.0,
      "direction": "reduced_risk",
      "current_value": 7200.0,
      "baseline_mean": 8500.0
    }
  ]
}
```
*(Directions: `increased_risk`, `reduced_risk`. Sum of `impact_percentage` equals 100)*

---

### 6. `POST /api/patient/log-vitals`
Appends a vitals observation to the patient's record in memory and writes through to CSV.

#### Request Body:
```json
{
  "patient_id": "patient_1",
  "timestamp": "2026-03-16",
  "heart_rate": 63,
  "spo2": 98,
  "systolic_bp": 114,
  "sleep_hours": 8.0,
  "daily_steps": 11500,
  "stress_index": 20
}
```

#### Response: `200 OK`
```json
{
  "status": "ok",
  "rows": 61
}
```
*(rows is the updated total count of records for this patient)*
