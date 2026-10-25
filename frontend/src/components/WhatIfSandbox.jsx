import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { runSimulation } from '../services/api.js';

const DEBOUNCE_MS = 400;

const SLIDERS = [
  { key: 'sleep_hours', label: 'Sleep', unit: 'h', min: 4, max: 10, step: 0.5 },
  { key: 'daily_steps', label: 'Daily steps', unit: '', min: 1000, max: 15000, step: 500 },
  { key: 'stress_index', label: 'Stress index', unit: '', min: 0, max: 100, step: 1 },
];

const DEFAULTS = { sleep_hours: 7.5, daily_steps: 8000, stress_index: 30 };

export default function WhatIfSandbox({ patientId }) {
  const [sliders, setSliders] = useState(DEFAULTS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Debounce: wait until the user stops dragging before calling the API.
  // The `cancelled` flag stops a slow, older response overwriting a newer one.
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

  const data = result?.scenario_projections ?? [];

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg" aria-label="What-if simulator">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Counterfactual</p>
          <h2 className="mt-1 text-lg font-semibold text-white">What-if sandbox</h2>
        </div>
        {loading && <Loader2 className="h-5 w-5 animate-spin text-cyan-300" aria-label="Loading" />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <div className="space-y-5">
          {SLIDERS.map(({ key, label, unit, min, max, step }) => (
            <label key={key} className="block text-sm">
              <span className="flex justify-between text-slate-300">
                {label}
                <span className="font-semibold text-white">{sliders[key]}{unit}</span>
              </span>
              <input
                type="range" min={min} max={max} step={step} value={sliders[key]}
                onChange={(e) => setSliders((s) => ({ ...s, [key]: Number(e.target.value) }))}
                className="mt-2 w-full accent-cyan-400"
              />
            </label>
          ))}
        </div>

        <div>
          {error ? (
            <div className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-300" role="alert">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={['auto', 'auto']} unit=" bpm" width={64} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }} />
                  <Legend />
                  <Line type="monotone" dataKey="baseline_trajectory_hr" name="Current path"
                    stroke="#f43f5e" strokeDasharray="6 4" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="counterfactual_trajectory_hr" name="With changes"
                    stroke="#10b981" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {result?.ai_prescription && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-sm text-cyan-100">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
              <p>{result.ai_prescription}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
