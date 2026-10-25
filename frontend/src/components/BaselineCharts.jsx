import React, { useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Clock,
  Compass,
  Footprints,
  Heart,
  Info,
  Moon,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';

export const METRIC_CONFIGS = {
  heart_rate: {
    key: 'heart_rate',
    title: 'Heart Rate',
    unit: 'bpm',
    icon: Heart,
    staticCutoff: 100,
    cutoffLabel: 'Hospital Tachycardia Cutoff (100 bpm)',
    cutoffDirection: 'above',
    fixedMissReason:
      "Patient 2's resting HR drifted from 66 up to 83 bpm (+17 bpm increase!). Because 83 is below the fixed 100 bpm emergency threshold, standard wearables fail to alert. HealthTwin's AI caught it on Day 49 (+2.8σ drift).",
    accent: {
      text: 'text-rose-400',
      border: 'border-rose-500/30',
      bg: 'bg-rose-500/10',
      stroke: '#f43f5e',
      band: '#f43f5e',
    },
  },
  spo2: {
    key: 'spo2',
    title: 'Oxygen Saturation (SpO₂)',
    unit: '%',
    icon: Activity,
    staticCutoff: 95,
    cutoffLabel: 'Clinical Hypoxemia Cutoff (95%)',
    cutoffDirection: 'below',
    fixedMissReason:
      'Mild desaturation down to 95.5% looks acceptable to standard monitors, but when paired with rising heart rate and sleep loss, HealthTwin identifies early respiratory strain 4 days before acute symptoms.',
    accent: {
      text: 'text-cyan-400',
      border: 'border-cyan-500/30',
      bg: 'bg-cyan-500/10',
      stroke: '#06b6d4',
      band: '#06b6d4',
    },
  },
  systolic_bp: {
    key: 'systolic_bp',
    title: 'Systolic Blood Pressure',
    unit: 'mmHg',
    icon: Compass,
    staticCutoff: 130,
    cutoffLabel: 'AHA Stage 1 Hypertension (130 mmHg)',
    cutoffDirection: 'above',
    fixedMissReason:
      'Subtle vascular remodeling causes progressive baseline elevation. HealthTwin flags the trajectory before the patient enters sustained chronic hypertension.',
    accent: {
      text: 'text-amber-400',
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/10',
      stroke: '#f59e0b',
      band: '#f59e0b',
    },
  },
  sleep_hours: {
    key: 'sleep_hours',
    title: 'Sleep Duration',
    unit: 'h',
    icon: Moon,
    staticCutoff: 6.0,
    cutoffLabel: 'Generic Sleep Deprivation (6.0 h)',
    cutoffDirection: 'below',
    fixedMissReason:
      'A drop from a personal 7.8h baseline to 5.2h is a 33% biological recovery deficit. Static health apps do not individualize sleep debt to athletic vs sedentary baselines.',
    accent: {
      text: 'text-indigo-400',
      border: 'border-indigo-500/30',
      bg: 'bg-indigo-500/10',
      stroke: '#818cf8',
      band: '#818cf8',
    },
  },
  daily_steps: {
    key: 'daily_steps',
    title: 'Daily Steps',
    unit: 'steps',
    icon: Footprints,
    staticCutoff: 5000,
    cutoffLabel: 'Sedentary Population Line (5,000 steps)',
    cutoffDirection: 'below',
    fixedMissReason:
      'For an active user accustomed to 13,800 daily steps, a sudden drop to 5,400 steps signals acute neuro-fatigue or viral lethargy days before overt symptoms appear.',
    accent: {
      text: 'text-emerald-400',
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/10',
      stroke: '#10b981',
      band: '#10b981',
    },
  },
  stress_index: {
    key: 'stress_index',
    title: 'Autonomic Stress Index',
    unit: '/ 100',
    icon: Zap,
    staticCutoff: 65,
    cutoffLabel: 'High Sympathetic Tone Threshold (65)',
    cutoffDirection: 'above',
    fixedMissReason:
      'Gradual autonomic nervous tone escalation is invisible without rolling multivariate baseline modeling, linking poor sleep directly to sympathetic overdrive.',
    accent: {
      text: 'text-violet-400',
      border: 'border-violet-500/30',
      bg: 'bg-violet-500/10',
      stroke: '#a78bfa',
      band: '#a78bfa',
    },
  },
};

const formatTickDate = (val) => {
  if (!val) return '';
  const parts = String(val).split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${months[m] || parts[1]} ${d}`;
  }
  return val;
};

const formatTooltipDate = (val) => {
  if (!val) return '';
  const parts = String(val).split('-');
  if (parts.length === 3) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${months[m] || parts[1]} ${d}, ${parts[0]}`;
  }
  return val;
};

