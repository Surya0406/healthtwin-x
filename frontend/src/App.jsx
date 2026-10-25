import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Compass,
  Database,
  Dna,
  FileText,
  Flame,
  Heart,
  Moon,
  Pause,
  Play,
  PlusCircle,
  Printer,
  Radio,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  User,
  Users,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import TwinVisualizer from './components/TwinVisualizer.jsx';
import BaselineCharts from './components/BaselineCharts.jsx';
import WhatIfSandbox from './components/WhatIfSandbox.jsx';
import XaiAlertPanel from './components/XaiAlertPanel.jsx';
import {
  fetchPatients,
  fetchMonitoring,
  fetchTwinState,
  fetchXaiAlert,
  simulateNextDay,
  injectEvent,
  logVitals,
  uploadCsv,
  isUsingMockData,
} from './services/api.js';

const DEFAULT_PATIENT = 'patient_2';

const initialPatient = () => {
  const id = new URLSearchParams(window.location.search).get('patient');
  return id || DEFAULT_PATIENT;
};

const HEADLINE = {
  Optimal: { title: 'Homeostatic Baseline Optimal · Organ Mesh Steady', tone: 'text-emerald-400' },
  'Strain Warning': { title: 'Multivariate Pattern Drift Detected', tone: 'text-amber-400' },
  'Critical Drift': { title: 'Critical Multivariate Anomaly · Decompensation Risk', tone: 'text-rose-400' },
};

const READOUTS = [
  { key: 'heart_rate', label: 'Resting Heart Rate', unit: 'bpm', digits: 0, worseWhenUp: true },
  { key: 'sleep_hours', label: 'Sleep Duration', unit: 'h', digits: 1, worseWhenUp: false },
  { key: 'systolic_bp', label: 'Systolic BP', unit: 'mmHg', digits: 0, worseWhenUp: true },
  { key: 'stress_index', label: 'Autonomic Stress', unit: '/ 100', digits: 0, worseWhenUp: true },
  { key: 'daily_steps', label: 'Daily Steps', unit: 'steps', digits: 0, worseWhenUp: false },
  { key: 'anomaly_score', label: 'PyOD Anomaly Score', unit: '/ 100', digits: 1, worseWhenUp: true },
];

