import { useMemo } from 'react'
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
import type {
  AnalysisResult,
  ChartBars,
  ChartPayload,
  HonestLanguage,
  Severity,
} from '../types'
import { generateRoast } from '../lib/honestMode'

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

function badgeText(result: { severity: Severity; severityLabel?: string }): string {
  return result.severityLabel ?? severityLabel(result.severity)
}

const TOOLTIP_STYLE = {
  background: '#13161d',
  border: '1px solid #222632',
  borderRadius: 8,
  color: '#e6e8ee',
  fontSize: 12,
}

interface ReportCardProps {
  result: AnalysisResult
  honestMode: boolean
  language: HonestLanguage
  accountId: number
}

export function ReportCard({ result, honestMode, language, accountId }: ReportCardProps) {
  const { chart, severity } = result
  const isUnmeasured = severity === 'unmeasured'

  // Honest-mode prose: generate lazily; if it returns null (no eligible
  // template, missing facts, or validator rejection), fall back to the
  // serious-mode finding silently.
  const finding = useMemo(() => {
    if (!honestMode) return result.finding
    return generateRoast(result, language, accountId) ?? result.finding
  }, [honestMode, language, accountId, result])

  return (
    <article className="card flex flex-col">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{result.title}</h3>
        <span className={severityClass(severity)}>{badgeText(result)}</span>
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

      {!isUnmeasured && chart && <ChartBlock chart={chart} />}

      <p className="mt-4 text-sm text-ink leading-relaxed">{finding}</p>
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

function ChartBlock({ chart }: { chart: ChartPayload }) {
  if (chart.kind === 'stat-blocks') {
    return (
      <div className="mt-4 grid grid-cols-2 gap-3">
        {chart.blocks.map((b, i) => (
          <div key={i} className="rounded-lg bg-bg-raised border border-line p-4 flex flex-col">
            <span className="text-xs uppercase tracking-wider text-ink-dim">{b.label}</span>
            <span className="mt-1 text-2xl font-semibold tabular-nums leading-none">{b.value}</span>
            {b.sub && <span className="mt-2 text-xs text-ink-muted leading-snug">{b.sub}</span>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="mt-4" style={{ height: chartHeight(chart) }}>
      <ResponsiveContainer width="100%" height="100%">
        {renderXyChart(chart)}
      </ResponsiveContainer>
    </div>
  )
}

function chartHeight(chart: ChartBars | { kind: 'series' } | { kind: string }): number {
  if (chart.kind === 'bars') {
    const c = chart as ChartBars
    if (c.horizontal) return Math.max(140, c.data.length * 22 + 24)
    if (c.xMultilineSplit || (c.xTickAngle && Math.abs(c.xTickAngle) >= 30)) return 200
  }
  return 176
}

function renderXyChart(chart: Exclude<ChartPayload, { kind: 'stat-blocks' }>) {
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
          width={150}
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

  const tickAngle = chart.kind === 'bars' ? chart.xTickAngle : undefined
  const multilineSplit = chart.kind === 'bars' ? chart.xMultilineSplit : undefined
  const xAxisProps =
    multilineSplit
      ? { tick: <MultilineTick split={multilineSplit} />, height: 44 }
      : tickAngle
        ? { angle: tickAngle, textAnchor: 'end' as const, height: 56 }
        : {}

  return (
    <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
      <CartesianGrid stroke="#222632" vertical={false} />
      <XAxis dataKey="label" stroke="#6b7280" fontSize={11} interval={0} {...xAxisProps} />
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

interface MultilineTickProps {
  split: string
  x?: number
  y?: number
  payload?: { value?: string }
}

function MultilineTick({ split, x = 0, y = 0, payload }: MultilineTickProps) {
  const raw = String(payload?.value ?? '')
  const lines = raw.split(split)
  return (
    <g transform={`translate(${x},${y})`}>
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={0}
          dy={12 + i * 12}
          textAnchor="middle"
          fill={i === 0 ? '#9aa3b2' : '#6b7280'}
          fontSize={11}
        >
          {line}
        </text>
      ))}
    </g>
  )
}

function normalizeForBar(chart: Exclude<ChartPayload, { kind: 'stat-blocks' }>): {
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
