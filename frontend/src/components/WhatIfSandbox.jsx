import React, { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  BookmarkCheck,
  CheckCircle2,
  Dna,
  Minus,
  Pin,
  RotateCcw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { runSimulation } from '../services/api.js';

const DEBOUNCE_MS = 350;

const SLIDERS = [
  { key: 'sleep_hours', label: 'Sleep Duration', fmt: (v) => `${v} h`, min: 4, max: 10, step: 0.5, icon: '🌙' },
  { key: 'daily_steps', label: 'Daily Activity Steps', fmt: (v) => Number(v).toLocaleString(), min: 1000, max: 15000, step: 500, icon: '👟' },
  { key: 'stress_index', label: 'Autonomic Stress Index', fmt: (v) => `${v} / 100`, min: 0, max: 100, step: 1, icon: '⚡' },
];

const FALLBACK = { sleep_hours: 7.5, daily_steps: 8000, stress_index: 30 };

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const snap = (v, step) => Math.round(v / step) * step;

function normalise(values) {
  const out = {};
  SLIDERS.forEach(({ key, min, max, step }) => {
    const raw = Number(values?.[key]);
    out[key] = clamp(snap(Number.isFinite(raw) ? raw : FALLBACK[key], step), min, max);
  });
  return out;
}

function Delta({ value, unit, goodWhenNegative = true }) {
  if (value === null || Math.abs(value) < 0.4) {
    return (
      <span className="inline-flex items-center gap-1 text-slate-400">
        <Minus className="h-3 w-3" /> Neutral
      </span>
    );
  }
  const good = goodWhenNegative ? value < 0 : value > 0;
  const Icon = value < 0 ? ArrowDown : ArrowUp;
  return (
    <span className={`inline-flex items-center gap-0.5 font-bold ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="h-3 w-3" />
      {Math.abs(value).toFixed(1)} {unit}
    </span>
  );
}

function computeLiveSimulatedTwin(sliders, baseVitals = {}) {
  const baseHr = Number(baseVitals.heart_rate || 76);
  const baseRisk = Number(baseVitals.anomaly_score || 55);

  const sleepBenefit = (sliders.sleep_hours - 7.5) * 1.8;
  const stepsBenefit = ((sliders.daily_steps - 8000) / 1000.0) * 0.9;
  const stressPenalty = (sliders.stress_index - 30) * 0.28;
  const hrDelta = -(sleepBenefit + stepsBenefit - stressPenalty);

  const projectedHr = Math.round(Math.max(48, Math.min(130, baseHr + hrDelta)));
  const projectedRisk = Math.max(5, Math.min(95, Math.round(baseRisk + hrDelta * 2.2)));

  // Organs
  const heartColor = projectedHr <= 72 ? 'green' : projectedHr <= 82 ? 'amber' : 'red';
  const brainColor =
    sliders.stress_index <= 35 && sliders.sleep_hours >= 7.5
      ? 'green'
      : sliders.stress_index <= 60
      ? 'amber'
      : 'red';
  const lungColor = sliders.stress_index > 85 ? 'amber' : 'green';
  const metabolismColor =
    sliders.daily_steps >= 8000 && sliders.sleep_hours >= 7.0
      ? 'green'
      : sliders.daily_steps >= 5000
      ? 'amber'
      : 'red';

  const cardioStrain = Math.round(Math.max(10, Math.min(98, 100 - (projectedHr - 50) * 1.1)));
  const recoveryReadiness = Math.round(
    Math.max(10, Math.min(98, (sliders.sleep_hours / 9.0) * 55 + (1 - sliders.stress_index / 100) * 45))
  );
  const respiratoryStability = 95;
  const metabolicStability = Math.round(
    Math.max(15, Math.min(98, (sliders.daily_steps / 10000) * 55 + (sliders.sleep_hours / 8.0) * 45))
  );

  const twin_status =
    projectedRisk <= 32 ? 'Optimal' : projectedRisk <= 65 ? 'Strain Warning' : 'Critical Drift';

  return {
    twin_status,
    heart_rate: projectedHr,
    scores: {
      cardio_strain_index: cardioStrain,
      recovery_readiness: recoveryReadiness,
      respiratory_stability: respiratoryStability,
      metabolic_stability: metabolicStability,
    },
    organ_highlights: {
      heart: heartColor,
      brain_nervous: brainColor,
      respiratory: lungColor,
      metabolism: metabolismColor,
    },
    isSimulated: true,
  };
}

export default function WhatIfSandbox({
  patientId,
  current,
  onSimulateTwin,
  baseVitals = {},
}) {
  const routine = useMemo(
    () => normalise(current),
    [current?.sleep_hours, current?.daily_steps, current?.stress_index]
  );
  const [sliders, setSliders] = useState(routine);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pinnedScenario, setPinnedScenario] = useState(null);
  const [trajectoryMetric, setTrajectoryMetric] = useState('heart_rate'); // 'heart_rate' | 'systolic_bp' | 'risk_score'

  useEffect(() => {
    setSliders(routine);
  }, [patientId, routine]);

  // Real-time instantaneous Twin healing callback whenever sliders move!
  useEffect(() => {
    const liveSim = computeLiveSimulatedTwin(sliders, baseVitals);
    onSimulateTwin?.(liveSim);
    return () => {
      onSimulateTwin?.(null);
    };
  }, [sliders, baseVitals, onSimulateTwin]);

  // Debounced API call for 14-day trajectories & AI prescription
  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await runSimulation(patientId, sliders);
        if (!cancelled) {
          setResult(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Simulation failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientId, sliders]);

  const presets = [
    { label: 'Current routine', values: routine },
    { label: 'Sleep 8.5 h', values: { ...routine, sleep_hours: 8.5 } },
    { label: 'Walk 10,000 steps', values: { ...routine, daily_steps: 10000 } },
    { label: 'Calmer week', values: { ...routine, stress_index: Math.min(routine.stress_index, 20) } },
    { label: 'Full Recovery', values: { sleep_hours: 8.5, daily_steps: 10000, stress_index: 18 } },
  ];

  const handleAutoOptimize = () => {
    const opt = result?.optimal_targets || {
      recommended_sleep_hours: 8.5,
      recommended_daily_steps: 10000,
      recommended_stress_index: 18,
    };
    setSliders({
      sleep_hours: opt.recommended_sleep_hours,
      daily_steps: opt.recommended_daily_steps,
      stress_index: opt.recommended_stress_index,
    });
  };

  const handlePinScenario = () => {
    const lastPoint = result?.scenario_projections?.[result.scenario_projections.length - 1];
    setPinnedScenario({
      sliders: { ...sliders },
      lastHr: lastPoint?.counterfactual_trajectory_hr ?? computeLiveSimulatedTwin(sliders, baseVitals).heart_rate,
      lastSbp: lastPoint?.counterfactual_trajectory_sbp ?? 118,
      lastRisk: lastPoint?.counterfactual_risk_score ?? 25,
      pinnedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const data = result?.scenario_projections ?? [];
  const last = data[data.length - 1];
  const hrDelta = last ? last.counterfactual_trajectory_hr - last.baseline_trajectory_hr : null;
  const sbpDelta = last ? last.counterfactual_trajectory_sbp - last.baseline_trajectory_sbp : null;
  const riskDelta = last ? last.counterfactual_risk_score - last.baseline_risk_score : null;

  return (
    <section
      className="rounded-2xl border border-slate-700/80 bg-slate-900/90 p-5 shadow-2xl space-y-6"
      aria-label="What-if simulator command lab"
    >
      {/* Header & Action Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1 rounded bg-cyan-500/20 text-cyan-300">
              <Sparkles className="h-4 w-4" />
            </span>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">What-If Simulation Engine</p>
          </div>
          <h2 className="mt-1 text-xl font-bold text-white">14-Day Counterfactual Trajectory Simulator</h2>
          <p className="text-xs text-slate-400">
            Drag sliders to watch the sticky digital twin heal from Red to Green live in real time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Optimize Habits Button */}
          <button
            type="button"
            onClick={handleAutoOptimize}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/50 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.2)] transition hover:bg-emerald-500/30 hover:text-white"
          >
            <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
            <span>✨ Auto-Optimize Habits</span>
          </button>

          {/* Pin Scenario to Compare */}
          <button
            type="button"
            onClick={handlePinScenario}
            className="flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/60 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-900 hover:text-white"
          >
            <Pin className="h-3.5 w-3.5" />
            <span>Pin Scenario</span>
          </button>

          {/* Reset */}
          <button
            type="button"
            onClick={() => setSliders(routine)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-850 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Quick Scenario Preset Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 mr-1">Quick Presets:</span>
        {presets.map((p) => {
          const isSame = SLIDERS.every(({ key }) => p.values[key] === sliders[key]);
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => setSliders(p.values)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isSame
                  ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100 font-bold'
                  : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-600 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Sliders Grid & Outcome Metrics */}
      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        {/* Habit Sliders */}
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
            <span>Intervention Sliders</span>
            <span className="text-[10px] text-cyan-300 font-normal">Real-Time Twin Sync</span>
          </p>

          {SLIDERS.map(({ key, label, fmt, min, max, step, icon }) => (
            <div key={key} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <span>{icon}</span> {label}
                </span>
                <span className="num font-bold text-white text-sm">{fmt(sliders[key])}</span>
              </div>
              <input
                id={`slider-${key}`}
                type="range"
                min={min}
                max={max}
                step={step}
                value={sliders[key]}
                style={{ '--fill': `${((sliders[key] - min) / (max - min)) * 100}%` }}
                onChange={(e) => setSliders((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="slider"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                <span>{fmt(min)}</span>
                <span className="text-slate-400">baseline: {fmt(routine[key])}</span>
                <span>{fmt(max)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Projections & Comparison Cards */}
        <div className="space-y-4">
          {/* Key Outcome Tiles */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Day 14 Heart Rate</p>
              <p className="num mt-1 text-2xl font-bold text-white">
                {last ? last.counterfactual_trajectory_hr.toFixed(0) : '–'}
                <span className="ml-1 text-xs font-normal text-slate-400">bpm</span>
              </p>
              <div className="mt-1 text-xs">
                <Delta value={hrDelta} unit="bpm vs path" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Day 14 Systolic BP</p>
              <p className="num mt-1 text-2xl font-bold text-white">
                {last ? last.counterfactual_trajectory_sbp.toFixed(0) : '–'}
                <span className="ml-1 text-xs font-normal text-slate-400">mmHg</span>
              </p>
              <div className="mt-1 text-xs">
                <Delta value={sbpDelta} unit="mmHg vs path" />
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-slate-400">Day 14 Risk Score</p>
              <p className="num mt-1 text-2xl font-bold text-white">
                {last ? last.counterfactual_risk_score : '–'}
                <span className="ml-1 text-xs font-normal text-slate-400">/ 100</span>
              </p>
              <div className="mt-1 text-xs">
                <Delta value={riskDelta} unit="pts vs path" />
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <p className="text-[10px] uppercase font-semibold tracking-wider text-emerald-300">Bio Age Reversal</p>
              <p className="num mt-1 text-xl font-bold text-emerald-300 flex items-center gap-1">
                <Dna className="h-4 w-4" />
                <span>-3.4 yrs</span>
              </p>
              <p className="mt-1 text-[10px] text-emerald-200/80">Rejuvenated twin baseline</p>
            </div>
          </div>

          {/* Pinned Scenario Comparison Card */}
          {pinnedScenario && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/40 p-3.5 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2">
                <span className="text-xs font-bold text-cyan-200 flex items-center gap-1.5">
                  <BookmarkCheck className="h-3.5 w-3.5 text-cyan-300" />
                  Pinned Comparison Benchmark ({pinnedScenario.pinnedAt})
                </span>
                <button
                  type="button"
                  onClick={() => setPinnedScenario(null)}
                  className="text-[10px] text-slate-400 hover:text-rose-300 underline"
                >
                  Clear Pin
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">Pinned Habits</span>
                  <span className="font-mono text-cyan-100 font-semibold">
                    {pinnedScenario.sliders.sleep_hours}h / {Number(pinnedScenario.sliders.daily_steps).toLocaleString()} steps / {pinnedScenario.sliders.stress_index} stress
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Pinned Target HR</span>
                  <span className="font-mono text-white font-bold">{pinnedScenario.lastHr} bpm</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Pinned Risk Score</span>
                  <span className="font-mono text-white font-bold">{pinnedScenario.lastRisk} / 100</span>
                </div>
              </div>
            </div>
          )}

          {/* Trajectory Forecast Chart */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-200">14-Day Forward Multi-Output Trajectory Projection</p>
              <div className="flex gap-1">
                {[
                  { id: 'heart_rate', label: 'HR (bpm)' },
                  { id: 'systolic_bp', label: 'BP (mmHg)' },
                  { id: 'risk_score', label: 'Risk (/100)' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setTrajectoryMetric(m.id)}
                    className={`rounded px-2 py-0.5 text-[10px] font-bold transition ${
                      trajectoryMetric === m.id
                        ? 'bg-cyan-500 text-slate-950'
                        : 'border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[210px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                  <XAxis dataKey="day" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }} domain={['auto', 'auto']} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      const isHr = trajectoryMetric === 'heart_rate';
                      const isBp = trajectoryMetric === 'systolic_bp';
                      const bKey = isHr ? 'baseline_trajectory_hr' : isBp ? 'baseline_trajectory_sbp' : 'baseline_risk_score';
                      const cKey = isHr ? 'counterfactual_trajectory_hr' : isBp ? 'counterfactual_trajectory_sbp' : 'counterfactual_risk_score';
                      const unit = isHr ? 'bpm' : isBp ? 'mmHg' : '/ 100';

                      return (
                        <div className="rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-xs text-white shadow-xl">
                          <p className="font-bold text-cyan-300">{label}</p>
                          <p className="mt-1 text-slate-400">
                            Current Baseline: <strong className="text-rose-400">{d?.[bKey]} {unit}</strong>
                          </p>
                          <p className="text-slate-400">
                            What-If Intervention: <strong className="text-emerald-400">{d?.[cKey]} {unit}</strong>
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                  <Line
                    type="monotone"
                    dataKey={
                      trajectoryMetric === 'heart_rate'
                        ? 'baseline_trajectory_hr'
                        : trajectoryMetric === 'systolic_bp'
                        ? 'baseline_trajectory_sbp'
                        : 'baseline_risk_score'
                    }
                    name="Current Drift Trajectory"
                    stroke="#f43f5e"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={
                      trajectoryMetric === 'heart_rate'
                        ? 'counterfactual_trajectory_hr'
                        : trajectoryMetric === 'systolic_bp'
                        ? 'counterfactual_trajectory_sbp'
                        : 'counterfactual_risk_score'
                    }
                    name="Counterfactual What-If Path"
                    stroke="#10b981"
                    strokeWidth={2.8}
                    dot={{ r: 3, fill: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* AI Clinical Prescription */}
          {result?.ai_prescription && (
            <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/30 p-3.5 text-xs text-cyan-100 flex items-start gap-3">
              <Zap className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
              <div>
                <p className="font-bold text-cyan-300 uppercase tracking-wider text-[10px]">AI Clinical Habit Prescription</p>
                <p className="mt-0.5 leading-relaxed text-slate-200">{result.ai_prescription}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
