# HealthTwin X: 3-Minute Demo Script (Patient 2 Walkthrough)

**Presenter**: Member 2 (ML + Frontend Engineer) & Team  
**Focus Subject**: `patient_2` (Early Stage Cardiovascular & Autonomic Drift)  
**Total Duration**: 3 Minutes (180 Seconds)

---

## 0:00 - 0:30 | Patient Selection & Telemetry Overview

- **Action**: Select **Patient 2** (`patient_2`) from the patient selector dropdown.
- **Narrative**:
  > *"Welcome to HealthTwin X. Today we examine Patient 2. Looking at the initial 45 days, this patient exhibited an exceptionally calm, healthy baseline—normal heart rate around 70 bpm, restorative sleep of ~7.8 hours, and a low stress index. However, over the past two weeks, telemetry reveals subtle, correlated physiological changes that would typically slip past static hospital alarm thresholds."*

---

## 0:30 - 1:15 | Baseline Charts, Normal Bands & Pulsing Red Anomaly Dots

- **Action**: Direct attention to the **Personalized Baseline & Anomaly Radar** (`BaselineCharts.jsx`).
- **Narrative**:
  > *"Here we see our personalized baseline charts powered by an unsupervised Isolation Forest. Notice the shaded reference bands—these represent Patient 2's calibrated normal range (±2 standard deviations), not generic population averages.*
  >
  > *Over the last 14 days, notice how Heart Rate gradually breaks above the upper boundary, climbing +14 bpm up to 84 bpm. Simultaneously, sleep drops by 2.5 hours down into the critical 5.3-hour range, and Systolic Blood Pressure elevates to 130 mmHg.*
  >
  > *Our Isolation Forest flags these days with pulsing red anomaly dots and highlights an anomaly score of 58.5 / 100 with an amber 'Moderate Pattern Drift' badge. The system proactively detects this multivariate pattern days before acute symptoms emerge."*

---

## 1:15 - 1:50 | Digital Twin Status & Physiological Colors

- **Action**: Highlight the interactive 3D / avatar **Digital Twin View**.
- **Narrative**:
  > *"When we inspect the patient's Digital Twin, the physiological state transitions from a calm green/cyan resting state into an illuminated amber hue, with the cardiovascular and autonomic nodes pulsing under strain.*
  >
  > *The twin integrates real-time telemetry into a continuous biomechanical representation, indicating elevated systemic vascular resistance and reduced parasympathetic recovery."*

---

## 1:50 - 2:25 | XAI Feature Attribution & What-If Simulation Sliders

- **Action**: Scroll to the **XAI Explanation** panel and interact with the **What-If Sliders**.
- **Narrative**:
  > *"Clinicians need to know *why* this anomaly occurred. Our SHAP feature attribution identifies that 44% of the drift is driven by cumulative sleep debt, followed by 32% elevated stress index and 24% autonomic heart rate elevation.*
  >
  > *Now, let's explore counterfactual recovery using the What-If sliders. What happens if we intervene and restore sleep by +2.0 hours and increase daily activity by 2,000 steps?*
  > *As we slide sleep recovery to +2.0 hrs, the forward projection immediately recalculates: resting heart rate drops by 9 bpm, systolic BP normalizes under 122 mmHg, and the twin returns to a green baseline state."*

---

## 2:25 - 3:00 | Clinical Prescription & Closing

- **Action**: Review the generated **Personalized Clinical Prescription**.
- **Narrative**:
  > *"HealthTwin X synthesizes this into an actionable, tailored prescription:*
  > 1. *Target sleep restoration protocol: 60-minute sleep hygiene window to achieve ≥ 7.5 hours.*
  > 2. *Autonomic recovery: Low-intensity evening zone-2 walk to break prolonged daytime stress patterns.*
  > 3. *Remote monitoring alert: Follow-up automated check-in in 72 hours.*
  >
  > *In under 3 minutes, HealthTwin X transformed noisy wearable telemetry into early drift detection, root-cause transparency, and an actionable, personalized intervention. Thank you."*
