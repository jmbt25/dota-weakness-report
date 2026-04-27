/**
 * Top-of-report status banner for the progressive renderer (v1.1.1).
 *
 * Lives above the card grid while data is still streaming. Three pieces:
 *   - a stage label (FETCHING / PARSING / PARTIAL DATA) in the display
 *     font so it reads at a glance
 *   - a counts line (`47 of 50 parsed · 3 to go · ETA ~30s`) using the
 *     fixed denominator (the 50-match analysis window) so the math
 *     never gives confusing "X/1 parsed" mid-tail readouts
 *   - a help line explaining what's happening on the OpenDota side, so
 *     first-time users aren't staring at "parsing" with no context.
 *
 * Disappears once `phase === 'done'` AND nothing is stalled.
 */

export type ReportPhase = 'fetching-details' | 'parsing' | 'done'

export interface ProgressStripProps {
  phase: ReportPhase
  /** How many of the 50 detail-fetch slots have resolved (parsed or not). */
  detailsFetched: number
  totalDetails: number
  /** How many matches currently have parsed data (initial cache hits + parses
   *  that completed during this session). */
  parsedCount: number
  unparsedRemaining: number
  stalledCount: number
  /** Total matches that needed parsing at the start of the parse phase.
   *  Kept on the type for completeness even though the user-facing math
   *  uses `totalDetails` (the fixed 50-match window) — the old `X/totalToParse`
   *  display surfaced confusing readouts like "49/1 parsed" when only one
   *  match needed parsing. */
  totalToParse: number
}

const CELLS = 12
const CONCURRENCY = 5
// Average wall-time for a single OpenDota parse during peak hours.
// CLAUDE.md notes parses commonly take 60–90s; 45s is a fair midpoint
// for ETA estimation that doesn't lowball the tail.
const SECS_PER_PARSE = 45

function formatEta(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds < 60) return `~${seconds}s`
  if (seconds < 600) {
    const mins = Math.round(seconds / 60)
    return `~${mins}m`
  }
  const mins = Math.round(seconds / 60)
  return `~${mins}m`
}

interface DerivedStatus {
  label: string
  primary: string
  eta: string | null
  help: string
  pct: number
}

function deriveStatus(p: ProgressStripProps): DerivedStatus {
  if (p.phase === 'fetching-details') {
    const remaining = Math.max(0, p.totalDetails - p.detailsFetched)
    // Detail fetches go through the 1.05s rate-limited queue, sequential.
    const etaSec = Math.ceil((remaining * 1.05) / 5) * 5
    return {
      label: 'Fetching match data',
      primary: `${p.detailsFetched} of ${p.totalDetails} fetched`,
      eta: remaining > 0 ? `ETA ${formatEta(etaSec)}` : null,
      help:
        'Pulling each match summary from OpenDota. The two cards that work without replay data (hero pool, loss streak) are already live below.',
      pct: p.totalDetails > 0 ? p.detailsFetched / p.totalDetails : 0,
    }
  }
  if (p.phase === 'parsing') {
    // ETA: parses run up to 5 in parallel, ~45s each. With 1 remaining,
    // it's still one full parse cycle (~45s), not 1/5 of one.
    const etaSec = Math.ceil(p.unparsedRemaining / CONCURRENCY) * SECS_PER_PARSE
    const stalledSuffix = p.stalledCount > 0 ? ` · ${p.stalledCount} stalled` : ''
    const toGoSuffix = p.unparsedRemaining > 0 ? ` · ${p.unparsedRemaining} to go` : ''
    return {
      label: 'Parsing replays',
      primary: `${p.parsedCount} of ${p.totalDetails} parsed${toGoSuffix}${stalledSuffix}`,
      eta: p.unparsedRemaining > 0 ? `ETA ${formatEta(etaSec)}` : null,
      help:
        'OpenDota analyzes each replay (~30–90s) to extract ward placements, GPM curves, and item timings. Cards below fill in live as each match finishes.',
      pct: p.totalDetails > 0 ? p.parsedCount / p.totalDetails : 0,
    }
  }
  // phase === 'done'
  return {
    label: 'Partial data',
    primary: `${p.parsedCount} of ${p.totalDetails} parsed · ${p.stalledCount} stalled`,
    eta: null,
    help:
      'Stalled matches usually parse on your next visit (OpenDota caches parses). Cards already reflect the matches that completed — refresh to retry the rest.',
    pct: p.totalDetails > 0 ? p.parsedCount / p.totalDetails : 1,
  }
}

export function ProgressStrip(props: ProgressStripProps) {
  const status = deriveStatus(props)
  const filledCells = Math.min(CELLS, Math.max(0, Math.round(status.pct * CELLS)))
  const isActive = props.phase !== 'done'

  return (
    <section className="dwr-progress-banner" aria-live="polite">
      <div className="dwr-progress-row">
        <div className="dwr-progress-label">
          {isActive && <span className="dwr-progress-pulse" aria-hidden="true" />}
          {status.label}
        </div>
        <div className="dwr-progress-cells" aria-hidden="true">
          {Array.from({ length: CELLS }).map((_, i) => (
            <span
              key={i}
              className={`dwr-progress-cell ${i < filledCells ? 'on' : ''} ${
                isActive && i === filledCells ? 'pulse' : ''
              }`}
            />
          ))}
        </div>
        <div className="dwr-progress-counts">
          <span className="primary">{status.primary}</span>
          {status.eta && <span className="eta">{status.eta}</span>}
        </div>
      </div>
      <p className="dwr-progress-help">{status.help}</p>
    </section>
  )
}
