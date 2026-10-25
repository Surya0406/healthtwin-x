const FEATURE_LABELS = {
  heart_rate: "Heart rate",
  spo2: "SpO₂",
  systolic_bp: "Systolic blood pressure",
  sleep_hours: "Sleep",
  daily_steps: "Daily steps",
  stress_index: "Stress index",
};

function displayValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }
  return typeof value === "number" ? value.toLocaleString() : String(value);
}

export default function XaiAlertPanel({ xaiData }) {
  const summary =
    typeof xaiData?.explanation_summary === "string"
      ? xaiData.explanation_summary.trim()
      : "";
  const attributions = Array.isArray(xaiData?.feature_attributions)
    ? xaiData.feature_attributions.filter((item) => item && typeof item === "object")
    : [];
  const isLoading = xaiData === undefined || xaiData === null;

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-lg">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
          Explainable AI
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">Alert explanation</h2>
      </div>

      <div
        className="rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm leading-6 text-slate-200"
        role="status"
      >
        {isLoading
          ? "Loading explanation…"
          : summary || "An explanation summary is not available."}
      </div>

      <div className="mt-5 space-y-4">
        {attributions.length > 0 ? (
          attributions.map((item, index) => {
            const increasedRisk = item.direction === "increased_risk";
            const impact = Number.isFinite(Number(item.impact_percentage))
              ? Math.min(100, Math.max(0, Number(item.impact_percentage)))
              : 0;
            const label =
              FEATURE_LABELS[item.feature] ||
              String(item.feature || `Feature ${index + 1}`).replace(/_/g, " ");

            return (
              <div key={item.feature || `${label}-${index}`}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-slate-100">{label}</span>
                  <span className="shrink-0 text-sm font-semibold text-slate-200">
                    {impact.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-700"
                  role="progressbar"
                  aria-label={`${label} contribution`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={impact}
                >
                  <div
                    className={`h-full rounded-full transition-all ${
                      increasedRisk ? "bg-rose-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${impact}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-slate-400">
                  Current: {displayValue(item.current_value)}
                  <span className="mx-2 text-slate-600">·</span>
                  Baseline mean: {displayValue(item.baseline_mean)}
                </p>
              </div>
            );
          })
        ) : (
          <p className="py-2 text-sm text-slate-400">
            {isLoading
              ? "Feature contributions will appear when the explanation is ready."
              : "Feature contributions are unavailable."}
          </p>
        )}
      </div>
    </section>
  );
}
