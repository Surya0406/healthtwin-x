// API client for HealthTwin X. Shapes follow shared_contracts/api_contract.md.
// USE_MOCKS = true  -> never call the backend (UI-only development)
// USE_MOCKS = false -> call the live API, fall back to mocks if it is offline
export const USE_MOCKS = false;
export const BASE_URL = 'http://localhost:8000';

// ---------------------------------------------------------------- mocks
const PATIENTS = [
  { patient_id: 'patient_1', name: 'Healthy Athlete', description: 'Stable, low-noise vitals.' },
  { patient_id: 'patient_2', name: 'Executive under Stress', description: 'Drift over the last 15 days.' },
  { patient_id: 'patient_3', name: 'Post-Viral Recovery', description: 'High strain early, recovering.' },
];

// Per-patient "latest" vitals used to build plausible mock data.
const MOCK_PROFILE = {
  patient_1: { heart_rate: 58, spo2: 98, systolic_bp: 112, sleep_hours: 8.1, daily_steps: 11500, stress_index: 18, drift: 0 },
  patient_2: { heart_rate: 83, spo2: 96, systolic_bp: 131, sleep_hours: 5.3, daily_steps: 5400, stress_index: 72, drift: 1 },
  patient_3: { heart_rate: 64, spo2: 98, systolic_bp: 115, sleep_hours: 7.9, daily_steps: 8400, stress_index: 26, drift: 0.2 },
};

const VITALS = ['heart_rate', 'spo2', 'systolic_bp', 'sleep_hours', 'daily_steps', 'stress_index'];

function mockMonitoring(id) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_1;
  const days = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const ramp = p.drift * t;
    const row = {
      timestamp: `2026-03-${String(i + 1).padStart(2, '0')}`,
      heart_rate: Math.round(p.heart_rate - 14 * p.drift + 14 * ramp + Math.sin(i) * 1.5),
      spo2: p.spo2,
      systolic_bp: Math.round(p.systolic_bp - 12 * p.drift + 12 * ramp),
      sleep_hours: +(p.sleep_hours + 2.5 * p.drift - 2.5 * ramp).toFixed(1),
      daily_steps: p.daily_steps,
      stress_index: Math.round(p.stress_index - 40 * p.drift + 40 * ramp),
    };
    VITALS.forEach((v) => {
      row[`${v}_mean`] = row[v];
      row[`${v}_upper_band`] = +(row[v] * 1.06).toFixed(1);
      row[`${v}_lower_band`] = +(row[v] * 0.94).toFixed(1);
      row[`${v}_zscore`] = 0;
    });
    const score = Math.round(15 + 55 * ramp);
    row.anomaly_score = score;
    row.anomaly_flag = score >= 40 ? 1 : 0;
    row.severity_label = score >= 70 ? 'Critical Multivariate Anomaly' : score >= 40 ? 'Moderate Pattern Drift' : 'Normal';
    return row;
  });
  return { patient_id: id, days };
}

function mockTwinState(id) {
  const drift = (MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_1).drift;
  const good = drift < 0.5;
  return {
    patient_id: id,
    twin_status: good ? 'Optimal' : 'Strain Warning',
    scores: {
      cardio_strain_index: good ? 90 : 48,
      recovery_readiness: good ? 88 : 42,
      respiratory_stability: good ? 95 : 85,
      metabolic_stability: good ? 92 : 58,
    },
    organ_highlights: {
      heart: good ? 'green' : 'amber',
      brain_nervous: good ? 'green' : 'red',
      respiratory: 'green',
      metabolism: good ? 'green' : 'amber',
    },
  };
}

function mockSimulation(id, sliders) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_1;
  const hrDelta = -((sliders.sleep_hours - 7) * 1.5 + ((sliders.daily_steps - 8000) / 1000) * 0.8 - (sliders.stress_index - 30) * 0.25);
  const scenario_projections = Array.from({ length: 7 }, (_, i) => ({
    day: `Day +${i + 1}`,
    baseline_trajectory_hr: +(p.heart_rate + (i + 1) * 0.2).toFixed(1),
    counterfactual_trajectory_hr: +(p.heart_rate + (hrDelta * (i + 1)) / 7).toFixed(1),
    baseline_risk_score: Math.min(98, 40 + i),
    counterfactual_risk_score: Math.max(5, Math.round(40 + (hrDelta * 2.2 * (i + 1)) / 7)),
  }));
  return {
    scenario_projections,
    ai_prescription: `(mock) Aim for ${sliders.sleep_hours}h sleep, ${sliders.daily_steps} steps and stress near ${sliders.stress_index}.`,
  };
}

function mockXai(id) {
  const p = MOCK_PROFILE[id] ?? MOCK_PROFILE.patient_1;
  const drifting = p.drift >= 0.5;
  return {
    patient_id: id,
    explanation_summary: drifting
      ? '(mock) Elevated heart rate and reduced sleep are the main drivers versus your 7-day baseline.'
      : '(mock) No significant deviation from your personal baseline.',
    feature_attributions: [
      { feature: 'heart_rate', impact_percentage: 34.5, direction: drifting ? 'increased_risk' : 'reduced_risk', current_value: p.heart_rate, baseline_mean: 68 },
      { feature: 'sleep_hours', impact_percentage: 28, direction: drifting ? 'increased_risk' : 'reduced_risk', current_value: p.sleep_hours, baseline_mean: 7.6 },
      { feature: 'stress_index', impact_percentage: 20.5, direction: drifting ? 'increased_risk' : 'reduced_risk', current_value: p.stress_index, baseline_mean: 26 },
      { feature: 'systolic_bp', impact_percentage: 11, direction: drifting ? 'increased_risk' : 'reduced_risk', current_value: p.systolic_bp, baseline_mean: 118 },
      { feature: 'spo2', impact_percentage: 4, direction: 'reduced_risk', current_value: p.spo2, baseline_mean: 98 },
      { feature: 'daily_steps', impact_percentage: 2, direction: 'reduced_risk', current_value: p.daily_steps, baseline_mean: 8600 },
    ],
  };
}

// ---------------------------------------------------------------- http
// True once any call had to fall back to mock data, so the UI can warn the user.
let usedMock = USE_MOCKS;
export const isUsingMockData = () => usedMock;

async function request(path, options, mockFn) {
  if (USE_MOCKS) return mockFn();
  try {
    const res = await fetch(`${BASE_URL}${path}`, options);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    usedMock = false; // a live call succeeded, backend is back
    return await res.json();
  } catch (err) {
    // Network failure -> backend offline -> mock. HTTP errors (404, 422) are real bugs: surface them.
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
