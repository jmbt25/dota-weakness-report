import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AnalysisResult, Severity } from '../types'

function severityClass(sev: Severity): string {
  if (sev === 'good') return 'pill-good'
  if (sev === 'ok') return 'pill-neutral'
  if (sev === 'unmeasured') return 'pill-muted'
  return 'pill-bad'
}

function severityLabel(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  if (sev === 'unmeasured') return 'Unmeasured'
  return 'Concerning'
}

const TOOLTIP_STYLE = {
  background: '#13161d',
  border: '1px solid #222632',
  borderRadius: 8,
  color: '#e6e8ee',
  fontSize: 12,
}

export function ReportCard({ result }: { result: AnalysisResult }) {
  const { chart, severity } = result
  const isUnmeasured = severity === 'unmeasured'

  return (
    <article className="card flex flex-col">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{result.title}</h3>
        <span className={severityClass(severity)}>{severityLabel(severity)}</span>
      </header>

      {!isUnmeasured && (
        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{result.metric}</span>
          <span className="text-xs text-ink-muted">{result.metricLabel}</span>
          <span className="ml-auto text-xs text-ink-dim tabular-nums">
            vs {result.baseline} {result.baselineLabel}
          </span>
        </div>
      )}

      {!isUnmeasured && chart && (
        <div className="mt-4" style={{ height: chartHeight(chart) }}>
          <ResponsiveContainer width="100%" height="100%">
            {renderChart(chart)}
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 text-sm text-ink leading-relaxed">{result.finding}</p>
      <p className="mt-3 text-sm text-ink-muted leading-relaxed">
        <span className="text-ink-dim text-xs uppercase tracking-wider mr-2">What to do</span>
        {result.suggestion}
      </p>
      {result.note && (
        <p className="mt-3 text-xs text-ink-dim italic leading-relaxed">{result.note}</p>
      )}
    </article>
  )
}

function chartHeight(chart: NonNullable<AnalysisResult['chart']>): number {
  if (chart.kind === 'bars' && chart.horizontal) {
    // ~22px per bar + padding so labels don't crowd.
    return Math.max(140, chart.data.length * 22 + 24)
  }
  return 176
}

function renderChart(chart: NonNullable<AnalysisResult['chart']>) {
  const data = normalizeForBar(chart)
  const horizontal = chart.kind === 'bars' && chart.horizontal === true
  const showBaseline = data.some((d) => d.baseline != null) && !horizontal
  const yMax = 'yMax' in chart ? chart.yMax : undefined

  if (horizontal) {
    return (
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="#222632" horizontal={false} />
        <XAxis type="number" stroke="#6b7280" fontSize={11} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="#9aa3b2"
          fontSize={11}
          width={130}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1a1e27' }} />
        <Bar
          dataKey="value"
          name={chart.valueName ?? 'Games'}
          fill="#ef4444"
          radius={[0, 3, 3, 0]}
        />
      </BarChart>
    )
  }

  return (
    <BarChart data={data}>
      <CartesianGrid stroke="#222632" vertical={false} />
      <XAxis dataKey="label" stroke="#6b7280" fontSize={11} interval={0} />
      <YAxis stroke="#6b7280" fontSize={11} domain={yMax != null ? [0, yMax] : undefined} />
      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1a1e27' }} />
      <Legend iconSize={8} wrapperStyle={{ fontSize: 11, color: '#9aa3b2' }} />
      <Bar dataKey="value" name={chart.valueName ?? 'You'} fill="#ef4444" radius={[3, 3, 0, 0]} />
      {showBaseline && (
        <Bar
          dataKey="baseline"
          name={chart.baselineName ?? 'Baseline'}
          fill="#475569"
          radius={[3, 3, 0, 0]}
        />
      )}
    </BarChart>
  )
}

function normalizeForBar(chart: NonNullable<AnalysisResult['chart']>): {
  label: string
  value: number
  baseline?: number
}[] {
  if (chart.kind === 'bars') return chart.data
  return chart.data.map((d) => ({
    label: String(d.x),
    value: d.you,
    baseline: d.baseline,
  }))
}
