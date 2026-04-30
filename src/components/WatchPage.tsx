import { useEffect, useMemo, useRef, useState } from 'react'
import type { ODProMatch } from '../types'
import { fetchProMatches, HttpError } from '../api/opendota'
import { getCachedProMatches, setCachedProMatches } from '../lib/watchCache'
import { countByFilter, isMatchEligible } from '../lib/watchLeagues'
import { WatchDisclaimer } from './WatchDisclaimer'

interface WatchPageProps {
  /** Called when the user clicks a match card. Triggers route change. */
  onSelectMatch: (matchId: number) => void
}

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; matches: ODProMatch[] }
  | { kind: 'error'; message: string; retry: () => void }

const VISIBLE_COUNT = 50

export function WatchPage({ onSelectMatch }: WatchPageProps) {
  const [state, setState] = useState<FetchState>({ kind: 'loading' })
  // Default off: tracked-tournaments only. Doesn't persist across visits —
  // each fresh /watch lands the user in the curated view.
  const [showAll, setShowAll] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  function load() {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    // Cache hit short-circuit (5-min TTL).
    const cached = getCachedProMatches()
    if (cached) {
      setState({ kind: 'ready', matches: cached })
      return
    }

    setState({ kind: 'loading' })
    fetchProMatches({ signal: ac.signal })
      .then((matches) => {
        setCachedProMatches(matches)
        setState({ kind: 'ready', matches })
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        setState({
          kind: 'error',
          message: deriveErrorMessage(err),
          retry: load,
        })
      })
  }

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <WatchDisclaimer />
      <section className="dwr-watch">
        <div className="dwr-watch-header">
          <div className="dwr-watch-eyebrow">WATCH LIKE A COACH</div>
          <h1 className="dwr-watch-title">Recent pro matches</h1>
          <p className="dwr-watch-tagline">
            Click a match for a coach-style breakdown.
          </p>
        </div>

        {state.kind === 'loading' && <SkeletonGrid count={9} />}

        {state.kind === 'error' && (
          <div className="dwr-watch-error" role="alert">
            <p>{state.message}</p>
            <button type="button" className="dwr-btn" onClick={state.retry}>
              Try again
            </button>
          </div>
        )}

        {state.kind === 'ready' && (
          <ReadyView
            matches={state.matches}
            showAll={showAll}
            setShowAll={setShowAll}
            onSelectMatch={onSelectMatch}
          />
        )}
      </section>
    </>
  )
}

