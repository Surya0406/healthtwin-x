import React, { useMemo } from 'react';

// Backend sends green | amber | red; the UI palette is emerald | amber | rose.
const COLORS = {
  green: { hex: '#34d399', text: 'text-emerald-400', bar: 'bg-emerald-400', word: 'Steady' },
  amber: { hex: '#fbbf24', text: 'text-amber-400', bar: 'bg-amber-400', word: 'Watch' },
  red: { hex: '#fb7185', text: 'text-rose-400', bar: 'bg-rose-400', word: 'Alert' },
};
const colorOf = (c) => COLORS[c] ?? COLORS.green;

const STATUS = {
  Optimal: { chip: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300', trace: '#34d399', speed: 6 },
  'Strain Warning': { chip: 'border-amber-400/40 bg-amber-400/10 text-amber-300', trace: '#fbbf24', speed: 4.2 },
  'Critical Drift': { chip: 'border-rose-400/40 bg-rose-400/10 text-rose-300', trace: '#fb7185', speed: 3 },
};

const SCORE_CARDS = [
  { key: 'cardio_strain_index', label: 'Cardio strain', hint: 'Heart load', organ: 'heart' },
  { key: 'recovery_readiness', label: 'Recovery', hint: 'Sleep and stress', organ: 'brain_nervous' },
  { key: 'respiratory_stability', label: 'Respiratory', hint: 'Oxygen saturation', organ: 'respiratory' },
  { key: 'metabolic_stability', label: 'Metabolic', hint: 'Activity and sleep', organ: 'metabolism' },
];

// Organ geometry on a 220x430 canvas, plus where each label sits.
const ORGANS = {
  brain_nervous: { cx: 110, cy: 46, rx: 23, ry: 18, label: 'Brain', side: 'right' },
  respiratory: { cx: 110, cy: 146, rx: 40, ry: 28, label: 'Lungs', side: 'left' },
  heart: { cx: 115, cy: 152, rx: 11, ry: 12, label: 'Heart', side: 'right' },
  metabolism: { cx: 110, cy: 226, rx: 28, ry: 21, label: 'Metabolism', side: 'left' },
};

// Beat offsets inside one 300-unit period. Even spacing = steady rhythm; uneven = irregular.
const RHYTHM = {
  Optimal: [30, 130, 230],
  'Strain Warning': [24, 94, 164, 234],
  'Critical Drift': [20, 64, 142, 178, 262],
};

function beatPath(x) {
  // P wave, QRS spike, T wave around a flat baseline at y=30.
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
    <div className="mt-auto flex items-center gap-4 rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3">
      <div className="min-w-[4.5rem]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Pulse</p>
        <p className="num text-xl font-semibold text-white">
          {bpm ? Math.round(bpm) : '–'}
          <span className="ml-1 text-[11px] font-normal text-slate-400">bpm</span>
        </p>
      </div>
      <div className="relative h-[60px] flex-1 overflow-hidden" aria-hidden="true">
        <div className="ecg-run absolute inset-y-0 left-0 w-[200%]" style={{ '--ecg-speed': `${conf.speed}s` }}>
          <svg viewBox="0 0 600 60" preserveAspectRatio="none" className="h-full w-full">
            <path d={d} fill="none" stroke={conf.trace} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
              style={{ filter: `drop-shadow(0 0 4px ${conf.trace})` }} />
          </svg>
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-slate-950 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-slate-950 to-transparent" />
      </div>
    </div>
  );
}

function Organ({ id, color }) {
  const o = ORGANS[id];
  const c = colorOf(color).hex;
  const isLung = id === 'respiratory';
  return (
    <ellipse
      cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry}
      fill={c} fillOpacity={isLung ? 0.22 : 0.6}
      stroke={c} strokeWidth="1.5" filter="url(#glow)"
    >
      <animate attributeName="fill-opacity"
        values={isLung ? '0.14;0.3;0.14' : '0.42;0.85;0.42'} dur="3s" repeatCount="indefinite" />
      <title>{`${o.label}: ${colorOf(color).word}`}</title>
    </ellipse>
  );
}

