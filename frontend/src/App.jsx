import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, WifiOff } from 'lucide-react';
import TwinVisualizer from './components/TwinVisualizer.jsx';
import XaiAlertPanel from './components/XaiAlertPanel.jsx';
import BaselineCharts from './components/BaselineCharts.jsx';
import WhatIfSandbox from './components/WhatIfSandbox.jsx';
import { fetchPatients, fetchMonitoring, fetchTwinState, fetchXaiAlert, isUsingMockData } from './services/api.js';

const PATIENT_IDS = ['patient_1', 'patient_2', 'patient_3'];
const DEFAULT_PATIENT = 'patient_2';
// Optional deep link, e.g. http://localhost:5173/?patient=patient_1
const initialPatient = () => {
  const id = new URLSearchParams(window.location.search).get('patient');
  return PATIENT_IDS.includes(id) ? id : DEFAULT_PATIENT;
};

const TAGLINE = {
  patient_1: 'Stable and low-noise',
  patient_2: 'Drifting for 15 days',
  patient_3: 'Recovering after strain',
};

const HEADLINE = {
  Optimal: { title: 'Vitals are holding steady.', tone: 'text-emerald-300' },
  'Strain Warning': { title: 'Early strain is showing.', tone: 'text-amber-300' },
  'Critical Drift': { title: 'Several vitals are drifting together.', tone: 'text-rose-300' },
};

const mean = (rows, key) => rows.reduce((s, r) => s + Number(r[key] ?? 0), 0) / Math.max(rows.length, 1);

// worseWhenUp: true when a rise is the unhealthy direction.
const READOUTS = [
  { key: 'heart_rate', label: 'Heart rate', unit: 'bpm', digits: 0, worseWhenUp: true },
  { key: 'sleep_hours', label: 'Sleep', unit: 'h', digits: 1, worseWhenUp: false },
  { key: 'systolic_bp', label: 'Systolic BP', unit: 'mmHg', digits: 0, worseWhenUp: true },
  { key: 'anomaly_score', label: 'Anomaly score', unit: '/ 100', digits: 0, worseWhenUp: true },
];

function Readout({ spec, days }) {
  const first = Number(days[0]?.[spec.key]);
  const last = Number(days[days.length - 1]?.[spec.key]);
  const diff = last - first;
  const flat = !Number.isFinite(diff) || Math.abs(diff) < Math.pow(10, -spec.digits) / 2;
  const worse = spec.worseWhenUp ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-slate-400">{spec.label}</p>
      <p className="num mt-1 text-2xl font-semibold text-white">
        {Number.isFinite(last) ? last.toFixed(spec.digits) : '–'}
        <span className="ml-1 text-xs font-normal text-slate-400">{spec.unit}</span>
      </p>
      <p className={`mt-0.5 flex items-center gap-1 text-xs ${flat ? 'text-slate-500' : worse ? 'text-rose-300' : 'text-emerald-300'}`}>
        {!flat && <Icon className="h-3.5 w-3.5" />}
        {flat ? 'unchanged' : `${Math.abs(diff).toFixed(spec.digits)} since ${String(days[0].timestamp).slice(5)}`}
      </p>
    </div>
  );
}

function Summary({ monitoring, twinState }) {
  if (!monitoring || !twinState) {
    return (
      <div aria-busy="true" aria-label="Loading summary">
        <div className="skeleton h-9 w-2/3 max-w-md" />
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
        </div>
      </div>
    );
  }
  const days = monitoring.days;
  const flagged = days.filter((d) => d.anomaly_flag === 1).length;
  const head = HEADLINE[twinState.twin_status] ?? HEADLINE.Optimal;
  const latest = days[days.length - 1];
  return (
    <div>
      <h2 className={`font-display text-3xl font-bold leading-tight sm:text-4xl ${head.tone}`}>{head.title}</h2>
      <p className="mt-2 text-sm text-slate-300">
        {flagged === 0
          ? `No days flagged in the last ${days.length}. Latest reading: ${latest.severity_label}.`
          : `${flagged} of the last ${days.length} days flagged against this person's own baseline. Latest reading: ${latest.severity_label}.`}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {READOUTS.map((spec) => <Readout key={spec.key} spec={spec} days={days} />)}
      </div>
    </div>
  );
}

