// API client for HealthTwin X (Member 1 & 5). Shapes follow shared_contracts/api_contract.md.
export const USE_MOCKS = false;
export const BASE_URL = 'http://localhost:8000';

const PATIENTS = [
  { patient_id: 'patient_1', name: 'Alex Mercer', age: 28, gender: 'Male', archetype: 'Endurance Athlete', description: 'Elite triathlete with high HRV and stable autonomic baseline.' },
  { patient_id: 'patient_2', name: 'Marcus Vance', age: 42, gender: 'Male', archetype: 'Corporate Autonomic Strain', description: 'Executive experiencing chronic sleep debt and resting tachycardia.' },
  { patient_id: 'patient_3', name: 'Elena Rostova', age: 34, gender: 'Female', archetype: 'Post-Viral Recovery', description: 'Post-viral dysautonomia showing progressive 55-day recovery.' },
  { patient_id: 'patient_4', name: 'Dr. David Chen', age: 31, gender: 'Male', archetype: 'Overtraining Burnout', description: 'High step volume combined with severe sleep deprivation.' },
  { patient_id: 'patient_5', name: 'Sarah Jenkins', age: 29, gender: 'Female', archetype: 'Early Respiratory Infection', description: 'Subclinical SpO2 dip (94.8%) preceding overt fever symptoms.' },
  { patient_id: 'patient_6', name: 'Michael Thorne', age: 49, gender: 'Male', archetype: 'Pre-Hypertensive Sedentary Drift', description: 'Progressive vascular remodeling and creeping systolic BP (142 mmHg).' },
  { patient_id: 'patient_7', name: 'Chloe Ramirez', age: 36, gender: 'Female', archetype: 'Circadian Disruption (Shift Worker)', description: '7-day rotating night shift nurse with high sleep variance.' },
  { patient_id: 'patient_8', name: 'Arthur Pendelton', age: 72, gender: 'Male', archetype: 'Senior Citizen - Hypertensive', description: 'Essential hypertension with age-adjusted baseline profiles.' },
  { patient_id: 'patient_9', name: 'Margaret Holloway', age: 78, gender: 'Female', archetype: 'Senior Citizen - Frailty', description: 'Mild frailty syndrome and blunted autonomic recovery responsiveness.' },
  { patient_id: 'patient_10', name: 'Vikram Patel', age: 45, gender: 'Male', archetype: 'Metabolic Syndrome Drift', description: 'Collapsing step volume and elevated nocturnal heart rate.' },
  { patient_id: 'patient_11', name: 'Rachel Adams', age: 39, gender: 'Female', archetype: 'Lifestyle Recovery Cohort', description: 'Structured lifestyle intervention achieving 28-pt risk reduction.' },
  { patient_id: 'patient_12', name: 'Jordan Lee', age: 33, gender: 'Non-binary', archetype: 'Healthy Sedentary Baseline', description: 'Sedentary desk worker with high homeostatic stability and zero drift.' },
];

const MOCK_PROFILE = {
  patient_1: { hr: 52, spo2: 98, sbp: 108, sleep: 8.4, steps: 13800, stress: 16, drift: 0 },
  patient_2: { hr: 83, spo2: 96, sbp: 133, sleep: 5.1, steps: 5200, stress: 78, drift: 1 },
  patient_3: { hr: 64, spo2: 98, sbp: 114, sleep: 7.9, steps: 8600, stress: 24, drift: 0.1 },
  patient_4: { hr: 77, spo2: 98, sbp: 126, sleep: 4.8, steps: 14500, stress: 82, drift: 0.8 },
  patient_5: { hr: 75, spo2: 95, sbp: 121, sleep: 6.8, steps: 6500, stress: 55, drift: 0.7 },
  patient_6: { hr: 79, spo2: 97, sbp: 142, sleep: 6.2, steps: 3200, stress: 58, drift: 0.8 },
  patient_7: { hr: 74, spo2: 98, sbp: 125, sleep: 5.2, steps: 7200, stress: 68, drift: 0.6 },
  patient_8: { hr: 76, spo2: 96, sbp: 144, sleep: 6.3, steps: 4400, stress: 45, drift: 0.7 },
  patient_9: { hr: 79, spo2: 95, sbp: 132, sleep: 5.8, steps: 2200, stress: 62, drift: 0.75 },
  patient_10: { hr: 82, spo2: 96, sbp: 138, sleep: 5.4, steps: 2900, stress: 72, drift: 0.9 },
  patient_11: { hr: 62, spo2: 98, sbp: 115, sleep: 8.2, steps: 10200, stress: 20, drift: 0.1 },
  patient_12: { hr: 64, spo2: 98, sbp: 116, sleep: 7.9, steps: 5100, stress: 19, drift: 0 },
};

