import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
} from 'recharts';
import {
  Heart,
  Moon,
  Activity,
  CheckCircle,
  AlertTriangle,
  Siren,
  TrendingUp,
  TrendingDown,
  Minus,
  ShieldCheck,
  Zap,
} from 'lucide-react';

/**
 * Format timestamp 'YYYY-MM-DD' into 'Oct 12'
 */
const formatTickDate = (val) => {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${months[m] || parts[1]} ${d}`;
  }
  return val;
};

/**
 * Format full date for tooltip header
 */
const formatTooltipDate = (val) => {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length === 3) {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return `${months[m] || parts[1]} ${d}, ${parts[0]}`;
  }
  return val;
};

/**
 * Compute 4 to 5 evenly spaced tick timestamps for the X-axis
 */
const getXTicks = (data) => {
  if (!data || data.length === 0) return [];
  if (data.length <= 5) return data.map((d) => d.timestamp);
  const count = 5;
  const step = (data.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => data[Math.round(i * step)].timestamp);
};

/**
 * Compute Y-axis zoomed domain (never starting at 0, padded 10%)
 */
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

  if (min === Infinity || max === -Infinity) return ['auto', 'auto'];

  let range = max - min;
  if (range < minRange) {
    const mid = (max + min) / 2;
    min = mid - minRange / 2;
    max = mid + minRange / 2;
    range = minRange;
  }

  const pad = Math.max(range * 0.1, 0.5);
  const isDecimal = metricKey === 'sleep_hours';
  let dMin = min - pad;
  let dMax = max + pad;

  // Never start at 0: ensure dMin is strictly > 0
  if (dMin <= 0) {
    dMin = Math.max(0.5, min * 0.85);
  }

  if (isDecimal) {
    return [Math.floor(dMin * 10) / 10, Math.ceil(dMax * 10) / 10];
  }
  return [Math.floor(dMin), Math.ceil(dMax)];
};

/**
 * Extract contiguous stretches of flagged days for ReferenceArea
 */
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

/**
 * Custom SVG Anomaly Pulse Dot
 * Uses SVG-native <animate> on r (6 to 16) and opacity (0.6 to 0) with 1.8s duration.
 * Sits exactly on the line points at every window size.
 */
const renderAnomalyPulseDot = (prefersReducedMotion) => (props) => {
  const { cx, cy, payload } = props;
  if (typeof cx !== 'number' || typeof cy !== 'number' || isNaN(cx) || isNaN(cy)) return null;
  if (!payload || payload.anomaly_flag !== 1) return null;

  return (
    <g
      key={`pulse-dot-${payload.timestamp}-${cx}-${cy}`}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      {!prefersReducedMotion && (
        <circle
          cx={cx}
          cy={cy}
          r="6"
          fill="#f43f5e"
          fillOpacity="0.3"
          stroke="#f43f5e"
          strokeWidth="1.5"
          opacity="0.6"
        >
          <animate
            attributeName="r"
            from="6"
            to="16"
            dur="1.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            from="0.6"
            to="0"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      <circle
        cx={cx}
        cy={cy}
        r="4.5"
        fill="#f43f5e"
        stroke="#0f172a"
        strokeWidth="1.5"
      />
    </g>
  );
};

/**
 * Custom Dark Glassmorphism Tooltip
 */
const CustomDarkTooltip = ({ active, payload, label, unit, metricName, metricTitle }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const isAnomaly = data.anomaly_flag === 1;
  const val = data[metricName];
  const lower = data[`${metricName}_lower_band`];
  const upper = data[`${metricName}_upper_band`];
  const zscore = data[`${metricName}_zscore`];
  const score = data.anomaly_score ?? 0;

  // Determine z-score direction & color
  const zIsPositive = typeof zscore === 'number' && zscore > 0;
  const zAbs = typeof zscore === 'number' ? Math.abs(zscore) : 0;
  const zColor = zAbs > 2.0 ? 'text-rose-400' : zAbs > 1.0 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="bg-slate-900/95 border border-white/10 rounded-xl p-3.5 shadow-2xl backdrop-blur-xl text-xs text-slate-200 min-w-[230px]">
      {/* Date Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="font-semibold text-slate-300">{formatTooltipDate(label)}</span>
        {isAnomaly ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Anomaly
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Normal Band
          </span>
        )}
      </div>

      {/* Metric Content */}
      <div className="mt-2.5 space-y-2">
        <div className="flex justify-between items-baseline">
          <span className="text-slate-400 font-medium">{metricTitle}:</span>
          <span className="font-bold text-white text-sm font-mono">
            {typeof val === 'number' ? val.toFixed(1) : val} {unit}
          </span>
        </div>

        {lower !== undefined && upper !== undefined && (
          <div className="flex justify-between items-center text-slate-400">
            <span>Normal range:</span>
            <span className="text-slate-300 font-mono text-[11px]">
              {lower.toFixed(1)} – {upper.toFixed(1)} {unit}
            </span>
          </div>
        )}

        {typeof zscore === 'number' && (
          <div className="flex justify-between items-center text-slate-400">
            <span>Z-Score:</span>
            <span className={`font-mono font-semibold flex items-center gap-0.5 ${zColor}`}>
              {zIsPositive ? '↑' : '↓'} {zscore > 0 ? `+${zscore.toFixed(2)}` : zscore.toFixed(2)}σ
            </span>
          </div>
        )}

        {/* Flagged Tag */}
        {isAnomaly && (
          <div className="mt-2 pt-2 border-t border-rose-500/20 flex justify-between items-center bg-rose-500/10 -mx-3.5 -mb-3.5 p-2.5 rounded-b-xl">
            <span className="text-rose-300 font-semibold text-[11px] flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              Flagged by IForest
            </span>
            <span className="text-rose-200 font-mono font-bold text-xs">
              {score.toFixed(1)} / 100
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Semicircular SVG Anomaly Score Gauge (0 to 100)
 */
const SemicircleGauge = ({ score = 0 }) => {
  const clamped = Math.max(0, Math.min(100, score));
  // Semicircle radius R = 36, center = (48, 44), arc length = pi * 36 ≈ 113.1
  const R = 36;
  const arcLength = Math.PI * R;
  const strokeDashoffset = arcLength * (1 - clamped / 100);

  // Color selection
  let strokeColor = '#10b981'; // emerald
  let textColor = 'text-emerald-400';
  let glowColor = 'rgba(16, 185, 129, 0.4)';
  if (clamped >= 70) {
    strokeColor = '#f43f5e'; // rose
    textColor = 'text-rose-400';
    glowColor = 'rgba(244, 63, 94, 0.5)';
  } else if (clamped >= 40) {
    strokeColor = '#f59e0b'; // amber
    textColor = 'text-amber-400';
    glowColor = 'rgba(245, 158, 11, 0.4)';
  }

  return (
    <div className="relative flex flex-col items-center justify-center">
      <svg width="96" height="54" viewBox="0 0 96 54" className="overflow-visible">
        {/* Background Track */}
        <path
          d="M 12 46 A 36 36 0 0 1 84 46"
          fill="none"
          stroke="#1e293b"
          strokeWidth="7"
          strokeLinecap="round"
        />
        {/* Animated Filled Score Arc */}
        <path
          d="M 12 46 A 36 36 0 0 1 84 46"
          fill="none"
          stroke={strokeColor}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: 'stroke-dashoffset 0.9s ease-out, stroke 0.3s ease',
            filter: `drop-shadow(0 0 6px ${glowColor})`,
          }}
        />
      </svg>
      {/* Centered Score Readout */}
      <div className="absolute top-4 flex flex-col items-center pointer-events-none">
        <span className={`text-base font-extrabold font-mono leading-none ${textColor}`}>
          {clamped.toFixed(1)}
        </span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold mt-0.5">
          Score / 100
        </span>
      </div>
    </div>
  );
};

/**
 * Metric Card with ComposedChart, Zoomed Y-Domain, and Sparkline
 */
const VitalMetricCard = ({
  title,
  icon: Icon,
  metricKey,
  unit,
  accentColor,
  fillColor,
  days,
  prefersReducedMotion,
}) => {
  const yDomain = getYDomain(days, metricKey, metricKey === 'sleep_hours' ? 3 : 12);
  const xTicks = getXTicks(days);
  const flaggedRanges = getConsecutiveFlaggedRanges(days);

  // Recharts natively supports array range [lower, upper] for Area!
  // This avoids stackId which previously forced baseline to 0.
  const chartData = days.map((item) => {
    const lower = item[`${metricKey}_lower_band`] ?? item[metricKey] * 0.9;
    const upper = item[`${metricKey}_upper_band`] ?? item[metricKey] * 1.1;
    return {
      ...item,
      band_range: [lower, upper],
    };
  });

  const latest = days[days.length - 1] || {};
  const latestVal = latest[metricKey];
  const latestZ = latest[`${metricKey}_zscore`];

  // Delta chip direction & style
  const zAbs = typeof latestZ === 'number' ? Math.abs(latestZ) : 0;
  const chipColor =
    zAbs > 2.0
      ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
      : zAbs > 1.0
      ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
      : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';

  return (
    <div
      aria-label={`${title} physiological baseline chart`}
      className="bg-slate-900/60 border border-white/10 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col justify-between transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl border ${accentColor.bg} ${accentColor.border} ${accentColor.text}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-100 text-sm tracking-wide">{title}</h4>
            <span className="text-[11px] text-slate-400 block font-medium">Personal Baseline (±2σ)</span>
          </div>
        </div>

        {/* Current Value & Delta Chip */}
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-xl font-extrabold font-mono text-white">
              {typeof latestVal === 'number' ? latestVal.toFixed(1) : latestVal}
            </span>
            <span className="text-xs text-slate-400 font-medium">{unit}</span>
          </div>
          {typeof latestZ === 'number' && (
            <span className={`inline-block px-2 py-0.5 mt-1 rounded-md text-[10px] font-mono font-semibold border ${chipColor}`}>
              {latestZ > 0 ? `+${latestZ.toFixed(1)}` : latestZ.toFixed(1)}σ vs normal
            </span>
          )}
        </div>
      </div>

      {/* Main ComposedChart Canvas (min 240px) */}
      <div className="w-full h-[240px] mt-1 relative">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
          >
            <defs>
              {/* Subtle glow filter on observed line */}
              <filter id={`glow-${metricKey}`} x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={fillColor} floodOpacity="0.35" />
              </filter>
            </defs>

            {/* Faint Horizontal Grid Lines, Vertical Removed */}
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#334155"
              opacity={0.25}
              vertical={false}
            />

            {/* Consecutive Anomaly Highlight Bands (ReferenceArea behind lines) */}
            {flaggedRanges.map((range, idx) => (
              <ReferenceArea
                key={`ref-area-${idx}`}
                x1={range.start}
                x2={range.end}
                fill="#f43f5e"
                fillOpacity={0.08}
                stroke="none"
                ifOverflow="extendDomain"
              />
            ))}

            {/* X-Axis: 4-5 ticks only, formatted as 'Oct 12' */}
            <XAxis
              dataKey="timestamp"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              ticks={xTicks}
              tickFormatter={formatTickDate}
            />

            {/* Y-Axis: Strictly zoomed domain, never 0 */}
            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              domain={yDomain}
            />

            {/* Custom Dark Tooltip */}
            <Tooltip
              content={
                <CustomDarkTooltip
                  unit={unit}
                  metricName={metricKey}
                  metricTitle={title}
                />
              }
            />

            {/* Shaded Normal Band (Direct Range Area - No stackId, strictly preserves zoomed domain) */}
            <Area
              type="monotone"
              name="Normal range"
              dataKey="band_range"
              stroke="none"
              fill={fillColor}
              fillOpacity={0.18}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
            />

            {/* Thin dashed upper and lower edge boundaries */}
            <Line
              type="monotone"
              dataKey={`${metricKey}_lower_band`}
              stroke={fillColor}
              strokeDasharray="3 3"
              strokeWidth={1}
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
              legendType="none"
              tooltipType="none"
            />
            <Line
              type="monotone"
              dataKey={`${metricKey}_upper_band`}
              stroke={fillColor}
              strokeDasharray="3 3"
              strokeWidth={1}
              strokeOpacity={0.4}
              dot={false}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
              legendType="none"
              tooltipType="none"
            />

            {/* Value Line: 2.5px monotone with subtle glow & no normal markers */}
            <Line
              type="monotone"
              name="Observed"
              dataKey={metricKey}
              stroke={fillColor}
              strokeWidth={2.5}
              dot={false}
              activeDot={{
                r: 4.5,
                fill: '#0f172a',
                stroke: fillColor,
                strokeWidth: 2,
              }}
              style={{ filter: `url(#glow-${metricKey})` }}
              isAnimationActive={true}
              animationDuration={900}
              animationEasing="ease-out"
            />

            {/* Custom SVG Anomaly Pulse Scatter Dot (Sits precisely on line points) */}
            <Scatter
              dataKey={metricKey}
              shape={renderAnomalyPulseDot(prefersReducedMotion)}
              isAnimationActive={false}
              legendType="none"
              tooltipType="none"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mini Legend & Sparkline Footer */}
      <div className="pt-3 border-t border-slate-800/80 mt-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-2 rounded-xs inline-block"
              style={{ backgroundColor: fillColor, opacity: 0.25 }}
            ></span>
            <span>Normal range</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 inline-block" style={{ backgroundColor: fillColor }}></span>
            <span>Observed</span>
          </div>
        </div>

        {/* Tiny Sparkline of Anomaly Score */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-slate-400 font-mono">Drift Radar:</span>
          <svg width="48" height="14" className="overflow-visible">
            {(() => {
              const pts = days.map((d, i) => {
                const x = (i / Math.max(days.length - 1, 1)) * 48;
                const score = d.anomaly_score ?? 0;
                const y = 14 - (score / 100) * 12;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              });
              return (
                <polyline
                  fill="none"
                  stroke="#f43f5e"
                  strokeWidth="1.2"
                  points={pts.join(' ')}
                />
              );
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton shimmer cards for undefined / loading state
 */
const SkeletonLoader = () => (
  <div className="w-full space-y-5 animate-pulse" aria-busy="true" aria-label="Loading baseline telemetry">
    <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 h-24"></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-3 h-12"></div>
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-3 h-12"></div>
      <div className="bg-slate-900/40 border border-white/5 rounded-xl p-3 h-12"></div>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl h-80"></div>
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl h-80"></div>
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl h-80"></div>
    </div>
  </div>
);

/**
 * Clean Empty State Card
 */
const EmptyState = () => (
  <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-12 text-center text-slate-400 shadow-2xl backdrop-blur-md">
    <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-slate-800/70 border border-slate-700/60 flex items-center justify-center text-slate-400">
      <ShieldCheck className="w-7 h-7 text-cyan-400 opacity-80" />
    </div>
    <h3 className="text-base font-semibold text-slate-200">No monitoring data yet</h3>
    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
      Select an active patient or start telemetry ingestion to generate personal baseline reference bands and unsupervised anomaly scoring.
    </p>
  </div>
);

/**
 * Main BaselineCharts Component
 * Accepts `days` array and renders three multivariate baseline charts.
 */
export default function BaselineCharts({ days }) {
  // Respect prefers-reduced-motion
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
      const handler = (e) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  // Loading state (days is undefined)
  if (days === undefined) {
    return <SkeletonLoader />;
  }

  // Empty state (days is an empty array)
  if (!Array.isArray(days) || days.length === 0) {
    return <EmptyState />;
  }

  // Latest day & stats
  const latestDay = days[days.length - 1] || {};
  const anomalyScore = latestDay.anomaly_score ?? 0;
  const severityLabel =
    latestDay.severity_label ||
    (anomalyScore >= 70
      ? 'Critical Multivariate Anomaly'
      : anomalyScore >= 40
      ? 'Moderate Pattern Drift'
      : 'Normal');

  // Badge configuration with gentle glow
  const getBadgeConfig = (label) => {
    switch (label) {
      case 'Critical Multivariate Anomaly':
        return {
          bg: 'bg-rose-500/15 border-rose-500/40 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.3)]',
          dot: 'bg-rose-500',
          icon: Siren,
        };
      case 'Moderate Pattern Drift':
        return {
          bg: 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.25)]',
          dot: 'bg-amber-500',
          icon: AlertTriangle,
        };
      case 'Normal':
      default:
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]',
          dot: 'bg-emerald-500',
          icon: CheckCircle,
        };
    }
  };

  const badge = getBadgeConfig(severityLabel);
  const BadgeIcon = badge.icon;

  // Stat chips metrics
  const flaggedDaysCount = days.filter((d) => d.anomaly_flag === 1).length;
  const peakScore = Math.max(...days.map((d) => d.anomaly_score ?? 0), 0);

  // Trend from last 5 scores
  const last5 = days.slice(-5);
  const firstScore = last5[0]?.anomaly_score ?? 0;
  const lastScore = last5[last5.length - 1]?.anomaly_score ?? 0;
  const scoreDiff = lastScore - firstScore;

  let trendLabel = 'Stable';
  let TrendIcon = Minus;
  let trendColor = 'text-slate-400';

  if (scoreDiff > 3.0) {
    trendLabel = 'Rising';
    TrendIcon = TrendingUp;
    trendColor = 'text-rose-400';
  } else if (scoreDiff < -3.0) {
    trendLabel = 'Falling';
    TrendIcon = TrendingDown;
    trendColor = 'text-emerald-400';
  }

  return (
    <div className="w-full space-y-5">
      {/* Header Card */}
      <div className="bg-slate-900/60 border border-white/10 rounded-2xl p-5 md:p-6 shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-5 transition-all duration-200 hover:border-white/15">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="text-lg md:text-xl font-bold text-white tracking-tight">
              Personalized Baseline & Anomaly Radar
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium bg-slate-800/80 text-slate-300 border border-slate-700/60">
              {days.length}-Day Rolling
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
            PyOD Isolation Forest scoring individual physiological drift against calibrated reference normal bands (±2σ).
          </p>
        </div>

        {/* Right Section: Semicircular Gauge & Severity Badge */}
        <div className="flex items-center gap-4 self-start md:self-auto shrink-0">
          {/* Animated Semicircular Arc Gauge */}
          <SemicircleGauge score={anomalyScore} />

          {/* Severity Badge */}
          <div
            role="status"
            className={`px-3.5 py-2.5 rounded-xl border flex items-center gap-2.5 font-semibold text-xs tracking-wide transition-all duration-300 ${badge.bg}`}
          >
            <BadgeIcon className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">{severityLabel}</span>
          </div>
        </div>
      </div>

      {/* Summary Row of Three Stat Chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Chip 1: Flagged Days */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                flaggedDaysCount > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'
              }`}
            ></span>
            <span className="text-xs text-slate-400 font-medium">Flagged Days</span>
          </div>
          <span className="text-sm font-bold font-mono text-white">
            {flaggedDaysCount} <span className="text-xs text-slate-400 font-normal">of {days.length}</span>
          </span>
        </div>

        {/* Chip 2: Peak Score */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-slate-400 font-medium">Peak Score</span>
          </div>
          <span className="text-sm font-bold font-mono text-slate-200">
            {peakScore.toFixed(1)} <span className="text-xs text-slate-400 font-normal">/ 100</span>
          </span>
        </div>

        {/* Chip 3: Anomaly Trend */}
        <div className="bg-slate-900/60 border border-white/10 rounded-xl px-4 py-2.5 flex items-center justify-between shadow-md backdrop-blur-md">
          <div className="flex items-center gap-2">
            <TrendIcon className={`w-4 h-4 ${trendColor}`} />
            <span className="text-xs text-slate-400 font-medium">5-Day Trend</span>
          </div>
          <span className={`text-sm font-bold font-mono flex items-center gap-1 ${trendColor}`}>
            {trendLabel}
          </span>
        </div>
      </div>

      {/* Grid of 3 Vital ComposedCharts (3 cols on lg, 1 col on mobile) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Heart Rate */}
        <VitalMetricCard
          title="Heart Rate"
          icon={Heart}
          metricKey="heart_rate"
          unit="bpm"
          accentColor={{
            bg: 'bg-rose-500/10',
            border: 'border-rose-500/20',
            text: 'text-rose-400',
          }}
          fillColor="#f43f5e"
          days={days}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* 2. Sleep Hours */}
        <VitalMetricCard
          title="Sleep Rest"
          icon={Moon}
          metricKey="sleep_hours"
          unit="hrs"
          accentColor={{
            bg: 'bg-indigo-500/10',
            border: 'border-indigo-500/20',
            text: 'text-indigo-400',
          }}
          fillColor="#6366f1"
          days={days}
          prefersReducedMotion={prefersReducedMotion}
        />

        {/* 3. Systolic Blood Pressure */}
        <VitalMetricCard
          title="Systolic BP"
          icon={Activity}
          metricKey="systolic_bp"
          unit="mmHg"
          accentColor={{
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            text: 'text-amber-400',
          }}
          fillColor="#f59e0b"
          days={days}
          prefersReducedMotion={prefersReducedMotion}
        />
      </div>
    </div>
  );
}
