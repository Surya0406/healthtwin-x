import React, { useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Dna,
  Heart,
  Sparkles,
  Zap,
} from 'lucide-react';

const COLORS = {
  green: { hex: '#34d399', text: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', bar: 'bg-emerald-400', word: 'Optimal' },
  amber: { hex: '#fbbf24', text: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-500/10', bar: 'bg-amber-400', word: 'Watch' },
  red: { hex: '#fb7185', text: 'text-rose-400', border: 'border-rose-500/40', bg: 'bg-rose-500/10', bar: 'bg-rose-400', word: 'Alert' },
};
const colorOf = (c) => COLORS[c] ?? COLORS.green;

const STATUS = {
  Optimal: { chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', trace: '#34d399', speed: 6 },
  'Strain Warning': { chip: 'border-amber-400/40 bg-amber-400/10 text-amber-300', trace: '#fbbf24', speed: 4.2 },
  'Critical Drift': { chip: 'border-rose-400/40 bg-rose-400/10 text-rose-300', trace: '#fb7185', speed: 3 },
};

export const ORGANS = {
  heart: {
    id: 'heart',
    label: 'Heart & Cardiovascular',
    shortLabel: 'Heart',
    vitalKey: 'heart_rate',
    secondaryKey: 'systolic_bp',
    scoreKey: 'cardio_strain_index',
    cx: 115,
    cy: 152,
    rx: 13,
    ry: 14,
    side: 'right',
    description: 'Tracks myocardial workload, resting heart rate spikes, and arterial pressure strain.',
  },
  brain_nervous: {
    id: 'brain_nervous',
    label: 'Brain & Nervous System',
    shortLabel: 'Brain',
    vitalKey: 'stress_index',
    secondaryKey: 'sleep_hours',
    scoreKey: 'recovery_readiness',
    cx: 110,
    cy: 46,
    rx: 23,
    ry: 18,
    side: 'right',
    description: 'Reflects sympathetic autonomic stress, neuro-recovery, and sleep architecture.',
  },
  respiratory: {
    id: 'respiratory',
    label: 'Lungs & Respiratory',
    shortLabel: 'Lungs',
    vitalKey: 'spo2',
    secondaryKey: 'heart_rate',
    scoreKey: 'respiratory_stability',
    cx: 110,
    cy: 146,
    rx: 40,
    ry: 28,
    side: 'left',
    description: 'Monitors peripheral capillary oxygen saturation (SpO₂) and gas exchange efficiency.',
  },
  metabolism: {
    id: 'metabolism',
    label: 'Metabolism & Endocrine',
    shortLabel: 'Metabolism',
    vitalKey: 'daily_steps',
    secondaryKey: 'sleep_hours',
    scoreKey: 'metabolic_stability',
    cx: 110,
    cy: 226,
    rx: 28,
    ry: 21,
    side: 'left',
    description: 'Models energy expenditure, somatic activity burn, and circadian metabolic rhythms.',
  },
};

const SCORE_CARDS = [
  { key: 'cardio_strain_index', label: 'Cardio strain', hint: 'Heart load', organ: 'heart' },
  { key: 'recovery_readiness', label: 'Recovery', hint: 'Sleep & stress', organ: 'brain_nervous' },
  { key: 'respiratory_stability', label: 'Respiratory', hint: 'Oxygen saturation', organ: 'respiratory' },
  { key: 'metabolic_stability', label: 'Metabolic', hint: 'Activity & burn', organ: 'metabolism' },
];

const RHYTHM = {
  Optimal: [30, 130, 230],
  'Strain Warning': [24, 94, 164, 234],
  'Critical Drift': [20, 64, 142, 178, 262],
};

function beatPath(x) {
  return `L${x - 14},30 L${x - 10},26 L${x - 6},30 L${x - 2},30 L${x},34 L${x + 3},4 L${x + 6},42 L${x + 8},30 L${x + 16},30 L${x + 22},23 L${x + 28},30`;
}

function EcgTrace({ status, bpm }) {
  const conf = STATUS[status] ?? STATUS.Optimal;
  const beats = RHYTHM[status] ?? RHYTHM.Optimal;
  const d = useMemo(() => {
    let p = 'M0,30';
    [0, 300].forEach((off) => beats.forEach((b) => { p += ' ' + beatPath(b + off); }));
    return p + ' L600,30';
  }, [beats]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-700/70 bg-slate-950/70 px-3.5 py-2">
      <div className="min-w-[4rem]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Pulse</p>
        <p className="num text-lg font-bold text-white">
          {bpm ? Math.round(bpm) : '–'}
          <span className="ml-1 text-[10px] font-normal text-slate-400">bpm</span>
        </p>
      </div>
      <div className="relative h-[44px] flex-1 overflow-hidden" aria-hidden="true">
        <div className="ecg-run absolute inset-y-0 left-0 w-[200%]" style={{ '--ecg-speed': `${conf.speed}s` }}>
          <svg viewBox="0 0 600 60" preserveAspectRatio="none" className="h-full w-full">
            <path
              d={d}
              fill="none"
              stroke={conf.trace}
              strokeWidth="1.8"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 4px ${conf.trace})` }}
            />
          </svg>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-slate-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-slate-950 to-transparent" />
      </div>
    </div>
  );
}

export default function TwinVisualizer({
  twinState,
  heartRate,
  selectedOrgan = 'heart',
  onSelectOrgan,
  onInspectVital,
  isSimulated = false,
  timeTravelLabel = null,
  onResetTimeTravel,
  currentVitals = null,
}) {
  if (!twinState) {
    return (
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-5" aria-busy="true" aria-label="Loading digital twin">
        <div className="skeleton h-5 w-40" />
        <div className="mt-5 space-y-4">
          <div className="skeleton h-64" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-20" />)}
          </div>
        </div>
      </section>
    );
  }

  const { twin_status = 'Optimal', scores = {}, organ_highlights = {}, biological_age = null } = twinState;
  const status = STATUS[twin_status] ?? STATUS.Optimal;
  const activeOrganDef = ORGANS[selectedOrgan] || ORGANS.heart;
  const activeOrganColor = colorOf(organ_highlights[activeOrganDef.id]);

  const chronoAge = biological_age?.chronological_age ?? 40;
  const bioAge = biological_age?.biological_age ?? chronoAge;
  const ageDelta = biological_age?.age_delta_years ?? 0;
  const isYounger = ageDelta < 0;

  return (
    <section
      className="flex flex-col rounded-2xl border border-slate-700/80 bg-slate-900/95 p-4 sm:p-5 shadow-[0_20px_50px_-25px_rgba(0,0,0,0.85)] relative space-y-4"
      aria-label="Digital twin command card"
    >
      {/* Simulation / Time Travel Banners */}
      {isSimulated && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-200">
          <div className="flex items-center gap-1.5 font-medium">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300 animate-spin" style={{ animationDuration: '4s' }} />
            <span>Simulated Body Healing Preview</span>
          </div>
          <span className="text-[10px] uppercase font-bold tracking-wider text-cyan-300">Live What-If</span>
        </div>
      )}

      {timeTravelLabel && !isSimulated && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
          <span className="font-medium">⏱ Historical Snapshot: {timeTravelLabel}</span>
          {onResetTimeTravel && (
            <button
              type="button"
              onClick={onResetTimeTravel}
              className="text-[11px] font-semibold underline hover:text-white"
            >
              Jump to Live ➜
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-300">Digital Twin Core</p>
          </div>
          <h2 className="mt-0.5 text-base font-bold text-white">Physiological Mesh</h2>
          <p className="text-[11px] text-slate-400">Click organs to inspect telemetry</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${status.chip}`}>
          {twin_status}
        </span>
      </div>

      {/* Biological Twin Age vs Chronological Age Card */}
      <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <Dna className="h-4 w-4 text-cyan-400" />
            <span>Biological Twin Age</span>
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isYounger
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : ageDelta > 1.5
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
            }`}
          >
            {isYounger ? `${Math.abs(ageDelta).toFixed(1)} yrs Rejuvenated` : `+${ageDelta.toFixed(1)} yrs Aging Drift`}
          </span>
        </div>

        <div className="flex items-baseline justify-between border-t border-slate-800/60 pt-2 font-mono">
          <div>
            <span className="text-[10px] text-slate-400 block font-sans">Chronological</span>
            <span className="text-lg font-bold text-slate-300">{chronoAge} yrs</span>
          </div>
          <div className="text-center font-sans text-xs text-slate-500">➜</div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-sans">Biological Twin</span>
            <span className={`text-2xl font-black ${isYounger ? 'text-emerald-400' : 'text-rose-400'}`}>
              {bioAge} <span className="text-xs font-normal text-slate-400 font-sans">yrs</span>
            </span>
          </div>
        </div>

        {/* Aging Factors Breakdown */}
        {biological_age?.aging_factors && (
          <div className="space-y-1.5 border-t border-slate-800/60 pt-2 text-[10px]">
            {biological_age.aging_factors.slice(0, 3).map((f, i) => (
              <div key={i} className="flex justify-between items-center text-slate-400">
                <span className="truncate max-w-[140px]">{f.factor}:</span>
                <span className={`font-mono font-bold ${f.impact_years > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                  {f.impact_years > 0 ? '+' : ''}{f.impact_years}y
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Body Outline & Score Cards */}
      <div className="grid gap-3 sm:grid-cols-[170px_1fr] items-center">
        {/* SVG Human Canvas */}
        <div className="relative mx-auto flex flex-col items-center">
          <svg
            viewBox="0 0 220 430"
            className="h-[16.5rem] w-auto drop-shadow-md select-none"
            role="img"
            aria-label="Clickable Human Body Visualizer"
          >
            <defs>
              <filter id="glow" x="-70%" y="-70%" width="240%" height="240%">
                <feGaussianBlur stdDeviation="5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="selectionGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="7" result="glow" />
                <feMerge>
                  <feMergeNode in="glow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#13202f" />
                <stop offset="1" stopColor="#0b1420" />
              </linearGradient>
            </defs>

            {/* Silhouette */}
            <g fill="url(#body)" stroke="#3b4d63" strokeWidth="1.6" strokeLinejoin="round">
              <circle cx="110" cy="46" r="31" />
              <rect x="99" y="76" width="22" height="16" rx="3" />
              <path d="M70 96 Q110 82 150 96 L162 212 L156 262 L64 262 L58 212 Z" />
              <path d="M70 98 L40 200 L51 207 L76 128 Z" />
              <path d="M150 98 L180 200 L169 207 L144 128 Z" />
              <path d="M66 262 L84 416 L106 416 L110 276 L114 416 L136 416 L154 262 Z" />
            </g>

            {/* Organ Connectors & Labels */}
            {Object.values(ORGANS).map((o) => {
              const c = colorOf(organ_highlights[o.id]);
              const left = o.side === 'left';
              const x1 = left ? o.cx - o.rx - 2 : o.cx + o.rx + 2;
              const x2 = left ? 20 : 200;
              const y = o.cy + (o.id === 'heart' ? 18 : 0);
              const isSelected = selectedOrgan === o.id;

              return (
                <g key={`label-${o.id}`} className="cursor-pointer" onClick={() => onSelectOrgan?.(o.id)}>
                  <path
                    d={`M${x1},${o.cy} L${left ? x1 - 8 : x1 + 8},${y} L${x2},${y}`}
                    stroke={isSelected ? '#67e8f9' : c.hex}
                    strokeOpacity={isSelected ? 0.9 : 0.45}
                    strokeWidth={isSelected ? 1.5 : 1}
                    fill="none"
                  />
                  <circle cx={x2} cy={y} r={isSelected ? 3.5 : 2.5} fill={isSelected ? '#67e8f9' : c.hex} />
                </g>
              );
            })}

            {/* Clickable Organ Nodes */}
            {Object.values(ORGANS).map((o) => {
              const c = colorOf(organ_highlights[o.id]);
              const isSelected = selectedOrgan === o.id;
              const isLung = o.id === 'respiratory';

              return (
                <g
                  key={o.id}
                  className="cursor-pointer transition-transform hover:scale-105"
                  onClick={() => onSelectOrgan?.(o.id)}
                  role="button"
                  tabIndex={0}
                  aria-label={`${o.label} status: ${c.word}`}
                >
                  {isSelected && (
                    <ellipse
                      cx={o.cx} cy={o.cy} rx={o.rx + 6} ry={o.ry + 6}
                      fill="none" stroke="#67e8f9" strokeWidth="2" strokeDasharray="4 2"
                      filter="url(#selectionGlow)" className="animate-pulse"
                    />
                  )}
                  <ellipse
                    cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry}
                    fill={c.hex} fillOpacity={isLung ? 0.28 : isSelected ? 0.75 : 0.6}
                    stroke={isSelected ? '#ffffff' : c.hex} strokeWidth={isSelected ? 2.2 : 1.5}
                    filter="url(#glow)"
                  >
                    <animate attributeName="fill-opacity" values={isLung ? '0.18;0.36;0.18' : '0.45;0.85;0.45'} dur="2.5s" repeatCount="indefinite" />
                  </ellipse>
                </g>
              );
            })}
          </svg>
          <p className="mt-1 text-[10px] text-slate-500 text-center">Interactive 4-Zone Twin</p>
        </div>

        {/* Subsystem Score Mini-Cards */}
        <div className="grid grid-cols-2 gap-2">
          {SCORE_CARDS.map(({ key, label, organ }) => {
            const value = Math.max(0, Math.min(100, Number(scores[key] ?? 0)));
            const c = colorOf(organ_highlights[organ]);
            const isSelected = selectedOrgan === organ;

            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelectOrgan?.(organ)}
                className={`rounded-xl border p-2.5 text-left transition-all ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-950/40 ring-1 ring-cyan-400/50'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-[10px] font-bold text-slate-300">{label}</span>
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />}
                </div>
                <p className={`num mt-1 flex items-baseline gap-1 text-xl font-bold leading-none ${c.text}`}>
                  {value}
                  <span className="text-[9px] font-medium uppercase tracking-wider">{c.word}</span>
                </p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${value}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Organ Breakdown Card */}
      <div className={`rounded-xl border p-3 transition-all ${activeOrganColor.border} ${activeOrganColor.bg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`p-1.5 rounded-lg border ${activeOrganColor.border} bg-slate-900/80`}>
              <Activity className={`h-4 w-4 ${activeOrganColor.text}`} />
            </span>
            <div>
              <p className="text-xs font-bold text-white">{activeOrganDef.label}</p>
              <p className="text-[11px] text-slate-300 leading-tight">{activeOrganDef.description}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${activeOrganColor.text} bg-slate-950/70`}>
            {activeOrganColor.word}
          </span>
        </div>

        {currentVitals && (
          <div className="mt-2.5 flex flex-wrap gap-2 text-[11px] border-t border-slate-700/50 pt-2">
            <span className="text-slate-400">
              Primary: <strong className="text-white capitalize">{activeOrganDef.vitalKey.replace('_', ' ')}</strong> (
              <span className="text-cyan-300 num">{currentVitals[activeOrganDef.vitalKey] ?? '–'}</span>)
            </span>
            {activeOrganDef.secondaryKey && (
              <span className="text-slate-400">
                Secondary: <strong className="text-white capitalize">{activeOrganDef.secondaryKey.replace('_', ' ')}</strong> (
                <span className="text-cyan-300 num">{currentVitals[activeOrganDef.secondaryKey] ?? '–'}</span>)
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => onInspectVital?.(activeOrganDef.vitalKey)}
          className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-lg border border-cyan-400/30 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-900/50 hover:text-white"
        >
          <span>Inspect {activeOrganDef.shortLabel} in Baseline Charts</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Pulse & Animated ECG Trace */}
      <div>
        <EcgTrace status={twin_status} bpm={heartRate} />
      </div>
    </section>
  );
}