const VITALS = ['heart_rate', 'spo2', 'systolic_bp', 'sleep_hours', 'daily_steps', 'stress_index'];

function mockMonitoring(id) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_2;
  const numDays = 90;
  const days = Array.from({ length: numDays }, (_, i) => {
    const t = i / (numDays - 1);
    const ramp = p.drift * Math.max(0, (t - 0.5) * 2);
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() - (numDays - 1 - i));
    const timestamp = dateObj.toISOString().slice(0, 10);

    const hr = Math.round(p.hr - 15 * p.drift + 15 * ramp + Math.sin(i * 0.3) * 1.5);
    const spo2 = Math.round(p.spo2 - (p.spo2 < 96 ? 1 : 0) * ramp);
    const sbp = Math.round(p.sbp - 14 * p.drift + 14 * ramp);
    const sleep = +(p.sleep + 2.2 * p.drift - 2.2 * ramp).toFixed(1);
    const steps = Math.round(p.steps + (p.steps > 10000 ? 0 : 2000 * (1 - ramp)));
    const stress = Math.round(p.stress - 45 * p.drift + 45 * ramp);

    const row = {
      timestamp,
      heart_rate: hr,
      spo2,
      systolic_bp: sbp,
      sleep_hours: sleep,
      daily_steps: steps,
      stress_index: stress,
      baseline_stability_score: Math.max(20, Math.round(95 - 40 * ramp)),
    };

    VITALS.forEach((v) => {
      row[`${v}_mean`] = row[v];
      row[`${v}_upper_band`] = +(row[v] * 1.07).toFixed(1);
      row[`${v}_lower_band`] = +(row[v] * 0.93).toFixed(1);
      row[`${v}_zscore`] = +(ramp * 2.5).toFixed(2);
      row[`${v}_mean_30d`] = row[v];
      row[`${v}_upper_30d`] = +(row[v] * 1.10).toFixed(1);
      row[`${v}_lower_30d`] = +(row[v] * 0.90).toFixed(1);
      row[`${v}_zscore_30d`] = +(ramp * 2.8).toFixed(2);
      row[`${v}_drift_pct`] = +(ramp * 15.0).toFixed(1);
      row[`${v}_stability`] = Math.max(20, Math.round(92 - 35 * ramp));
    });

    const score = Math.round(15 + 65 * ramp);
    row.anomaly_score = score;
    row.anomaly_flag = score >= 42 ? 1 : 0;
    row.severity_label = score >= 70 ? 'Critical Multivariate Anomaly' : score >= 42 ? 'Moderate Pattern Drift' : 'Normal';
    row.pattern_type = score >= 65 ? 'Cardiorespiratory Strain' : score >= 42 ? 'Autonomic Burnout' : 'Stable Baseline';
    row.model_agreement = score >= 42 ? '3/3 Models Agree' : 'Consensus Baseline (3/3 Models Agree)';
    row.drift_velocity = +(ramp * 0.8).toFixed(2);

    return row;
  });

  return { patient_id: id, days, total_days: numDays };
}

