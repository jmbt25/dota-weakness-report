import { useEffect, useMemo, useRef, useState } from 'react'
import type { AnalysisResult, HonestLanguage, Severity, VisionData, WardPlacement } from '../types'
import { generateRoast } from '../lib/honestMode'

const MINIMAP_SRC = '/dota-minimap.jpg'

// Coordinate transform — matches odota/web's `gameCoordToUV`:
//   ux = gx - 64
//   uy = 127 - (gy - 64)
// then scaled to pixel space. OpenDota observed coords land in [64, 191].
//
// TODO: refine after testing — spot-check 5 wards against a real Dota 2
// map to confirm the linear scale is correct on the 900x900 source image
// we bundle (no border, no padding to subtract).
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

function severityClass(sev: Severity): string {
  if (sev === 'good') return 'pill-good'
  if (sev === 'ok') return 'pill-neutral'
  if (sev === 'unmeasured') return 'pill-muted'
  return 'pill-bad'
}

function severityLabelText(sev: Severity): string {
  if (sev === 'good') return 'Healthy'
  if (sev === 'ok') return 'Watch'
  if (sev === 'unmeasured') return 'Unmeasured'
  return 'Concerning'
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
}

export function VisionCard({ result, honestMode, language, accountId }: VisionCardProps) {
  const data = result.vision
  const isUnmeasured = result.severity === 'unmeasured'

  const finding = useMemo(() => {
    if (!honestMode) return result.finding
    return generateRoast(result, language, accountId) ?? result.finding
  }, [honestMode, language, accountId, result])

  return (
    <article className="card flex flex-col">
      <header className="flex items-start justify-between gap-3">
        <h3 className="text-lg font-semibold">{result.title}</h3>
        <span className={severityClass(result.severity)}>
          {result.severityLabel ?? severityLabelText(result.severity)}
        </span>
      </header>

      {!isUnmeasured && (
        <>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tabular-nums">{result.metric}</span>
            <span className="text-xs text-ink-muted">{result.metricLabel}</span>
            <span className="ml-auto text-xs text-ink-dim tabular-nums">
              vs {result.baseline} {result.baselineLabel}
            </span>
          </div>

          {data && <SubMetrics data={data} />}
          {data && data.placements.length > 0 && <WardMap placements={data.placements} />}
        </>
      )}

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

function SubMetrics({ data }: { data: VisionData }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
      <div className="rounded bg-bg-raised border border-line p-2">
        <div className="text-ink-dim uppercase tracking-wider">Avg ward lifetime</div>
        <div className="mt-1 text-base text-ink tabular-nums">
          {formatMmSs(data.avgLifetimeSec)}{' '}
          <span className="text-ink-dim text-[10px] tabular-nums">
            vs {formatMmSs(data.lifetimeBaselineSec)}
          </span>
        </div>
      </div>
      <div className="rounded bg-bg-raised border border-line p-2">
        <div className="text-ink-dim uppercase tracking-wider">Vision-death mismatch</div>
        <div className="mt-1 text-base text-ink tabular-nums">
          {data.mismatchPct != null ? `${Math.round(data.mismatchPct)}%` : '—'}
          <span className="text-ink-dim text-[10px] ml-2">
            {data.mismatchPct != null
              ? `${data.deathSamples} death${data.deathSamples === 1 ? '' : 's'} scored`
              : 'no death coords'}
          </span>
        </div>
      </div>
    </div>
  )
}

function WardMap({ placements }: { placements: WardPlacement[] }) {
  // Measure the rendered map width to size the SVG overlay. The map is a
  // square; height === width.
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

  // Mobile gets bigger dots so density stays visible at 375px viewport.
  const isSmall = size > 0 && size < 280
  const radius = isSmall ? 6 : 4
  const opacity = isSmall ? 0.55 : 0.6

  return (
    <div className="mt-3">
      <div
        ref={wrapperRef}
        className="relative w-full"
        style={{ aspectRatio: '1 / 1' }}
      >
        <img
          src={MINIMAP_SRC}
          alt="Dota 2 minimap"
          className="absolute inset-0 w-full h-full rounded select-none"
          draggable={false}
        />
        {size > 0 && (
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            {placements.map((p, i) => {
              const { px, py } = gameToPixel(p.x, p.y, size, size)
              const fill = p.kind === 'observer' ? '#facc15' : '#a78bfa'
              const stroke = p.outcome === 'dewarded' ? '#ef4444' : 'none'
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-dim">
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: '#facc15', opacity: 0.7 }}
          />
          obs
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{ width: 8, height: 8, background: '#a78bfa', opacity: 0.7 }}
          />
          sen
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              border: '1.5px solid #ef4444',
              background: 'transparent',
            }}
          />
          dewarded
        </span>
      </div>
    </div>
  )
}
