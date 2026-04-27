import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult, HonestLanguage, Severity, VisionData, WardPlacement } from '../types'
import { generateRoast } from '../lib/honestMode'
import { CardSkeleton } from './CardSkeleton'
import type { ReportPhase } from './ProgressStrip'

const MINIMAP_SRC = '/dota-minimap.jpg'

function gameToPixel(
  gx: number,
  gy: number,
  mapWidth: number,
  mapHeight: number
): { px: number; py: number } {
  const ux = gx - 64
  const uy = 127 - (gy - 64)
  return {
    px: (ux / 127) * mapWidth,
    py: (uy / 127) * mapHeight,
  }
}

function severityClass(result: { severity: Severity; severityLabel?: string }): string {
  if (result.severity === 'good') {
    return result.severityLabel?.toLowerCase() === 'strong' ? 'pill strong' : 'pill healthy'
  }
  if (result.severity === 'ok') return 'pill watch'
  if (result.severity === 'unmeasured') return 'pill unmeasured'
  return 'pill concerning'
}

function severityLabelText(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  if (sev === 'unmeasured') return 'Unmeasured'
  return 'Concerning'
}

function cardSeverityClass(sev: Severity): string {
  if (sev === 'good') return ''
  if (sev === 'ok') return 'sev-watch'
  if (sev === 'unmeasured') return 'sev-unmeasured'
  return 'sev-concerning'
}

function formatMmSs(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

interface VisionCardProps {
  result: AnalysisResult
  honestMode: boolean
  language: HonestLanguage
  accountId: number
  phase?: ReportPhase
}

export function VisionCard({ result, honestMode, language, accountId, phase }: VisionCardProps) {
  const data = result.vision
  const isUnmeasured = result.severity === 'unmeasured'

  const finding = useMemo(() => {
    if (!honestMode) return result.finding
    return generateRoast(result, language, accountId) ?? result.finding
  }, [honestMode, language, accountId, result])

  // Vision is the most parse-dependent card (needs ward logs from parsed
  // replays). Skeleton in until the first eligible parsed match lands.
  // Placed AFTER all hooks so the skeleton-vs-real swap doesn't change
  // hook count between renders (Rules of Hooks).
  if (isUnmeasured && phase && phase !== 'done') {
    return <CardSkeleton title={result.title} />
  }

  return (
    <article className={`card ${cardSeverityClass(result.severity)}`}>
      <div className="card-head">
        <h3 className="card-title">{result.title}</h3>
        <span className={severityClass(result)}>
          {result.severityLabel ?? severityLabelText(result.severity)}
        </span>
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

          {data && <SubMetrics data={data} />}
          {data && data.placements.length > 0 && <WardMap placements={data.placements} />}
        </>
      )}

      <p className="prose">{finding}</p>
      <div className="what">
        <b>What to do</b>
        {result.suggestion}
      </div>
      {result.note && <div className="footnote">{result.note}</div>}
    </article>
  )
}

function SubMetrics({ data }: { data: VisionData }) {
  return (
    <div className="substat">
      <div>
        <div className="v">
          {formatMmSs(data.avgLifetimeSec)}
          <span className="sub">vs {formatMmSs(data.lifetimeBaselineSec)}</span>
        </div>
        <div className="l">Avg ward lifetime</div>
      </div>
      <div>
        <div className="v">
          {data.mismatchPct != null ? `${Math.round(data.mismatchPct)}%` : '—'}
          <span className="sub">
            {data.mismatchPct != null
              ? `${data.deathSamples} death${data.deathSamples === 1 ? '' : 's'}`
              : 'no death coords'}
          </span>
        </div>
        <div className="l">Vision-death mismatch</div>
      </div>
    </div>
  )
}

function WardMap({ placements }: { placements: WardPlacement[] }) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<number>(0)

  useEffect(() => {
    if (!wrapperRef.current) return
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0
      setSize(Math.round(w))
    })
    obs.observe(wrapperRef.current)
    return () => obs.disconnect()
  }, [])

  const isSmall = size > 0 && size < 280
  const radius = isSmall ? 6 : 4
  const opacity = isSmall ? 0.55 : 0.6

  return (
    <div>
      <div
        ref={wrapperRef}
        className="relative w-full"
        style={{
          aspectRatio: '1 / 1',
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--line-strong)',
          position: 'relative',
        }}
      >
        <img
          src={MINIMAP_SRC}
          alt="Dota 2 minimap"
          className="absolute inset-0 w-full h-full select-none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          draggable={false}
        />
        {size > 0 && (
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0 w-full h-full"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            aria-hidden="true"
          >
            {placements.map((p, i) => {
              const { px, py } = gameToPixel(p.x, p.y, size, size)
              const fill = p.kind === 'observer' ? '#FBBF24' : '#38BDF8'
              const stroke = p.outcome === 'dewarded' ? '#E94560' : 'none'
              return (
                <circle
                  key={i}
                  cx={px}
                  cy={py}
                  r={radius}
                  fill={fill}
                  fillOpacity={opacity}
                  stroke={stroke}
                  strokeWidth={stroke === 'none' ? 0 : 1.5}
                />
              )
            })}
          </svg>
        )}
      </div>
      <div className="legend">
        <span><i style={{ background: '#FBBF24' }} />Obs</span>
        <span><i style={{ background: '#38BDF8' }} />Sen</span>
        <span>
          <i style={{ border: '1.5px solid #E94560', background: 'transparent' }} />
          Dewarded
        </span>
      </div>
    </div>
  )
}