function ReadoutCard({ spec, days, selectedIndex }) {
  const selectedDay = days[selectedIndex] ?? days[days.length - 1];
  const firstDay = days[0];
  const currVal = Number(selectedDay?.[spec.key]);
  const prevVal = Number(firstDay?.[spec.key]);
  const diff = currVal - prevVal;
  const flat = !Number.isFinite(diff) || Math.abs(diff) < Math.pow(10, -spec.digits) / 2;
  const worse = spec.worseWhenUp ? diff > 0 : diff < 0;
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-md">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{spec.label}</p>
      <p className="num mt-1 text-2xl font-bold text-white">
        {Number.isFinite(currVal) ? currVal.toFixed(spec.digits) : '–'}
        <span className="ml-1 text-xs font-normal text-slate-400">{spec.unit}</span>
      </p>
      <p
        className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${
          flat ? 'text-slate-500' : worse ? 'text-rose-400' : 'text-emerald-400'
        }`}
      >
        {!flat && <Icon className="h-3 w-3 shrink-0" />}
        {flat ? 'Stationary' : `${diff > 0 ? '+' : ''}${diff.toFixed(spec.digits)} vs Day 1`}
      </p>
    </div>
  );
}

function deriveHistoricalTwinState(day, baseTwinState) {
  if (!day) return baseTwinState;
  const hr = Number(day.heart_rate || 70);
  const stress = Number(day.stress_index || 30);
  const sleep = Number(day.sleep_hours || 7.5);
  const steps = Number(day.daily_steps || 8000);
  const score = Number(day.anomaly_score || 20);

  const heartColor = hr > 82 ? 'red' : hr > 74 ? 'amber' : 'green';
  const brainColor = stress > 65 || sleep < 6.0 ? 'red' : stress > 45 || sleep < 7.0 ? 'amber' : 'green';
  const lungColor = day.spo2 < 95.5 ? 'amber' : 'green';
  const metaColor = steps < 4500 || sleep < 6.0 ? 'amber' : 'green';

  const status = score >= 65 ? 'Critical Drift' : score >= 42 ? 'Strain Warning' : 'Optimal';

  return {
    ...baseTwinState,
    twin_status: status,
    scores: {
      cardio_strain_index: Math.max(15, Math.min(98, 100 - (hr - 50) * 1.2)),
      recovery_readiness: Math.max(15, Math.min(98, (sleep / 9.0) * 55 + (1 - stress / 100) * 45)),
      respiratory_stability: day.spo2 ? Math.min(99, day.spo2) : 95,
      metabolic_stability: Math.max(20, Math.min(98, (steps / 10000) * 55 + (sleep / 8.0) * 45)),
    },
    organ_highlights: {
      heart: heartColor,
      brain_nervous: brainColor,
      respiratory: lungColor,
      metabolism: metaColor,
    },
  };
}

export default function App() {
  const [patients, setPatients] = useState([]);
  const [patientId, setPatientId] = useState(initialPatient);
  const [monitoring, setMonitoring] = useState(null);
  const [twinState, setTwinState] = useState(null);
  const [xai, setXai] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tabs
  const [activeTab, setActiveTab] = useState('telemetry');
  // 'telemetry' | 'simulator' | 'xai' | 'streamer'

  // Sticky Twin & Baseline Chart Interactivity Coordination
  const [selectedOrgan, setSelectedOrgan] = useState('heart');
  const [activeVitalChart, setActiveVitalChart] = useState('heart_rate');
  const [selectedDayIndex, setSelectedDayIndex] = useState(null);
  const [simulatedTwin, setSimulatedTwin] = useState(null);

  // Live Streamer & Smartwatch Simulator
  const [isStreaming, setIsStreaming] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState('info');
  const streamTimerRef = useRef(null);

  // CSV Upload Modal State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Manual Vitals Logging Form State
  const [logForm, setLogForm] = useState({
    heart_rate: 75,
    spo2: 98,
    systolic_bp: 120,
    sleep_hours: 7.5,
    daily_steps: 8000,
    stress_index: 30,
  });

  const showToast = (msg, type = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4500);
  };

  // Load patient list
  useEffect(() => {
    fetchPatients()
      .then((data) => {
        setPatients(data);
        if (data.length && !data.some((p) => p.patient_id === patientId)) {
          setPatientId(data[0].patient_id);
        }
      })
      .catch((e) => setError(e.message));
  }, []);

  const loadPatientData = (pid) => {
    setLoading(true);
    setError(null);
    return Promise.all([fetchMonitoring(pid), fetchTwinState(pid), fetchXaiAlert(pid)])
      .then(([m, t, x]) => {
        setMonitoring(m);
        setTwinState(t);
        setXai(x);
        setSelectedDayIndex(m?.days?.length ? m.days.length - 1 : 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPatientData(patientId);
    setSimulatedTwin(null);
  }, [patientId]);

  // Live Streaming auto-polling (every 3s)
  useEffect(() => {
    if (isStreaming) {
      showToast('Live SmartWatch Telemetry Stream Active (3s ticks)', 'info');
      streamTimerRef.current = setInterval(async () => {
        try {
          const res = await simulateNextDay(patientId);
          if (res?.status === 'ok') {
            const updated = await fetchMonitoring(patientId);
            const updatedTwin = await fetchTwinState(patientId);
            setMonitoring(updated);
            setTwinState(updatedTwin);
            setSelectedDayIndex(updated.days.length - 1);
          }
        } catch (err) {
          console.error('Stream tick error:', err);
        }
      }, 3000);
    } else {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    }
    return () => {
      if (streamTimerRef.current) clearInterval(streamTimerRef.current);
    };
  }, [isStreaming, patientId]);

  // Event Injections
  const handleInjectStress = async () => {
    try {
      showToast('⚡ Acute Stress Spike Injected! Simulating sleep crash & sympathetic surge...', 'warning');
      await injectEvent(patientId, 'stress_spike');
      await loadPatientData(patientId);
    } catch (e) {
      showToast('Failed to inject stress: ' + e.message, 'warning');
    }
  };

  const handleInjectRecovery = async () => {
    try {
      showToast('💊 Restorative Recovery Day Injected! 9.2h sleep & vagal rebound simulated.', 'success');
      await injectEvent(patientId, 'recovery_day');
      await loadPatientData(patientId);
    } catch (e) {
      showToast('Failed to inject recovery: ' + e.message, 'warning');
    }
  };

  // CSV File Ingestion
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadLoading(true);
    try {
      const res = await uploadCsv(file);
      showToast(res.message, 'success');
      const updatedPatients = await fetchPatients();
      setPatients(updatedPatients);
      setShowUploadModal(false);
      await loadPatientData(patientId);
    } catch (err) {
      showToast('Upload failed: ' + err.message, 'warning');
    } finally {
      setUploadLoading(false);
    }
  };

  // Manual Log Submission
  const handleLogSubmit = async (e) => {
    e.preventDefault();
    try {
      await logVitals({
        patient_id: patientId,
        ...logForm,
      });
      showToast('New clinical day successfully logged to patient dataset!', 'success');
      await loadPatientData(patientId);
      setActiveTab('telemetry');
    } catch (err) {
      showToast('Logging failed: ' + err.message, 'warning');
    }
  };

  // 1-Click Clinical PDF Report Exporter
  const handlePrintReport = () => {
    window.print();
  };

  // Clickable SVG Organ to Vital Chart Synchronization
  const handleSelectOrgan = (organId) => {
    setSelectedOrgan(organId);
    const mapping = {
      heart: 'heart_rate',
      brain_nervous: 'stress_index',
      respiratory: 'spo2',
      metabolism: 'daily_steps',
    };
    if (mapping[organId]) {
      setActiveVitalChart(mapping[organId]);
    }
  };

  const handleInspectVital = (vitalKey) => {
    setActiveVitalChart(vitalKey);
    setActiveTab('telemetry');
  };

  const days = monitoring?.days ?? [];
  const currentDayIdx =
    selectedDayIndex !== null && selectedDayIndex >= 0 && selectedDayIndex < days.length
      ? selectedDayIndex
      : Math.max(0, days.length - 1);
  const activeDay = days[currentDayIdx] || days[days.length - 1];

  const effectiveTwinState = useMemo(() => {
    if (simulatedTwin) return simulatedTwin;
    if (currentDayIdx < days.length - 1 && activeDay) {
      return deriveHistoricalTwinState(activeDay, twinState);
    }
    return twinState;
  }, [simulatedTwin, currentDayIdx, days.length, activeDay, twinState]);

  const effectiveHeartRate = useMemo(() => {
    if (simulatedTwin?.heart_rate) return simulatedTwin.heart_rate;
    return activeDay?.heart_rate ?? 70;
  }, [simulatedTwin, activeDay]);

  const currentPatientMeta = patients.find((p) => p.patient_id === patientId) || {
    name: patientId,
    archetype: 'Clinical Archetype',
    age: 40,
    clinical_summary: 'Patient monitored with personal baseline modeling.',
  };

  const routine = useMemo(() => {
    const week = days.slice(-7);
    if (!week.length) return undefined;
    const avg = (k) => week.reduce((s, r) => s + Number(r[k] || 0), 0) / week.length;
    return {
      sleep_hours: avg('sleep_hours'),
      daily_steps: avg('daily_steps'),
      stress_index: avg('stress_index'),
    };
  }, [days]);

  const headline = HEADLINE[effectiveTwinState?.twin_status] ?? HEADLINE.Optimal;

  return (
    <div className="min-h-screen text-slate-100 selection:bg-cyan-500/30 selection:text-white">
      {/* Top Clinical Header & Streamer Command Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur-xl no-print">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          {/* Logo & Headline */}
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/40 bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.25)]">
              <Activity className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-white font-display">HealthTwin X</h1>
                <span className="rounded-md border border-cyan-500/40 bg-cyan-950/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  Clinical Command Center
                </span>
              </div>
              <p className="text-[11px] text-slate-400">12 Personas · PyOD Ensemble · Biological Twin Age</p>
            </div>
          </div>

          {/* Real-Time Telemetry & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Live Stream Button */}
            <button
              type="button"
              onClick={() => setIsStreaming((prev) => !prev)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition shadow-sm ${
                isStreaming
                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 animate-pulse'
                  : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:text-white'
              }`}
            >
              {isStreaming ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <Pause className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Streaming Live (3s)</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 text-cyan-400" />
                  <span>▶ Live Stream</span>
                </>
              )}
            </button>

            {/* Inject Stress Spike */}
            <button
              type="button"
              onClick={handleInjectStress}
              className="flex items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/25 hover:text-white"
            >
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>⚡ Stress Spike</span>
            </button>

            {/* Inject Recovery Day */}
            <button
              type="button"
              onClick={handleInjectRecovery}
              className="flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>💊 Recovery Day</span>
            </button>

            {/* Print Clinical Report */}
            <button
              type="button"
              onClick={handlePrintReport}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              <Printer className="h-3.5 w-3.5 text-cyan-400" />
              <span>Print Report</span>
            </button>

            {/* Upload CSV */}
            <button
              type="button"
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white"
            >
              <Upload className="h-3.5 w-3.5 text-cyan-400" />
              <span>Upload CSV</span>
            </button>
          </div>

          {/* 12 Patient Personas Selector Dropdown */}
          <div className="relative">
            <select
              value={patientId}
              onChange={(e) => {
                setPatientId(e.target.value);
                setIsStreaming(false);
              }}
              className="rounded-xl border border-cyan-400/50 bg-slate-900/90 py-1.5 pl-3 pr-8 text-xs font-bold text-white shadow-lg focus:border-cyan-400 focus:outline-none"
              aria-label="Select Patient Persona"
            >
              {patients.map((p) => (
                <option key={p.patient_id} value={p.patient_id} className="bg-slate-900 text-white">
                  {p.name} ({p.age}y) — {p.archetype}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Floating Instant Feedback Toast */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-xl animate-fadeIn ${
            toastType === 'warning'
              ? 'border-amber-400/50 bg-amber-950/90 text-amber-200'
              : toastType === 'success'
              ? 'border-emerald-400/50 bg-emerald-950/90 text-emerald-200'
              : 'border-cyan-400/50 bg-slate-900/90 text-cyan-200'
          }`}
          role="status"
        >
          {toastType === 'warning' ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 animate-bounce" />
          ) : toastType === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <Sparkles className="h-4 w-4 shrink-0 text-cyan-400" />
          )}
          <span>{toastMessage}</span>
        </div>
      )}

      {/* CSV Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">Upload Custom Patient CSV</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Upload a standard clinical dataset CSV with columns:
              <code className="block mt-1 p-2 rounded bg-slate-950 text-cyan-300 font-mono text-[11px]">
                patient_id, timestamp, heart_rate, spo2, systolic_bp, sleep_hours, daily_steps, stress_index
              </code>
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              disabled={uploadLoading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-4 rounded-xl border-2 border-dashed border-cyan-400/40 bg-cyan-950/20 text-xs font-semibold text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-950/40 flex flex-col items-center justify-center gap-2"
            >
              <Upload className="h-6 w-6 text-cyan-300" />
              <span>{uploadLoading ? 'Uploading & Fitting PyOD Ensemble...' : 'Click to select .csv file'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* Offline Mock Warning */}
        {!loading && isUsingMockData() && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-200 no-print" role="status">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-300" />
            <p>API offline: displaying mock clinical simulation. Connect localhost:8000 to synchronize live backend.</p>
          </div>
        )}

        {/* Global Patient Persona Summary Banner */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">
                  {currentPatientMeta?.archetype} · Age {currentPatientMeta?.age}
                </span>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-mono text-slate-300">
                  {patientId}
                </span>
              </div>
              <h2 className={`mt-1 font-display text-2xl sm:text-3xl font-black ${headline.tone}`}>
                {currentPatientMeta?.name}: {headline.title}
              </h2>
              <p className="mt-1 max-w-2xl text-xs text-slate-300 leading-relaxed">
                {currentPatientMeta?.clinical_summary || currentPatientMeta?.description}
              </p>
            </div>

            {/* Current Day Vitals Quick Grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 w-full lg:w-auto">
              {READOUTS.map((spec) => (
                <ReadoutCard key={spec.key} spec={spec} days={days} selectedIndex={currentDayIdx} />
              ))}
            </div>
          </div>
        </section>

        {/* STICKY SPLIT-SCREEN WORKSPACE */}
        <div className="grid grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (4 Cols): STICKY DIGITAL TWIN MESH & BIOLOGICAL AGE */}
          <div className="col-span-12 lg:col-span-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto pr-1">
            <TwinVisualizer
              twinState={effectiveTwinState}
              heartRate={effectiveHeartRate}
              selectedOrgan={selectedOrgan}
              onSelectOrgan={handleSelectOrgan}
              onInspectVital={handleInspectVital}
              isSimulated={Boolean(simulatedTwin)}
              timeTravelLabel={
                currentDayIdx < days.length - 1
                  ? `Day ${currentDayIdx + 1} (${activeDay?.timestamp ?? ''})`
                  : null
              }
              onResetTimeTravel={() => setSelectedDayIndex(days.length - 1)}
              currentVitals={activeDay}
            />
          </div>

          {/* RIGHT COLUMN (8 Cols): INTERACTIVE TABBED WORKSPACE */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {/* Tab Navigation Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 no-print">
              <div className="flex flex-wrap gap-2" role="tablist">
                {[
                  { id: 'telemetry', label: 'Live Telemetry & Baselines', icon: Activity },
                  { id: 'simulator', label: 'What-If Simulator Lab', icon: Sparkles },
                  { id: 'xai', label: 'XAI Root-Cause & Chat', icon: Compass },
                  { id: 'streamer', label: 'Log Vitals / Streamer', icon: Radio },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={isActive}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition ${
                        isActive
                          ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_20px_rgba(6,182,212,0.25)]'
                          : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {activeDay && (
                <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400 font-mono">
                  <Clock className="h-3.5 w-3.5 text-cyan-400" />
                  <span>
                    Viewing: <strong className="text-white">{activeDay.timestamp}</strong>
                  </span>
                </span>
              )}
            </div>

            {/* TAB 1: LIVE TELEMETRY & BASELINES */}
            {activeTab === 'telemetry' && (
              <div className="space-y-4 animate-fadeIn">
                <BaselineCharts
                  days={days}
                  activeMetric={activeVitalChart}
                  onMetricChange={setActiveVitalChart}
                  selectedDayIndex={currentDayIdx}
                  onSelectDayIndex={setSelectedDayIndex}
                />
              </div>
            )}

            {/* TAB 2: WHAT-IF SIMULATOR LAB */}
            {activeTab === 'simulator' && (
              <div className="space-y-4 animate-fadeIn">
                <WhatIfSandbox
                  patientId={patientId}
                  current={routine}
                  onSimulateTwin={setSimulatedTwin}
                  baseVitals={activeDay}
                />
              </div>
            )}

            {/* TAB 3: XAI ROOT-CAUSE & CHAT */}
            {activeTab === 'xai' && (
              <div className="space-y-4 animate-fadeIn">
                <XaiAlertPanel
                  xaiData={xai}
                  patientId={patientId}
                  onInspectFeature={handleInspectVital}
                />
              </div>
            )}

            {/* TAB 4: LOG VITALS / STREAMER */}
            {activeTab === 'streamer' && (
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-2xl space-y-6 animate-fadeIn">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Radio className="h-4 w-4 text-cyan-400" />
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                        SmartWatch Streamer & Clinical Ingestion
                      </p>
                    </div>
                    <h2 className="mt-1 text-lg font-bold text-white">Append Vitals & Real-Time Wearable Feed</h2>
                  </div>
                  <span className="rounded-full border border-cyan-400/30 bg-cyan-950/60 px-3 py-1 text-xs font-mono text-cyan-200">
                    Total Timeline: {days.length} Days
                  </span>
                </div>

                {/* Streamer Status & Action Cards */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-cyan-400" />
                      <span>SmartWatch Automatic Streamer</span>
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Automatically generates and broadcasts next-day biometric observations every 3 seconds, mimicking an Apple Watch or Whoop wearable streaming to your digital twin.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsStreaming((prev) => !prev)}
                      className={`w-full py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                        isStreaming
                          ? 'bg-rose-500 text-white hover:bg-rose-600'
                          : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400'
                      }`}
                    >
                      {isStreaming ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      <span>{isStreaming ? 'Pause SmartWatch Stream' : 'Start SmartWatch Live Stream'}</span>
                    </button>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <Flame className="h-4 w-4 text-amber-400" />
                      <span>Acute Clinical Stress Test & Recovery</span>
                    </p>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Inject sudden acute events to immediately test PyOD ensemble sensitivity and observe real-time body organ strain vs restorative rebound.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleInjectStress}
                        className="flex-1 py-2 rounded-xl border border-amber-500/50 bg-amber-500/20 text-xs font-bold text-amber-200 hover:bg-amber-500/30"
                      >
                        ⚡ Inject Stress
                      </button>
                      <button
                        type="button"
                        onClick={handleInjectRecovery}
                        className="flex-1 py-2 rounded-xl border border-emerald-500/50 bg-emerald-500/20 text-xs font-bold text-emerald-200 hover:bg-emerald-500/30"
                      >
                        💊 Inject Recovery
                      </button>
                    </div>
                  </div>
                </div>

                {/* Manual Log Vitals Form */}
                <form onSubmit={handleLogSubmit} className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="h-4 w-4 text-cyan-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Manual Telemetry Logger (Write-Through to CSV & Model)
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-[11px] text-slate-400">Heart Rate (bpm)</label>
                      <input
                        type="number"
                        min="30"
                        max="220"
                        value={logForm.heart_rate}
                        onChange={(e) => setLogForm({ ...logForm, heart_rate: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Oxygen Saturation (SpO₂ %)</label>
                      <input
                        type="number"
                        min="70"
                        max="100"
                        value={logForm.spo2}
                        onChange={(e) => setLogForm({ ...logForm, spo2: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Systolic Blood Pressure (mmHg)</label>
                      <input
                        type="number"
                        min="60"
                        max="240"
                        value={logForm.systolic_bp}
                        onChange={(e) => setLogForm({ ...logForm, systolic_bp: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Sleep Duration (hours)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="2"
                        max="16"
                        value={logForm.sleep_hours}
                        onChange={(e) => setLogForm({ ...logForm, sleep_hours: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Daily Steps</label>
                      <input
                        type="number"
                        min="0"
                        max="60000"
                        value={logForm.daily_steps}
                        onChange={(e) => setLogForm({ ...logForm, daily_steps: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400">Stress Index (0-100)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={logForm.stress_index}
                        onChange={(e) => setLogForm({ ...logForm, stress_index: Number(e.target.value) })}
                        className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-white"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-xl bg-cyan-500 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                  >
                    Commit Vitals to Patient CSV & Refit Baseline
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Printable Clinical Report Section (visible on window.print) */}
        <div className="hidden print:block print-only p-6 border border-slate-300 rounded-xl space-y-4">
          <div className="border-b pb-3">
            <h1 className="text-xl font-bold">HealthTwin X Clinical Digital Twin Report</h1>
            <p className="text-xs text-slate-600">Generated: {new Date().toLocaleDateString()} · Patient ID: {patientId}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p><strong>Patient Name:</strong> {currentPatientMeta?.name}</p>
              <p><strong>Chronological Age:</strong> {currentPatientMeta?.age} years</p>
              <p><strong>Archetype:</strong> {currentPatientMeta?.archetype}</p>
            </div>
            <div>
              <p><strong>Biological Twin Age:</strong> {effectiveTwinState?.biological_age?.biological_age} years</p>
              <p><strong>Digital Twin Status:</strong> {effectiveTwinState?.twin_status}</p>
              <p><strong>Cardio Strain Score:</strong> {effectiveTwinState?.scores?.cardio_strain_index} / 100</p>
            </div>
          </div>
          <div className="border-t pt-3 text-xs">
            <p><strong>Clinical Diagnostic Summary:</strong> {xai?.explanation_summary}</p>
            <p className="mt-1"><strong>Temporal Drift Onset:</strong> {xai?.drift_onset?.onset_narrative}</p>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-slate-800/80 pt-6 text-center text-xs leading-5 text-slate-500 no-print">
          HealthTwin X Clinical Command Center · Continuous Multivariate Digital Twin Platform · Research Prototype
        </footer>
      </main>
    </div>
  );
}