function ReadyView({
  matches,
  showAll,
  setShowAll,
  onSelectMatch,
}: {
  matches: ODProMatch[]
  showAll: boolean
  setShowAll: (v: boolean) => void
  onSelectMatch: (id: number) => void
}) {
  // Single pass over the full list to derive both filtered + counts.
  // Memoized so toggling showAll doesn't re-iterate.
  const counts = useMemo(() => countByFilter(matches), [matches])
  const visible = useMemo(
    () => matches.filter((m) => isMatchEligible(m, showAll)).slice(0, VISIBLE_COUNT),
    [matches, showAll]
  )

  if (matches.length === 0) {
    return (
      <p className="dwr-watch-empty">
        No recent pro matches available right now. OpenDota's feed may be
        briefly empty between tournaments — try again in a few minutes.
      </p>
    )
  }

  // Tracked-tournaments mode but the curated set is empty (slow week
  // between major events). Surface why + offer the toggle as the path forward.
  if (!showAll && counts.trackedAndLong === 0) {
    return (
      <>
        <div className="dwr-watch-empty-tracked">
          <p>
            No tracked tournaments live right now. The default view shows
            DreamLeague, BLAST Slam, ESL One, PGL, Riyadh Masters, ESports
            World Cup, TI, and qualifiers for those — none of those have
            matches in OpenDota's most recent feed.
          </p>
          <button
            type="button"
            className="dwr-link-btn dwr-watch-toggle-link"
            onClick={() => setShowAll(true)}
          >
            Show all {counts.allLong} recent matches →
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="dwr-watch-grid">
        {visible.map((m) => (
          <MatchCard key={m.match_id} m={m} onClick={() => onSelectMatch(m.match_id)} />
        ))}
      </div>

      <div className="dwr-watch-toggle">
        {showAll ? (
          <>
            <span className="dwr-watch-toggle-status">
              Showing {visible.length} of {counts.allLong} recent matches.
            </span>
            <button
              type="button"
              className="dwr-link-btn dwr-watch-toggle-link"
              onClick={() => setShowAll(false)}
            >
              Show only tracked tournaments
            </button>
          </>
        ) : (
          <>
            <span className="dwr-watch-toggle-status">
              Showing {visible.length} from tracked tournaments
              {counts.allLong > visible.length && ` (${counts.allLong - visible.length} more in the unfiltered feed)`}.
            </span>
            <button
              type="button"
              className="dwr-link-btn dwr-watch-toggle-link"
              onClick={() => setShowAll(true)}
            >
              Show all {counts.allLong} recent matches
            </button>
          </>
        )}
      </div>
    </>
  )
}

function MatchCard({ m, onClick }: { m: ODProMatch; onClick: () => void }) {
  const radiantWon = m.radiant_win
  const radiantName = m.radiant_name || 'Radiant'
  const direName = m.dire_name || 'Dire'
  const duration = formatDuration(m.duration)
  const ended = formatRelative(m.start_time + m.duration)

  return (
    <button
      type="button"
      onClick={onClick}
      className="card dwr-watch-card"
      aria-label={`${radiantName} ${m.radiant_score} versus ${direName} ${m.dire_score} — view analysis`}
    >
      <div className="dwr-watch-card-league">{m.league_name || 'League TBD'}</div>
      <div className="dwr-watch-card-teams">
        <span className={`team ${radiantWon ? 'win' : 'lose'}`}>{radiantName}</span>
        <span className="vs">vs</span>
        <span className={`team ${!radiantWon ? 'win' : 'lose'}`}>{direName}</span>
      </div>
      <div className="dwr-watch-card-score">
        <span className={`score ${radiantWon ? 'win' : 'lose'}`}>{m.radiant_score}</span>
        <span className="dash">—</span>
        <span className={`score ${!radiantWon ? 'win' : 'lose'}`}>{m.dire_score}</span>
      </div>
      <div className="dwr-watch-card-meta">
        <span>{duration}</span>
        <span className="sep">·</span>
        <span>Ended {ended}</span>
      </div>
    </button>
  )
}

function SkeletonGrid({ count }: { count: number }) {
  return (
    <div className="dwr-watch-grid">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card dwr-watch-card-skeleton" aria-hidden="true">
          <div className="skeleton-line sm" />
          <div className="skeleton-line lg" />
          <div className="skeleton-line md" />
          <div className="skeleton-line sm" />
        </div>
      ))}
    </div>
  )
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatRelative(unixSec: number): string {
  if (!Number.isFinite(unixSec) || unixSec <= 0) return 'recently'
  const nowMs = Date.now()
  const thenMs = unixSec * 1000
  const diffSec = Math.max(0, Math.round((nowMs - thenMs) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`
  const diffMo = Math.floor(diffDay / 30)
  return `${diffMo} mo ago`
}

function deriveErrorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 429) {
      // Per spec §1.2, 429 gets distinct copy from generic 5xx.
      return "OpenDota's free tier limits 3000 calls per day per IP. Try tomorrow, or get your own key at opendota.com/api-keys."
    }
    if (err.status >= 500) {
      return "OpenDota's having a moment — try again in a minute. Status: status.opendota.com"
    }
    return `Couldn't load recent pro matches (HTTP ${err.status}). Try again in a minute.`
  }
  return "Couldn't load recent pro matches. Try again in a minute."
}