function SectionBar({ children }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{children}</h3>;
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(initialPatient);
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
    return () => { cancelled = true; };
  }, [patientId]);

  // The sandbox starts from the patient's 7-day average routine, matching what the simulator treats as "current path".
  const routine = useMemo(() => {
    const week = monitoring?.days?.slice(-7) ?? [];
    return week.length
      ? { sleep_hours: mean(week, 'sleep_hours'), daily_steps: mean(week, 'daily_steps'), stress_index: mean(week, 'stress_index') }
      : undefined;
  }, [monitoring]);

  const latestHr = monitoring?.days?.[monitoring.days.length - 1]?.heart_rate;
  const list = patients.length ? patients : PATIENT_IDS.map((id) => ({ patient_id: id, name: id }));
  const current = list.find((p) => p.patient_id === patientId);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/40 bg-cyan-300/10">
              <Activity className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold leading-none text-white">HealthTwin X</h1>
              <p className="mt-1 text-[11px] text-slate-400">Compared with each person's own normal</p>
            </div>
          </div>

          <nav className="flex flex-1 flex-wrap gap-2 sm:justify-end" aria-label="Choose a patient">
            {list.map((p) => {
              const active = p.patient_id === patientId;
              return (
                <button key={p.patient_id} type="button" onClick={() => setPatientId(p.patient_id)} aria-pressed={active}
                  className={`rounded-xl border px-4 py-2 text-left transition ${active
                    ? 'border-cyan-300/60 bg-cyan-300/10 shadow-[0_0_0_3px_rgba(103,232,249,0.08)]'
                    : 'border-slate-700/80 bg-slate-900/60 hover:border-slate-500'}`}>
                  <span className={`block text-sm font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{p.name}</span>
                  <span className="block text-[11px] text-slate-400">{TAGLINE[p.patient_id] ?? ''}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8 sm:px-8">
        {!loading && isUsingMockData() && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100" role="status">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <p>The backend at localhost:8000 isn't responding, so this page is showing offline demo data, not real results. Start the API and reload.</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-200" role="alert">
            Couldn't load this patient: {error}. Check that the API is running, then pick the patient again.
          </div>
        )}

        <section className="rise" style={{ '--d': '0ms' }} key={`sum-${patientId}`}>
          {current?.description && <p className="mb-3 max-w-3xl text-sm text-slate-400">{current.description}</p>}
          <Summary monitoring={monitoring} twinState={twinState} />
        </section>

        <section className="rise" style={{ '--d': '80ms' }} key={`top-${patientId}`}>
          <SectionBar>Right now</SectionBar>
          <div className="grid gap-6 lg:grid-cols-2">
            <TwinVisualizer twinState={twinState} heartRate={latestHr} />
            <XaiAlertPanel xaiData={xai} />
          </div>
        </section>

        <section className="rise" style={{ '--d': '160ms' }} key={`trend-${patientId}`}>
          <SectionBar>Last 14 days against their own baseline</SectionBar>
          {monitoring ? <BaselineCharts days={monitoring.days} /> : <div className="skeleton h-96" aria-busy="true" />}
        </section>

        <section className="rise" style={{ '--d': '240ms' }}>
          <SectionBar>Try a different routine</SectionBar>
          <WhatIfSandbox patientId={patientId} current={routine} />
        </section>

        <footer className="border-t border-slate-800 pt-6 text-xs leading-5 text-slate-500">
          HealthTwin X is a hackathon prototype running on simulated patients. It is not a medical device and its output is not clinical advice.
        </footer>
      </main>
    </div>
  );
}
