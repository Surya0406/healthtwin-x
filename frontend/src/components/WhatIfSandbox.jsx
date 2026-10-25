import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { AlertCircle, ArrowDown, ArrowUp, Minus, RotateCcw, Sparkles } from 'lucide-react';
import { runSimulation } from '../services/api.js';

const DEBOUNCE_MS = 400;

const SLIDERS = [
  { key: 'sleep_hours', label: 'Sleep', fmt: (v) => `${v} h`, min: 4, max: 10, step: 0.5 },
  { key: 'daily_steps', label: 'Daily steps', fmt: (v) => Number(v).toLocaleString(), min: 1000, max: 15000, step: 500 },
  { key: 'stress_index', label: 'Stress index', fmt: (v) => `${v}`, min: 0, max: 100, step: 1 },
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
  if (value === null || Math.abs(value) < 0.5) {
    return <span className="inline-flex items-center gap-1 text-slate-400"><Minus className="h-3.5 w-3.5" />no change</span>;
  }
  const good = goodWhenNegative ? value < 0 : value > 0;
  const Icon = value < 0 ? ArrowDown : ArrowUp;
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
      <Icon className="h-3.5 w-3.5" />{Math.abs(value).toFixed(1)} {unit}
    </span>
  );
}

export default function WhatIfSandbox({ patientId, current }) {
  // "Current routine" = the patient's own latest numbers, so both lines start together.
  const routine = useMemo(() => normalise(current), [current?.sleep_hours, current?.daily_steps, current?.stress_index]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sliders, setSliders] = useState(routine);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setSliders(routine); }, [patientId, routine]);

  // Debounce so dragging does not spam the API; `cancelled` stops a slow older reply overwriting a newer one.
  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await runSimulation(patientId, sliders);
        if (!cancelled) { setResult(data); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Simulation failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [patientId, sliders]);

  const presets = [
    { label: 'Current routine', values: routine },
    { label: 'Sleep 8.5 h', values: { ...routine, sleep_hours: 8.5 } },
    { label: 'Walk 10,000 steps', values: { ...routine, daily_steps: 10000 } },
    { label: 'Calmer week', values: { ...routine, stress_index: Math.min(routine.stress_index, 20) } },
    { label: 'All three', values: { sleep_hours: 8.5, daily_steps: 10000, stress_index: Math.min(routine.stress_index, 20) } },
  ];
  const sameAs = (v) => SLIDERS.every(({ key }) => v[key] === sliders[key]);
  // Only the first matching preset is highlighted, so two identical presets never both look selected.
  const activeIdx = presets.findIndex((p) => sameAs(p.values));

  const data = result?.scenario_projections ?? [];
  const last = data[data.length - 1];
  const hrDelta = last ? last.counterfactual_trajectory_hr - last.baseline_trajectory_hr : null;
  const riskDelta = last ? last.counterfactual_risk_score - last.baseline_risk_score : null;

  return (
    <section className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]" aria-label="What-if simulator">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">What if</p>
          <h2 className="mt-1 text-xl font-semibold text-white">Change the routine, see the next 7 days</h2>
        </div>
        <button type="button" onClick={() => setSliders(routine)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-cyan-300/60 hover:text-white">
          <RotateCcw className="h-3.5 w-3.5" /> Reset to current routine
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Quick scenarios">
        {presets.map((p, i) => (
          <button key={p.label} type="button" onClick={() => setSliders(p.values)} aria-pressed={i === activeIdx}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${i === activeIdx
              ? 'border-cyan-300/70 bg-cyan-300/10 text-cyan-100'
              : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[280px_1fr]">
        <div className="space-y-5">
          {SLIDERS.map(({ key, label, fmt, min, max, step }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between text-sm">
                <label htmlFor={`s-${key}`} className="text-slate-300">{label}</label>
                <span className="num text-lg font-semibold text-white">{fmt(sliders[key])}</span>
              </div>
              <input id={`s-${key}`} className="slider mt-1" type="range" min={min} max={max} step={step} value={sliders[key]}
                style={{ '--fill': `${((sliders[key] - min) / (max - min)) * 100}%` }}
                onChange={(e) => setSliders((s) => ({ ...s, [key]: Number(e.target.value) }))} />
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>{fmt(min)}</span>
                <span>now {fmt(routine[key])}</span>
                <span>{fmt(max)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className={`transition-opacity ${loading ? 'opacity-60' : 'opacity-100'}`}>
          {error ? (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-200" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>The simulation failed: {error}. Move a slider to try again.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Heart rate on day 7</p>
                  <p className="num mt-1 text-3xl font-semibold text-white">
                    {last ? last.counterfactual_trajectory_hr.toFixed(0) : '–'}<span className="ml-1 text-sm font-normal text-slate-400">bpm</span>
                  </p>
                  <p className="mt-1 text-xs"><Delta value={hrDelta} unit="bpm vs. current path" /></p>
                </div>
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                  <p className="text-[11px] uppercase tracking-wider text-slate-400">Risk score on day 7</p>
                  <p className="num mt-1 text-3xl font-semibold text-white">
                    {last ? last.counterfactual_risk_score : '–'}<span className="ml-1 text-sm font-normal text-slate-400">/ 100</span>
                  </p>
                  <p className="mt-1 text-xs"><Delta value={riskDelta} unit="pts vs. current path" /></p>
                </div>
              </div>

              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} domain={[(min) => Math.floor(min - 3), (max) => Math.ceil(max + 3)]} tickFormatter={(v) => Math.round(v)} allowDecimals={false} width={44} />
                    <Tooltip contentStyle={{ background: '#0b1320', border: '1px solid #334155', borderRadius: 8 }}
                      formatter={(v) => [`${Number(v).toFixed(1)} bpm`]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="baseline_trajectory_hr" name="Current path"
                      stroke="#fb7185" strokeDasharray="6 4" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="counterfactual_trajectory_hr" name="With these changes"
                      stroke="#34d399" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {result?.ai_prescription && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.06] p-4 text-sm leading-6 text-cyan-50">
              <Sparkles className="mt-1 h-4 w-4 shrink-0 text-cyan-300" />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-300">Suggested plan</p>
                <p>{result.ai_prescription}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
