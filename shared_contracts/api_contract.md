# HealthTwin X: Shared API Contract

This contract defines the shared API schema for HealthTwin X. All services (ML, simulator, XAI, frontend) build against this contract.

---

## 1. Core Architectural Standards

- **Severity Labels**: `Normal`, `Moderate Pattern Drift`, `Critical Multivariate Anomaly`
- **Pattern Types**: `Stable Baseline`, `Autonomic Burnout`, `Cardiorespiratory Strain`, `Overtraining Fatigue`, `Pre-Hypertensive Sedentary Drift`, `Circadian / Sleep Debt`, `Multivariate Pattern Drift`
- **6 Core Vitals**: `heart_rate`, `spo2`, `systolic_bp`, `sleep_hours`, `daily_steps`, `stress_index`
- **12 Patient Personas**: `patient_1` through `patient_12` (documented in `patient_metadata.json`)
- **Twin Score Keys (0-100, higher = healthier)**:
  - `cardio_strain_index`
  - `recovery_readiness`
  - `respiratory_stability`
  - `metabolic_stability`
- **Biological Age Keys**:
  - `chronological_age`
  - `biological_age`
  - `age_delta_years`
  - `rejuvenation_status`
  - `aging_factors` (breakdown of factor impact in years)
- **Organ Keys**: `heart`, `brain_nervous`, `respiratory`, `metabolism`
  - **Values**: `green`, `amber`, `red`
- **Data Persistence**: In-memory with CSV write-through to `shared_contracts/sample_patient_data.csv`.

---

## 2. Endpoints

### 1. `GET /api/patients`
Returns list of all 12 diverse patient personas with clinical archetypes, ages, and profiles.

---

### 2. `GET /api/patient/monitoring?patient_id={patient_id}`
Returns the full 90-day timeline of vitals, 7-day and 30-day multi-scale baselines, PyOD ensemble anomaly scores, model agreement, pattern type, drift velocity, and baseline stability scores.

---

### 3. `GET /api/patient/twin-state?patient_id={patient_id}`
Returns digital twin status, 4 subsystem health scores (0-100), organ highlight colors, and **Biological Twin Age vs. Chronological Age** calculations with clinical factor breakdown.

---

### 4. `POST /api/patient/simulate`
Simulates counterfactual what-if intervention over a 14-day forward horizon. Returns projections for Heart Rate, Systolic BP, and Anomaly Risk Score alongside automated optimal habit targets and clinical prescription.

---

### 5. `GET /api/patient/explain-alert?patient_id={patient_id}`
Returns SHAP / Shapley-value normalized percentage feature attributions, **Temporal Drift Onset Localizer** (exact date and primary trigger), and physiological root-cause cascade narrative.

---

### 6. `POST /api/patient/log-vitals`
Appends a manual daily observation to the in-memory dataset and CSV file.

---

### 7. `POST /api/patient/simulate-next-day?patient_id={patient_id}`
Simulates a wearable smart watch telemetry tick, auto-advancing the timeline by 1 day.

---

### 8. `POST /api/patient/inject-event`
Injects an acute clinical stress test (`stress_spike`) or vagal recovery event (`recovery_day`).

---

### 9. `POST /api/patients/upload-csv`
Uploads a custom multi-patient vitals CSV file to dynamically ingest and re-fit all models.