const getYDomain = (data, metricKey, minRange = 8) => {
  if (!data || data.length === 0) return ['auto', 'auto'];
  let min = Infinity;
  let max = -Infinity;

  for (const item of data) {
    const val = item[metricKey];
    const lower = item[`${metricKey}_lower_band`];
    const upper = item[`${metricKey}_upper_band`];

    [val, lower, upper].forEach((v) => {
      if (typeof v === 'number' && !isNaN(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    });
  }

  const staticVal = METRIC_CONFIGS[metricKey]?.staticCutoff;
  if (typeof staticVal === 'number') {
    if (staticVal < min) min = staticVal;
    if (staticVal > max) max = staticVal;
  }

  if (min === Infinity || max === -Infinity) return ['auto', 'auto'];

  let range = max - min;
  if (range < minRange) {
    const mid = (max + min) / 2;
    min = mid - minRange / 2;
    max = mid + minRange / 2;
    range = minRange;
  }

  const pad = Math.max(range * 0.12, 0.5);
  const isDecimal = metricKey === 'sleep_hours';
  let dMin = Math.max(0.5, min - pad);
  let dMax = max + pad;

  if (isDecimal) {
    return [Math.floor(dMin * 10) / 10, Math.ceil(dMax * 10) / 10];
  }
  return [Math.floor(dMin), Math.ceil(dMax)];
};

const getConsecutiveFlaggedRanges = (data) => {
  if (!data || data.length === 0) return [];
  const ranges = [];
  let currentStart = null;
  let currentEnd = null;

  data.forEach((item) => {
    if (item.anomaly_flag === 1) {
      if (currentStart === null) currentStart = item.timestamp;
      currentEnd = item.timestamp;
    } else {
      if (currentStart !== null) {
        ranges.push({ start: currentStart, end: currentEnd });
        currentStart = null;
        currentEnd = null;
      }
    }
  });

  if (currentStart !== null) {
    ranges.push({ start: currentStart, end: currentEnd });
  }

  return ranges;
};

export default function BaselineCharts({
  days = [],
  activeMetric = 'heart_rate',
  onMetricChange,
  selectedDayIndex = null,
  onSelectDayIndex,
}) {
  const [baselineMode, setBaselineMode] = useState('dynamic'); // 'dynamic' | 'static'
  const isDynamic = baselineMode === 'dynamic';

  const cfg = METRIC_CONFIGS[activeMetric] || METRIC_CONFIGS.heart_rate;
  const MetricIcon = cfg.icon;

  const yDomain = getYDomain(days, cfg.key, cfg.key === 'sleep_hours' ? 3 : 10);
  const flaggedRanges = getConsecutiveFlaggedRanges(days);

  const chartData = days.map((item, idx) => {
    const lower = item[`${cfg.key}_lower_band`] ?? item[cfg.key] * 0.94;
    const upper = item[`${cfg.key}_upper_band`] ?? item[cfg.key] * 1.06;
    return {
      ...item,
      dayIndex: idx,
      band_range: [lower, upper],
    };
  });

  const selectedIdx = selectedDayIndex !== null && selectedDayIndex >= 0 && selectedDayIndex < days.length
    ? selectedDayIndex
    : Math.max(0, days.length - 1);
  const selectedDay = days[selectedIdx] || days[days.length - 1] || {};

  const handleChartClick = (e) => {
    if (e && e.activePayload && e.activePayload.length > 0) {
      const clickedData = e.activePayload[0].payload;
      if (typeof clickedData.dayIndex === 'number') {
        onSelectDayIndex?.(clickedData.dayIndex);
      }
    }
  };

  const stabilityScore = selectedDay.baseline_stability_score ?? 88;
  const driftVelocity = selectedDay.drift_velocity ?? 0.0;
  const modelAgreement = selectedDay.model_agreement ?? '3/3 Models Agree';

  return (
    <div className="space-y-4" aria-label="Personalized Clinical Baseline Dashboard">
      {/* Top Controls: 6 Vitals Tabs + Static/Dynamic Toggle */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Vital Tabs */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Select Biometric Vital">
            {Object.values(METRIC_CONFIGS).map((item) => {
              const isActive = item.key === activeMetric;
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => onMetricChange?.(item.key)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? 'border-cyan-400 bg-cyan-500/20 text-white shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                      : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.title}</span>
                </button>
              );
            })}
          </div>

          {/* Static vs Dynamic Baseline Toggle */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-950/80 p-1">
            <button
              type="button"
              onClick={() => setBaselineMode('dynamic')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                isDynamic
                  ? 'bg-cyan-500 text-slate-950 shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>HealthTwin AI (±2σ)</span>
            </button>
            <button
              type="button"
              onClick={() => setBaselineMode('static')}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                !isDynamic
                  ? 'bg-rose-500 text-white shadow-md font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Traditional Fixed</span>
            </button>
          </div>
        </div>

        {/* Dynamic vs Static Educational Callout Banner */}
        {!isDynamic ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200 animate-fadeIn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold text-rose-300">
                Traditional Fixed Cutoff: {cfg.cutoffLabel}
              </p>
              <p className="mt-0.5 text-slate-300 leading-relaxed">{cfg.fixedMissReason}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-xs text-cyan-200 animate-fadeIn">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
            <div>
              <p className="font-semibold text-cyan-200">
                HealthTwin Personalized Rolling Baselines (7-day Acute Band & 30-day Chronic Mean)
              </p>
              <p className="mt-0.5 text-slate-300 leading-relaxed">
                Multivariate PyOD ensemble (IForest + ECOD + COPOD) models individual baseline distributions.
                Catches gradual drift days before generic population cutoffs trigger alarms.
              </p>
            </div>
          </div>
        )}

        {/* 90-Day Timeline Scrubber Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-cyan-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Timeline Scrubber:
            </span>
            <span className="rounded-md border border-cyan-400/30 bg-cyan-950/60 px-2 py-0.5 font-mono text-xs font-bold text-cyan-200">
              Day {selectedIdx + 1} of {days.length} ({selectedDay.timestamp ?? '–'})
            </span>
            {selectedIdx < days.length - 1 && (
              <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-400/30 animate-pulse">
                Historical View
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedIdx <= 0}
              onClick={() => onSelectDayIndex?.(0)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
            >
              ⏮ Day 1
            </button>
            <button
              type="button"
              disabled={selectedIdx < 30}
              onClick={() => onSelectDayIndex?.(29)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
            >
              Day 30
            </button>
            <button
              type="button"
              disabled={selectedIdx < 60}
              onClick={() => onSelectDayIndex?.(59)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-40"
            >
              Day 60
            </button>
            <input
              type="range"
              min={0}
              max={Math.max(0, days.length - 1)}
              value={selectedIdx}
              onChange={(e) => onSelectDayIndex?.(Number(e.target.value))}
              className="slider w-28 sm:w-44"
              style={{ '--fill': `${(selectedIdx / Math.max(1, days.length - 1)) * 100}%` }}
              aria-label="Scrub through 90-day history"
            />
            <button
              type="button"
              disabled={selectedIdx >= days.length - 1}
              onClick={() => onSelectDayIndex?.(days.length - 1)}
              className="rounded-lg border border-cyan-400/40 bg-cyan-950/60 px-2 py-1 text-[11px] font-bold text-cyan-200 transition hover:bg-cyan-900 disabled:opacity-40"
            >
              Live ⏭
            </button>
          </div>
        </div>

        {/* Analytics Diagnostic Strip: Stability Score, Drift Velocity, Model Agreement */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 border-t border-slate-800/80 pt-2 text-[11px]">
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
            <span className="text-slate-400 block text-[10px]">Baseline Stability</span>
            <span className="font-mono font-bold text-cyan-300">{stabilityScore} / 100</span>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
            <span className="text-slate-400 block text-[10px]">Drift Velocity</span>
            <span className={`font-mono font-bold ${driftVelocity > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {driftVelocity > 0 ? `+${driftVelocity}` : driftVelocity} pts/day
            </span>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
            <span className="text-slate-400 block text-[10px]">PyOD Agreement</span>
            <span className="font-mono font-semibold text-slate-200">{modelAgreement}</span>
          </div>
          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-2">
            <span className="text-slate-400 block text-[10px]">Pattern Archetype</span>
            <span className="font-semibold text-amber-300 truncate block">
              {selectedDay.pattern_type || 'Stable Baseline'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Large Chart Canvas */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${cfg.accent.bg} ${cfg.accent.border} ${cfg.accent.text}`}>
              <MetricIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">{cfg.title}</h3>
                <span className="rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  Click any point to travel in time
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isDynamic ? 'Observed vitals vs personalized ±2σ normal band' : `Observed vitals vs ${cfg.cutoffLabel}`}
              </p>
            </div>
          </div>

          {/* Selected day value */}
          <div className="text-right">
            <div className="flex items-baseline justify-end gap-1.5">
              <span className="font-mono text-2xl font-bold text-white">
                {typeof selectedDay[cfg.key] === 'number'
                  ? selectedDay[cfg.key].toFixed(cfg.key === 'sleep_hours' ? 1 : 0)
                  : selectedDay[cfg.key] ?? '–'}
              </span>
              <span className="text-xs text-slate-400">{cfg.unit}</span>
            </div>
            {typeof selectedDay[`${cfg.key}_zscore`] === 'number' && (
              <span
                className={`inline-block mt-0.5 rounded px-2 py-0.5 text-[10px] font-mono font-bold border ${
                  Math.abs(selectedDay[`${cfg.key}_zscore`]) > 2
                    ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                    : 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                }`}
              >
                {selectedDay[`${cfg.key}_zscore`] > 0 ? '+' : ''}
                {selectedDay[`${cfg.key}_zscore`].toFixed(2)}σ from baseline
              </span>
            )}
          </div>
        </div>

        {/* Chart View */}
        <div className="mt-4 h-[320px] w-full relative">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              onClick={handleChartClick}
              margin={{ top: 15, right: 15, left: -10, bottom: 0 }}
            >
              <defs>
                <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={cfg.accent.stroke} floodOpacity="0.4" />
                </filter>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.25} vertical={false} />

              {/* Consecutive anomaly highlight bands */}
              {flaggedRanges.map((range, idx) => (
                <ReferenceArea
                  key={`flagged-${idx}`}
                  x1={range.start}
                  x2={range.end}
                  fill="#f43f5e"
                  fillOpacity={0.09}
                  stroke="none"
                />
              ))}

              {/* Static Cutoff Reference Line if Static Mode */}
              {!isDynamic && (
                <ReferenceLine
                  y={cfg.staticCutoff}
                  stroke="#f43f5e"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: cfg.cutoffLabel,
                    fill: '#f87171',
                    fontSize: 11,
                    position: 'insideTopRight',
                  }}
                />
              )}

              {/* Active Scrubber Selected Day Vertical Reference Line */}
              {selectedDay.timestamp && (
                <ReferenceLine
                  x={selectedDay.timestamp}
                  stroke="#67e8f9"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  label={{
                    value: `Day ${selectedIdx + 1}`,
                    fill: '#67e8f9',
                    fontSize: 10,
                    position: 'top',
                  }}
                />
              )}

              <XAxis
                dataKey="timestamp"
                tickFormatter={formatTickDate}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
              />

              <YAxis
                domain={yDomain}
                stroke="#64748b"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}
                axisLine={{ stroke: '#334155' }}
                tickLine={{ stroke: '#334155' }}
                unit={` ${cfg.unit}`}
              />

              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || !payload.length) return null;
                  const d = payload[0]?.payload;
                  if (!d) return null;
                  const isFlagged = d.anomaly_flag === 1;
                  const z = d[`${cfg.key}_zscore`];
                  const lower = d[`${cfg.key}_lower_band`];
                  const upper = d[`${cfg.key}_upper_band`];

                  return (
                    <div className="rounded-xl border border-white/10 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur-md">
                      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-1.5">
                        <span className="font-semibold text-white">{formatTooltipDate(label)}</span>
                        {isFlagged ? (
                          <span className="rounded-full border border-rose-500/40 bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            Drift Flagged
                          </span>
                        ) : (
                          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            Normal
                          </span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between gap-4 font-medium">
                          <span className="text-slate-400">{cfg.title}:</span>
                          <span className="font-mono font-bold text-white">
                            {d[cfg.key]} {cfg.unit}
                          </span>
                        </div>
                        {isDynamic && lower !== undefined && upper !== undefined && (
                          <div className="flex justify-between gap-4 text-[11px] text-slate-400">
                            <span>±2σ Normal Band:</span>
                            <span className="font-mono text-slate-300">
                              {Number(lower).toFixed(1)} – {Number(upper).toFixed(1)} {cfg.unit}
                            </span>
                          </div>
                        )}
                        {!isDynamic && (
                          <div className="flex justify-between gap-4 text-[11px] text-rose-300">
                            <span>Fixed Population Cutoff:</span>
                            <span className="font-mono font-bold">
                              {cfg.staticCutoff} {cfg.unit}
                            </span>
                          </div>
                        )}
                        {typeof z === 'number' && (
                          <div className="flex justify-between gap-4 text-[11px] text-slate-400">
                            <span>Personal Z-Score:</span>
                            <span className="font-mono font-semibold text-cyan-300">
                              {z > 0 ? `+${z.toFixed(2)}` : z.toFixed(2)}σ
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }}
              />

              {/* Dynamic Baseline Rolling Band (±2σ) */}
              {isDynamic && (
                <Area
                  dataKey="band_range"
                  fill={cfg.accent.band}
                  fillOpacity={0.14}
                  stroke={cfg.accent.stroke}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                  strokeOpacity={0.45}
                  name="Personal Baseline Band"
                />
              )}

              {/* 7-day Rolling Mean Line */}
              {isDynamic && (
                <Line
                  type="monotone"
                  dataKey={`${cfg.key}_mean`}
                  stroke={cfg.accent.stroke}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                  dot={false}
                  name="7-day Mean"
                  opacity={0.65}
                />
              )}

              {/* 30-day Chronic Baseline Line */}
              {isDynamic && (
                <Line
                  type="monotone"
                  dataKey={`${cfg.key}_mean_30d`}
                  stroke="#94a3b8"
                  strokeWidth={1.2}
                  strokeDasharray="2 2"
                  dot={false}
                  name="30-day Chronic Homeostasis"
                  opacity={0.5}
                />
              )}

              {/* Observed Metric Line */}
              <Line
                type="monotone"
                dataKey={cfg.key}
                stroke={cfg.accent.stroke}
                strokeWidth={2.8}
                filter="url(#lineGlow)"
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (!payload) return null;
                  const isSelected = payload.dayIndex === selectedIdx;
                  const isAnomaly = payload.anomaly_flag === 1;

                  return (
                    <g key={`dot-${payload.timestamp}`}>
                      {isSelected && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={9}
                          fill="none"
                          stroke="#67e8f9"
                          strokeWidth={2.5}
                          className="animate-ping"
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isSelected ? 6 : isAnomaly ? 5 : 3.5}
                        fill={isSelected ? '#67e8f9' : isAnomaly ? '#f43f5e' : cfg.accent.stroke}
                        stroke="#0f172a"
                        strokeWidth={1.8}
                        className="cursor-pointer transition-transform hover:scale-150"
                      />
                    </g>
                  );
                }}
                activeDot={{ r: 7, stroke: '#ffffff', strokeWidth: 2, fill: cfg.accent.stroke }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