function mockTwinState(id) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_2;
  const good = p.drift < 0.4;
  const meta = PATIENTS.find((item) => item.patient_id === id) || PATIENTS[1];
  const chrono = meta.age || 42;
  const bioDelta = good ? -3.5 : 5.8;

  return {
    patient_id: id,
    twin_status: good ? 'Optimal' : p.drift > 0.7 ? 'Critical Drift' : 'Strain Warning',
    scores: {
      cardio_strain_index: good ? 92 : 46,
      recovery_readiness: good ? 88 : 40,
      respiratory_stability: p.spo2 < 96 ? 78 : 95,
      metabolic_stability: good ? 90 : 52,
    },
    organ_highlights: {
      heart: good ? 'green' : 'amber',
      brain_nervous: good ? 'green' : 'red',
      respiratory: p.spo2 < 96 ? 'amber' : 'green',
      metabolism: good ? 'green' : 'amber',
    },
    biological_age: {
      chronological_age: chrono,
      biological_age: +(chrono + bioDelta).toFixed(1),
      age_delta_years: bioDelta,
      rejuvenation_status: bioDelta < 0 ? 'Biologically Younger' : 'Accelerated Aging',
      aging_factors: [
        { factor: 'Sleep Architecture Deficit', impact_years: +(bioDelta * 0.4).toFixed(1), clinical_indicator: `${p.sleep}h nightly vs 8.2h target` },
        { factor: 'Cardiovascular Hemodynamics', impact_years: +(bioDelta * 0.35).toFixed(1), clinical_indicator: `${p.hr} bpm HR / ${p.sbp} mmHg SBP` },
        { factor: 'Autonomic Stress Index', impact_years: +(bioDelta * 0.25).toFixed(1), clinical_indicator: `${p.stress} / 100 stress index` },
      ],
    },
  };
}

function mockSimulation(id, sliders) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_2;
  const hrDelta = -((sliders.sleep_hours - 7.5) * 1.8 + ((sliders.daily_steps - 8000) / 1000) * 0.9 - (sliders.stress_index - 30) * 0.28);
  const sbpDelta = -((sliders.sleep_hours - 7.5) * 1.5 + ((sliders.daily_steps - 8000) / 1000) * 0.7 - (sliders.stress_index - 30) * 0.22);

  const scenario_projections = Array.from({ length: 14 }, (_, i) => ({
    day: `Day +${i + 1}`,
    baseline_trajectory_hr: +(p.hr + (i + 1) * 0.15).toFixed(1),
    counterfactual_trajectory_hr: +(p.hr + (hrDelta * (i + 1)) / 14).toFixed(1),
    baseline_trajectory_sbp: +(p.sbp + (i + 1) * 0.12).toFixed(1),
    counterfactual_trajectory_sbp: +(p.sbp + (sbpDelta * (i + 1)) / 14).toFixed(1),
    baseline_risk_score: Math.min(98, 45 + i),
    counterfactual_risk_score: Math.max(5, Math.round(45 + (hrDelta * 2.2 * (i + 1)) / 14)),
  }));

  return {
    scenario_projections,
    ai_prescription: `Target ${sliders.sleep_hours}h sleep, ${sliders.daily_steps.toLocaleString()} daily steps, and stress under ${sliders.stress_index} to reverse biological aging acceleration.`,
    optimal_targets: {
      recommended_sleep_hours: 8.5,
      recommended_daily_steps: 10000,
      recommended_stress_index: 18,
      projected_hr_nadir: +(p.hr - 8.5).toFixed(1),
      projected_risk_score: 15,
      projected_bio_age_rejuvenation_years: 3.4,
    },
  };
}

