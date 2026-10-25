import React, { useEffect, useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import TwinVisualizer from './components/TwinVisualizer.jsx';
import XaiAlertPanel from './components/XaiAlertPanel.jsx';
import BaselineCharts from './components/BaselineCharts.jsx';
import WhatIfSandbox from './components/WhatIfSandbox.jsx';
import { fetchPatients, fetchMonitoring, fetchTwinState, fetchXaiAlert } from './services/api.js';

const DEFAULT_PATIENT = 'patient_2';

export default function App() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(DEFAULT_PATIENT);
  const [monitoring, setMonitoring] = useState(null);
  const [twinState, setTwinState] = useState(null);
  const [xai, setXai] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchPatients().then(setPatients).catch((e) => setError(e.message));
  }, []);

  // Refetch everything whenever the selected patient changes.
  // `cancelled` ignores responses from a patient the user already switched away from.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMonitoring(null);
    setTwinState(null);
    setXai(null);
    Promise.all([fetchMonitoring(patientId), fetchTwinState(patientId), fetchXaiAlert(patientId)])
      .then(([m, t, x]) => {
        if (cancelled) return;
        setMonitoring(m);
        setTwinState(t);
        setXai(x);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const current = patients.find((p) => p.patient_id === patientId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-cyan-300" />
            <div>
              <h1 className="text-lg font-semibold text-white">HealthTwin X</h1>
              <p className="text-xs text-slate-400">Personal baselines · anomaly detection · digital twin</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Patient
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
            >
              {(patients.length ? patients : [{ patient_id: DEFAULT_PATIENT, name: DEFAULT_PATIENT }]).map((p) => (
                <option key={p.patient_id} value={p.patient_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-6">
        {current?.description && <p className="text-sm text-slate-400">{current.description}</p>}

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300" role="alert">
            Could not load data: {error}
          </div>
        )}

        {loading && !error && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading patient data…
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <TwinVisualizer twinState={twinState} />
          <XaiAlertPanel xaiData={xai} />
        </div>

        {monitoring && <BaselineCharts days={monitoring.days} />}

        <WhatIfSandbox patientId={patientId} />
      </main>
    </div>
  );
}
