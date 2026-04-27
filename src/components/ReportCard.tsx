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
import { CardSkeleton } from './CardSkeleton'
import type { ReportPhase } from './ProgressStrip'

function severityClass(result: { severity: Severity; severityLabel?: string }): string {
  if (result.severity === 'good') {
    return result.severityLabel?.toLowerCase() === 'strong' ? 'pill strong' : 'pill healthy'
  }
  if (result.severity === 'ok') return 'pill watch'
  if (result.severity === 'unmeasured') return 'pill unmeasured'
  return 'pill concerning'
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

function cardSeverityClass(sev: Severity): string {
  if (sev === 'good') return ''
  if (sev === 'ok') return 'sev-watch'
  if (sev === 'unmeasured') return 'sev-unmeasured'
  return 'sev-concerning'
}

const TOOLTIP_STYLE = {
  background: '#12151f',
  border: '1px solid #3A3F52',
  borderRadius: 6,
  color: '#ECE6D6',
  fontSize: 12,
  fontFamily: '"JetBrains Mono", monospace',
}

interface ReportCardProps {
  result: AnalysisResult
  honestMode: boolean
  language: HonestLanguage
  accountId: number
  phase?: ReportPhase
}

export function ReportCard({ result, honestMode, language, accountId, phase }: ReportCardProps) {
  const { chart, severity } = result
  const isUnmeasured = severity === 'unmeasured'

  const finding = useMemo(() => {
    if (!honestMode) return result.finding
    return generateRoast(result, language, accountId) ?? result.finding
  }, [honestMode, language, accountId, result])

  // Progressive-render skeleton: while data is still streaming and this
  // card has nothing to show yet, render a "waiting on first parsed match"
  // placeholder. Placed AFTER all hooks so the skeleton-vs-real swap
  // doesn't change hook count between renders (Rules of Hooks). Once the
  // analysis produces a non-unmeasured result this branch falls through.
  if (isUnmeasured && phase && phase !== 'done') {
    return <CardSkeleton title={result.title} />
  }

  return (
    <article className={`card ${cardSeverityClass(severity)}`}>
      <div className="card-head">
        <h3 className="card-title">{result.title}</h3>
        <span className={severityClass(result)}>{badgeText(result)}</span>
      </div>

      {!isUnmeasured && (
        <>
          <div className="metric">
            {result.metric}
            <small>{result.metricLabel}</small>
          </div>
          <div className="baseline">
            vs {result.baseline} {result.baselineLabel}
          </div>
        </>
      )}

      {!isUnmeasured && chart && <ChartBlock chart={chart} />}

      <p className="prose">{finding}</p>
      <div className="what">
        <b>What to do</b>
        {result.suggestion}
      </div>
      {result.note && <div className="footnote">{result.note}</div>}
    </article>
  )
}

function ChartBlock({ chart }: { chart: ChartPayload }) {
  if (chart.kind === 'stat-blocks') {
    return (
      <div className="stat-pair">
        {chart.blocks.map((b, i) => (
          <div key={i} className="stat-block">
            <div className="v">{b.value}</div>
            <div className="l">{b.label}</div>
            {b.sub && <div className="sub">{b.sub}</div>}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ height: chartHeight(chart) }}>
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
  return 168
}

function renderXyChart(chart: Exclude<ChartPayload, { kind: 'stat-blocks' }>) {
  const data = normalizeForBar(chart)
  const horizontal = chart.kind === 'bars' && chart.horizontal === true
  const showBaseline = data.some((d) => d.baseline != null) && !horizontal
  const yMax = 'yMax' in chart ? chart.yMax : undefined

  if (horizontal) {
    return (
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid stroke="#2A2E3D" horizontal={false} />
        <XAxis type="number" stroke="#8A8474" fontSize={10} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          stroke="#C9C2B0"
          fontSize={10}
          width={140}
          tickLine={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1a1e2b' }} />
        <Bar
          dataKey="value"
          name={chart.valueName ?? 'Games'}
          fill="#E94560"
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
      <CartesianGrid stroke="#2A2E3D" vertical={false} />
      <XAxis dataKey="label" stroke="#8A8474" fontSize={10} interval={0} {...xAxisProps} />
      <YAxis stroke="#8A8474" fontSize={10} domain={yMax != null ? [0, yMax] : undefined} />
      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#1a1e2b' }} />
      <Legend
        iconSize={8}
        wrapperStyle={{
          fontSize: 10,
          color: '#8A8474',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '0.04em',
        }}
      />
      <Bar dataKey="value" name={chart.valueName ?? 'You'} fill="#E94560" radius={[3, 3, 0, 0]} />
      {showBaseline && (
        <Bar
          dataKey="baseline"
          name={chart.baselineName ?? 'Baseline'}
          fill="#5B3A8F"
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
          fill={i === 0 ? '#C9C2B0' : '#8A8474'}
          fontSize={10}
          fontFamily='"JetBrains Mono", monospace'
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
