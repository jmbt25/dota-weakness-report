import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalysisResult, Severity } from '../types'

const PIE_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#06b6d4', '#475569']

function severityClass(sev: Severity): string {
  if (sev === 'good') return 'pill-good'
  if (sev === 'ok') return 'pill-ok'
  return 'pill-bad'
}

function severityLabel(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  return 'Concerning'
}

export function ReportCard({ result }: { result: AnalysisResult }) {
  const { chart } = result
  return (
    <article className="card flex flex-col">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{result.title}</h3>
        <span className={severityClass(result.severity)}>{severityLabel(result.severity)}</span>
      </header>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{result.metric}</span>
        <span className="text-xs text-ink-muted">{result.metricLabel}</span>
        <span className="ml-auto text-xs text-ink-dim tabular-nums">
          baseline {result.baseline} {result.baselineLabel}
        </span>
      </div>

      {chart && (
        <div className="mt-4 h-44">
          <ResponsiveContainer width="100%" height="100%">
            {chart.kind === 'pie' ? (
              <PieChart>
                <Pie
                  data={chart.data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={28}
                  outerRadius={64}
                  paddingAngle={2}
                  stroke="#0b0d12"
                >
                  {chart.data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#13161d',
                    border: '1px solid #222632',
                    borderRadius: 8,
                    color: '#e6e8ee',
                  }}
                />
              </PieChart>
            ) : (
              <BarChart data={normalizeForBar(chart)}>
                <CartesianGrid stroke="#222632" vertical={false} />
                <XAxis dataKey="label" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: '#13161d',
                    border: '1px solid #222632',
                    borderRadius: 8,
                    color: '#e6e8ee',
                  }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#9aa3b2' }} />
                <Bar dataKey="value" name={chart.valueName ?? 'You'} fill="#ef4444" radius={[3, 3, 0, 0]} />
                {hasBaseline(chart) && (
                  <Bar
                    dataKey="baseline"
                    name={chart.baselineName ?? 'Baseline'}
                    fill="#475569"
                    radius={[3, 3, 0, 0]}
                  />
                )}
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 text-sm text-ink leading-relaxed">{result.finding}</p>
      <p className="mt-3 text-sm text-ink-muted leading-relaxed">
        <span className="text-ink-dim text-xs uppercase tracking-wider mr-2">What to do</span>
        {result.suggestion}
      </p>
    </article>
  )
}

// Both 'bars' and 'series' charts render as BarChart for v1.
function normalizeForBar(chart: NonNullable<AnalysisResult['chart']>): {
  label: string
  value: number
  baseline?: number
}[] {
  if (chart.kind === 'pie') return []
  if (chart.kind === 'bars') return chart.data
  // 'series' uses x/you/baseline keys; remap to label/value/baseline.
  return chart.data.map((d) => ({
    label: String(d.x),
    value: d.you,
    baseline: d.baseline,
  }))
}

function hasBaseline(chart: NonNullable<AnalysisResult['chart']>): boolean {
  if (chart.kind === 'pie') return false
  return chart.data.some((d) => 'baseline' in d && d.baseline != null)
}