function mockXai(id) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_2;
  return {
    patient_id: id,
    explanation_summary: p.drift >= 0.5
      ? 'Elevated resting heart rate and sympathetic stress index are the primary drivers of multivariate anomaly detection against 30-day baseline.'
      : 'All vitals are within personal baseline ranges. No significant deviation detected.',
    feature_attributions: [
      { feature: 'stress_index', impact_percentage: 36.5, direction: p.drift >= 0.5 ? 'increased_risk' : 'reduced_risk', current_value: p.stress, baseline_mean: 24 },
      { feature: 'heart_rate', impact_percentage: 31.0, direction: p.drift >= 0.5 ? 'increased_risk' : 'reduced_risk', current_value: p.hr, baseline_mean: 66 },
      { feature: 'sleep_hours', impact_percentage: 18.5, direction: p.drift >= 0.5 ? 'increased_risk' : 'reduced_risk', current_value: p.sleep, baseline_mean: 7.7 },
      { feature: 'systolic_bp', impact_percentage: 10.0, direction: p.drift >= 0.5 ? 'increased_risk' : 'reduced_risk', current_value: p.sbp, baseline_mean: 118 },
      { feature: 'spo2', impact_percentage: 2.5, direction: 'reduced_risk', current_value: p.spo2, baseline_mean: 98.2 },
      { feature: 'daily_steps', impact_percentage: 1.5, direction: 'reduced_risk', current_value: p.steps, baseline_mean: 8800 },
    ],
    drift_onset: {
      onset_detected: p.drift >= 0.5,
      onset_date: '2026-09-13',
      onset_day_index: 49,
      primary_trigger: 'Autonomic Stress Index',
      onset_narrative: p.drift >= 0.5
        ? 'Multivariate pattern drift initially manifested on 2026-09-13 (Day 49), primarily catalyzed by a sharp deviation in Autonomic Stress Index.'
        : 'No significant onset of chronic pattern drift detected.',
    },
    chain_reaction: [
      '1. Primary Insult: Chronic sleep architecture deficit / sympathetic overdrive.',
      '2. Autonomic Response: Blunted nighttime vagal activation preventing baseline nocturnal dipping.',
      '3. Cardiovascular Strain: Sustained compensatory resting tachycardia and progressive vascular resistance.',
      '4. Clinical Outcome: Elevation of multivariate PyOD Isolation Forest anomaly score.',
    ],
  };
}

let usedMock = USE_MOCKS;
export const isUsingMockData = () => usedMock;

async function request(path, options, mockFn) {
  if (USE_MOCKS) return mockFn();
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    usedMock = false;
    return await res.json();
  } catch (err) {
    if (err instanceof TypeError) {
      console.warn(`Backend offline, using mock for ${path}`);
      usedMock = true;
      return mockFn();
    }
    throw err;
  }
}

const q = (id) => `?patient_id=${encodeURIComponent(id)}`;

export const fetchPatients = () => request('/api/patients', undefined, () => PATIENTS);
export const fetchMonitoring = (id) => request(`/api/patient/monitoring${q(id)}`, undefined, () => mockMonitoring(id));
export const fetchTwinState = (id) => request(`/api/patient/twin-state${q(id)}`, undefined, () => mockTwinState(id));
export const fetchXaiAlert = (id) => request(`/api/patient/explain-alert${q(id)}`, undefined, () => mockXai(id));

export const runSimulation = (id, sliders) =>
  request(
    '/api/patient/simulate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: id, ...sliders }),
    },
    () => mockSimulation(id, sliders)
  );

export const simulateNextDay = (id) =>
  request(
    `/api/patient/simulate-next-day${q(id)}`,
    { method: 'POST' },
    () => {
      const data = mockMonitoring(id);
      return { status: 'ok', new_day: data.days[data.days.length - 1] };
    }
  );

export const injectEvent = (id, eventType) =>
  request(
    '/api/patient/inject-event',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patient_id: id, event_type: eventType }),
    },
    () => ({ status: 'ok', event_type: eventType })
  );

export const logVitals = (payload) =>
  request(
    '/api/patient/log-vitals',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
    () => ({ status: 'ok', rows: 91 })
  );

export const uploadCsv = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE_URL}/api/patients/upload-csv`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || `${res.status} ${res.statusText}`);
  }
  return await res.json();
};