function OrganLabel({ id, color }) {
  const o = ORGANS[id];
  const c = colorOf(color);
  const left = o.side === 'left';
  const x1 = left ? o.cx - o.rx - 2 : o.cx + o.rx + 2;
  const x2 = left ? 22 : 198;
  const y = o.cy + (id === 'heart' ? 22 : 0);
  return (
    <g>
      <path d={`M${x1},${o.cy} L${left ? x1 - 10 : x1 + 10},${y} L${x2},${y}`} stroke={c.hex} strokeOpacity="0.55" strokeWidth="1" fill="none" />
      <circle cx={x2} cy={y} r="2.5" fill={c.hex} />
    </g>
  );
}

export default function TwinVisualizer({ twinState, heartRate }) {
  if (!twinState) {
    return (
      <section className="rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6" aria-busy="true" aria-label="Loading digital twin">
        <div className="skeleton h-5 w-40" />
        <div className="mt-6 grid gap-5 sm:grid-cols-[220px_1fr]">
          <div className="skeleton h-72" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28" />)}
          </div>
        </div>
      </section>
    );
  }
  const { twin_status, scores = {}, organ_highlights = {} } = twinState;
  const status = STATUS[twin_status] ?? STATUS.Optimal;

  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-700/70 bg-slate-900/80 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]" aria-label="Digital twin">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">Digital twin</p>
          <h2 className="mt-1 text-xl font-semibold text-white">How the body is holding up</h2>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${status.chip}`}>{twin_status}</span>
      </div>

      <div className="mt-5 grid gap-6 sm:grid-cols-[230px_1fr]">
        <svg viewBox="0 0 220 430" className="mx-auto h-[22rem] w-auto" role="img" aria-label="Body outline with organ status">
          <defs>
            <filter id="glow" x="-70%" y="-70%" width="240%" height="240%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#13202f" /><stop offset="1" stopColor="#0b1420" />
            </linearGradient>
          </defs>
          <g fill="url(#body)" stroke="#3b4d63" strokeWidth="1.6" strokeLinejoin="round">
            <circle cx="110" cy="46" r="31" />
            <rect x="99" y="76" width="22" height="16" rx="3" />
            <path d="M70 96 Q110 82 150 96 L162 212 L156 262 L64 262 L58 212 Z" />
            <path d="M70 98 L40 200 L51 207 L76 128 Z" />
            <path d="M150 98 L180 200 L169 207 L144 128 Z" />
            <path d="M66 262 L84 416 L106 416 L110 276 L114 416 L136 416 L154 262 Z" />
          </g>
          {Object.keys(ORGANS).map((id) => <OrganLabel key={`l-${id}`} id={id} color={organ_highlights[id]} />)}
          {Object.keys(ORGANS).map((id) => <Organ key={id} id={id} color={organ_highlights[id]} />)}
        </svg>

        <div className="grid grid-cols-2 gap-3 self-start">
          {SCORE_CARDS.map(({ key, label, hint, organ }) => {
            const value = Math.max(0, Math.min(100, Number(scores[key] ?? 0)));
            const c = colorOf(organ_highlights[organ]);
            return (
              <div key={key} className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-4">
                <span className="block truncate text-xs font-medium text-slate-300">{label}</span>
                <p className={`num mt-2 flex items-baseline gap-2 text-4xl font-semibold leading-none ${c.text}`}>
                  {value}
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{c.word}</span>
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800" role="progressbar"
                  aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
                  <div className={`h-full rounded-full transition-all duration-700 ${c.bar}`} style={{ width: `${value}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">{hint}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-5 flex flex-1 flex-col justify-end"><EcgTrace status={twin_status} bpm={heartRate} /></div>
    </section>
  );
}
