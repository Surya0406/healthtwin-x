import React from 'react';
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
  Legend,
} from 'recharts';
import {
  Activity,
  Heart,
  Moon,
  AlertTriangle,
  ShieldCheck,
  Zap,
} from 'lucide-react';

/**
 * Pulsing red marker for anomalous readings
 */
const PulsingAnomalyDot = (props) => {
  const { cx, cy } = props;
  if (!cx || !cy) return null;
  return (
    <g className="anomaly-pulse-group cursor-pointer">
      <circle cx={cx} cy={cy} r={10} fill="rgba(244, 63, 94, 0.3)" className="animate-ping" />
      <circle cx={cx} cy={cy} r={7} fill="rgba(244, 63, 94, 0.45)" />
      <circle cx={cx} cy={cy} r={4} fill="#f43f5e" stroke="#ffffff" strokeWidth={1.5} />
    </g>
  );
};

/**
 * Custom dark glassmorphic tooltip
 */
const DarkTooltip = ({ active, payload, label, unit, metricName }) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const isAnomaly = data.anomaly_flag === 1;

  return (
    <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs text-slate-200 min-w-[210px]">
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <span className="font-semibold text-slate-300">{label}</span>
        {isAnomaly ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Anomaly Flag
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            Normal Band
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">{metricName}:</span>
          <span className="font-bold text-white text-sm">
            {data[metricName]?.toFixed?.(1) ?? data[metricName]} {unit}
          </span>
        </div>

        {data[`${metricName}_mean`] !== undefined && (
          <div className="flex justify-between text-slate-400">
            <span>Baseline Mean:</span>
            <span className="text-slate-300 font-mono">
              {data[`${metricName}_mean`]?.toFixed(1)} {unit}
            </span>
          </div>
        )}

        {data[`${metricName}_lower_band`] !== undefined && data[`${metricName}_upper_band`] !== undefined && (
          <div className="flex justify-between text-slate-400">
            <span>Normal Range:</span>
            <span className="text-slate-300 font-mono">
              {data[`${metricName}_lower_band`]?.toFixed(1)} - {data[`${metricName}_upper_band`]?.toFixed(1)}
            </span>
          </div>
        )}

        {data[`${metricName}_zscore`] !== undefined && (
          <div className="flex justify-between text-slate-400">
            <span>Z-Score:</span>
            <span className={`font-mono font-medium ${Math.abs(data[`${metricName}_zscore`]) > 2 ? 'text-amber-400' : 'text-slate-300'}`}>
              {data[`${metricName}_zscore`]?.toFixed(2)}σ
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-slate-400">
          <span>Anomaly Score:</span>
          <span className={`font-semibold font-mono ${data.anomaly_score >= 70 ? 'text-rose-400' : data.anomaly_score >= 40 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {data.anomaly_score?.toFixed(1)} / 100
          </span>
        </div>
      </div>
    </div>
  );
};

/**
 * Individual vital chart component
 */
const VitalChartCard = ({
  title,
  icon: Icon,
  metricKey,
  unit,
  accentColor,
  fillColor,
  data,
}) => {
  // Format data with stacked area trick: lower_band + band_width (upper - lower)
  const chartData = (data || []).map((item) => {
    const lower = item[`${metricKey}_lower_band`] ?? (item[metricKey] ? item[metricKey] * 0.9 : 0);
    const upper = item[`${metricKey}_upper_band`] ?? (item[metricKey] ? item[metricKey] * 1.1 : 10);
    const width = Math.max(0, upper - lower);

    return {
      ...item,
      chart_lower: lower,
      chart_width: width,
      // Scatter points only on anomaly days
      anomaly_val: item.anomaly_flag === 1 ? item[metricKey] : null,
    };
  });

  const latest = data[data.length - 1] || {};
  const latestVal = latest[metricKey];
  const latestMean = latest[`${metricKey}_mean`];
  const latestZ = latest[`${metricKey}_zscore`];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md flex flex-col justify-between">
      {/* Card Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl bg-${accentColor}-500/10 border border-${accentColor}-500/20 text-${accentColor}-400`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-slate-100 text-sm tracking-wide">{title}</h4>
            <p className="text-[11px] text-slate-400">Personal Reference Band (±2σ)</p>
          </div>
        </div>

        {latestVal !== undefined && (
          <div className="text-right">
            <span className="text-lg font-bold font-mono text-white">
              {typeof latestVal === 'number' ? latestVal.toFixed(1) : latestVal}
            </span>
            <span className="text-xs text-slate-400 ml-1 font-medium">{unit}</span>
            {latestZ !== undefined && (
              <p className={`text-[10px] font-mono ${Math.abs(latestZ) > 2 ? 'text-rose-400' : 'text-slate-400'}`}>
                {latestZ > 0 ? `+${latestZ.toFixed(1)}` : latestZ.toFixed(1)}σ vs normal
              </p>
            )}
          </div>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="h-48 w-full mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id={`gradient-${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fillColor} stopOpacity={0.28} />
                <stop offset="100%" stopColor={fillColor} stopOpacity={0.08} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.35} vertical={false} />

            <XAxis
              dataKey="timestamp"
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              tickFormatter={(val) => {
                if (!val) return '';
                const parts = val.split('-');
                return parts.length >= 3 ? `${parts[1]}/${parts[2]}` : val;
              }}
            />

            <YAxis
              stroke="#64748b"
              fontSize={10}
              tickLine={false}
              domain={['auto', 'auto']}
              unit={unit === 'bpm' || unit === 'mmHg' ? '' : ''}
            />

            <Tooltip content={<DarkTooltip unit={unit} metricName={metricKey} />} />

            {/* Stacked Area Trick for Normal Reference Band */}
            <Area
              type="monotone"
              dataKey="chart_lower"
              stackId="band"
              stroke="none"
              fill="transparent"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              name="Normal Band"
              dataKey="chart_width"
              stackId="band"
              stroke="none"
              fill={`url(#gradient-${metricKey})`}
              isAnimationActive={false}
            />

            {/* Baseline Mean Guideline */}
            {latestMean !== undefined && (
              <Line
                type="monotone"
                dataKey={`${metricKey}_mean`}
                stroke="#64748b"
                strokeDasharray="4 4"
                strokeWidth={1.2}
                dot={false}
                name="Baseline Mean"
                isAnimationActive={false}
              />
            )}

            {/* Observed Value Line */}
            <Line
              type="monotone"
              name="Observed Vital"
              dataKey={metricKey}
              stroke={fillColor}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: fillColor, stroke: '#0f172a', strokeWidth: 1 }}
              activeDot={{ r: 5, fill: '#fff', stroke: fillColor, strokeWidth: 2 }}
              isAnimationActive={false}
            />

            {/* Pulsing Red Dots on Anomalies */}
            <Scatter
              name="Detected Anomaly"
              dataKey="anomaly_val"
              shape={<PulsingAnomalyDot />}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Mini Legend Footer */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800/80 mt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: fillColor, opacity: 0.35 }}></span>
            <span>Normal Band (±2σ)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5" style={{ backgroundColor: fillColor }}></span>
            <span>Recorded</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-rose-400">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          <span>IForest Anomaly</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Main BaselineCharts Component
 * Accepts `days` array (up to 14 days) and renders three multivariate baseline charts.
 */
export default function BaselineCharts({ days = [] }) {
  // Safe guard against empty or undefined days
  if (!days || !Array.isArray(days) || days.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
        <ShieldCheck className="w-10 h-10 mx-auto text-slate-500 mb-2 opacity-60" />
        <h3 className="text-base font-medium text-slate-200">No Patient Vital Days Available</h3>
        <p className="text-xs text-slate-400 mt-1">
          Awaiting streaming telemetry or patient selection to generate personalized reference bands.
        </p>
      </div>
    );
  }

  // Latest day overview
  const latestDay = days[days.length - 1] || {};
  const anomalyScore = latestDay.anomaly_score ?? 0;
  const severityLabel = latestDay.severity_label || (anomalyScore >= 70 ? 'Critical Multivariate Anomaly' : anomalyScore >= 40 ? 'Moderate Pattern Drift' : 'Normal');

  // Severity badge style resolver
  const getBadgeStyle = (label) => {
    switch (label) {
      case 'Critical Multivariate Anomaly':
        return {
          bg: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
          dot: 'bg-rose-500',
          icon: AlertTriangle,
          pulse: true,
        };
      case 'Moderate Pattern Drift':
        return {
          bg: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-500',
          icon: Zap,
          pulse: false,
        };
      case 'Normal':
      default:
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-500',
          icon: ShieldCheck,
          pulse: false,
        };
    }
  };

  const badge = getBadgeStyle(severityLabel);
  const BadgeIcon = badge.icon;
  const flaggedDaysCount = days.filter((d) => d.anomaly_flag === 1).length;

  return (
    <div className="w-full space-y-4">
      {/* Top Header & Severity Banner */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-4 md:p-5 shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base md:text-lg font-bold text-white tracking-tight">
              Personalized Baseline & Anomaly Radar
            </h3>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
              14-Day Rolling
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            PyOD Isolation Forest baseline scoring individual physiological drift against calibrated reference normal.
          </p>
        </div>

        {/* Severity Badge */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
              Latest Anomaly Score
            </span>
            <span className="text-sm font-bold font-mono text-slate-200">
              {anomalyScore.toFixed(1)} / 100
            </span>
          </div>

          <div
            id="severity-badge"
            className={`px-3.5 py-2 rounded-xl border flex items-center gap-2.5 font-semibold text-xs tracking-wide shadow-lg ${badge.bg}`}
          >
            <span className="relative flex h-2.5 w-2.5">
              {badge.pulse && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${badge.dot}`}></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${badge.dot}`}></span>
            </span>
            <BadgeIcon className="w-4 h-4" />
            <span>{severityLabel}</span>
          </div>
        </div>
      </div>

      {/* Flagged Status Micro-bar */}
      {flaggedDaysCount > 0 && (
        <div className="px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              <strong>{flaggedDaysCount} of {days.length} days</strong> triggered multivariate anomaly warnings.
            </span>
          </div>
          <span className="text-[11px] font-mono text-rose-400/80">Drift Threshold &ge; 40.0</span>
        </div>
      )}

      {/* Grid of 3 Vital ComposedCharts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Heart Rate */}
        <VitalChartCard
          title="Heart Rate"
          icon={Heart}
          metricKey="heart_rate"
          unit="bpm"
          accentColor="rose"
          fillColor="#f43f5e"
          data={days}
        />

        {/* 2. Sleep Hours */}
        <VitalChartCard
          title="Sleep Rest"
          icon={Moon}
          metricKey="sleep_hours"
          unit="hrs"
          accentColor="indigo"
          fillColor="#6366f1"
          data={days}
        />

        {/* 3. Systolic Blood Pressure */}
        <VitalChartCard
          title="Systolic BP"
          icon={Activity}
          metricKey="systolic_bp"
          unit="mmHg"
          accentColor="amber"
          fillColor="#f59e0b"
          data={days}
        />
      </div>
    </div>
  );
}
