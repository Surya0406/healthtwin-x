import React from 'react';

// Backend sends green | amber | red; the UI palette is emerald | amber | rose.
const COLORS = {
  green: { hex: '#10b981', text: 'text-emerald-400', bar: 'bg-emerald-500', label: 'Healthy' },
  amber: { hex: '#f59e0b', text: 'text-amber-400', bar: 'bg-amber-500', label: 'Watch' },
  red: { hex: '#f43f5e', text: 'text-rose-400', bar: 'bg-rose-500', label: 'Alert' },
};
const colorOf = (c) => COLORS[c] ?? COLORS.green;

const STATUS_STYLE = {
  Optimal: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  'Strain Warning': 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  'Critical Drift': 'border-rose-500/40 bg-rose-500/10 text-rose-300',
};

const SCORE_CARDS = [
  { key: 'cardio_strain_index', label: 'Cardio strain', organ: 'heart' },
  { key: 'recovery_readiness', label: 'Recovery readiness', organ: 'brain_nervous' },
  { key: 'respiratory_stability', label: 'Respiratory stability', organ: 'respiratory' },
  { key: 'metabolic_stability', label: 'Metabolic stability', organ: 'metabolism' },
];

// Organ positions on a 200x420 body.
const ORGANS = {
  brain_nervous: { cx: 100, cy: 42, rx: 22, ry: 17, label: 'Brain' },
  respiratory: { cx: 100, cy: 135, rx: 36, ry: 26, label: 'Lungs' },
  heart: { cx: 104, cy: 140, rx: 11, ry: 12, label: 'Heart' },
  metabolism: { cx: 100, cy: 210, rx: 26, ry: 20, label: 'Metabolism' },
};

function Organ({ id, color }) {
  const o = ORGANS[id];
  const c = colorOf(color).hex;
  return (
    <g>
      <ellipse
        cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry}
        fill={c} fillOpacity={id === 'respiratory' ? 0.28 : 0.55}
        stroke={c} strokeWidth="2" filter="url(#glow)"
      >
        <animate attributeName="fill-opacity"
          values={id === 'respiratory' ? '0.2;0.4;0.2' : '0.4;0.8;0.4'} dur="2.6s" repeatCount="indefinite" />
      </ellipse>
      <title>{`${o.label}: ${colorOf(color).label}`}</title>
    </g>
  );
}

export default function TwinVisualizer({ twinState }) {
  if (!twinState) {
    return (
      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-400">
        Loading digital twin…
      </section>
    );
  }
  const { twin_status, scores = {}, organ_highlights = {} } = twinState;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-lg" aria-label="Digital twin">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Digital Twin</p>
          <h2 className="mt-1 text-lg font-semibold text-white">Organ status</h2>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_STYLE[twin_status] ?? STATUS_STYLE.Optimal}`}>
          {twin_status}
        </span>
      </div>

      <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
        <svg viewBox="0 0 200 420" className="mx-auto h-80 w-auto" role="img" aria-label="Human body with organ highlights">
          <defs>
            <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g fill="#0f172a" stroke="#475569" strokeWidth="2" strokeLinejoin="round">
            <circle cx="100" cy="42" r="30" />
            <rect x="90" y="70" width="20" height="16" />
            <path d="M62 90 Q100 78 138 90 L152 200 L146 250 L54 250 L48 200 Z" />
            <path d="M62 92 L34 190 L44 196 L68 120 Z" />
            <path d="M138 92 L166 190 L156 196 L132 120 Z" />
            <path d="M58 250 L76 400 L96 400 L100 262 L104 400 L124 400 L142 250 Z" />
          </g>
          {Object.keys(ORGANS).map((id) => (
            <Organ key={id} id={id} color={organ_highlights[id]} />
          ))}
        </svg>

        <div className="grid gap-3 self-center">
          {SCORE_CARDS.map(({ key, label, organ }) => {
            const value = Math.max(0, Math.min(100, Number(scores[key] ?? 0)));
            const c = colorOf(organ_highlights[organ]);
            return (
              <div key={key} className="rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-slate-300">{label}</span>
                  <span className={`font-semibold ${c.text}`}>{value}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700" role="progressbar"
                  aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                  <div className={`h-full rounded-full transition-all duration-500 ${c.bar}`} style={{ width: `${value}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
