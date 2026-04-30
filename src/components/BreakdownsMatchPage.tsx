import { useEffect, useRef, useState } from 'react'
import type { ODMatchDetail } from '../types'
import { fetchMatchDetail, HttpError } from '../api/opendota'
import { getCachedMatch, setCachedMatch } from '../lib/breakdownsCache'
import { BreakdownsDisclaimer } from './BreakdownsDisclaimer'
import { BreakdownsPlayerGrid } from './BreakdownsPlayerGrid'
import { BreakdownsMatchSections } from './BreakdownsMatchSections'
import { BreakdownsLeadLines } from './BreakdownsLeadLines'

interface BreakdownsMatchPageProps {
  /** Match ID parsed from the URL path. May be NaN/0 if the route matched
   *  loosely; the component renders an invalid-ID error in that case. */
  matchId: number
  onBackToBreakdowns: () => void
  /** Called when the match data lands so App.tsx can update document.title. */
  onMatchLoaded?: (detail: ODMatchDetail) => void
}

type FetchState =
  | { kind: 'invalid' }
  | { kind: 'loading' }
  | { kind: 'ready'; detail: ODMatchDetail }
  | { kind: 'error'; httpStatus: number | null; retry: () => void }

export function BreakdownsMatchPage({
  matchId,
  onBackToBreakdowns,
  onMatchLoaded,
}: BreakdownsMatchPageProps) {
  const [state, setState] = useState<FetchState>(() =>
    !Number.isFinite(matchId) || matchId <= 0
      ? { kind: 'invalid' }
      : { kind: 'loading' }
  )
  const abortRef = useRef<AbortController | null>(null)
  const loadedNotifiedRef = useRef(false)

  function load() {
    if (!Number.isFinite(matchId) || matchId <= 0) {
      setState({ kind: 'invalid' })
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    // Cache hit short-circuit (indefinite TTL — pro match data is immutable).
    const cached = getCachedMatch(matchId)
    if (cached) {
      setState({ kind: 'ready', detail: cached })
      return
    }

    setState({ kind: 'loading' })
    fetchMatchDetail(matchId, ac.signal)
      .then((detail) => {
        setCachedMatch(matchId, detail)
        setState({ kind: 'ready', detail })
      })
      .catch((err) => {
        if ((err as Error).name === 'AbortError') return
        const status = err instanceof HttpError ? err.status : null
        setState({ kind: 'error', httpStatus: status, retry: load })
      })
  }

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId])

  // Notify parent once when the match data first lands. Lets App.tsx update
  // document.title to "{Radiant} {score}-{score} {Dire} — DotaWR Breakdowns".
  useEffect(() => {
    if (state.kind === 'ready' && !loadedNotifiedRef.current) {
      loadedNotifiedRef.current = true
      onMatchLoaded?.(state.detail)
    }
    if (state.kind !== 'ready') {
      loadedNotifiedRef.current = false
    }
  }, [state, onMatchLoaded])

  return (
    <>
      <BreakdownsDisclaimer />
      <section className="dwr-breakdowns-match">
        {state.kind === 'invalid' && (
          <InvalidMatchId matchId={matchId} onBackToBreakdowns={onBackToBreakdowns} />
        )}
        {state.kind === 'loading' && <LoadingShell matchId={matchId} />}
        {state.kind === 'error' && (
          <ErrorView
            matchId={matchId}
            httpStatus={state.httpStatus}
            onRetry={state.retry}
            onBackToBreakdowns={onBackToBreakdowns}
          />
        )}
        {state.kind === 'ready' && (
          <ReadyView detail={state.detail} onBackToBreakdowns={onBackToBreakdowns} />
        )}
      </section>
    </>
  )
}

function InvalidMatchId({
  matchId,
  onBackToBreakdowns,
}: {
  matchId: number
  onBackToBreakdowns: () => void
}) {
  return (
    <div className="dwr-breakdowns-error" role="alert">
      <p className="dwr-breakdowns-error-title">That match ID doesn't look right</p>
      <p className="dwr-breakdowns-error-body">
        {Number.isFinite(matchId) ? matchId : 'The URL'} isn't a valid OpenDota match ID.
        Match IDs are positive integers (e.g. 8791604589).
      </p>
      <button type="button" className="dwr-btn" onClick={onBackToBreakdowns}>
        Back to Breakdowns
      </button>
    </div>
  )
}

function LoadingShell({ matchId }: { matchId: number }) {
  return (
    <>
      <header className="dwr-breakdowns-match-head">
        <div className="dwr-breakdowns-match-eyebrow">MATCH {matchId}</div>
        <div className="skeleton-line lg" />
        <div className="skeleton-line md" />
      </header>
      <div className="dwr-breakdowns-match-body">
        <div className="skeleton-line lg" />
        <div className="skeleton-line lg" />
        <div className="skeleton-line lg" />
        <div className="skeleton-line lg" />
      </div>
    </>
  )
}

function ErrorView({
  matchId,
  httpStatus,
  onRetry,
  onBackToBreakdowns,
}: {
  matchId: number
  httpStatus: number | null
  onRetry: () => void
  onBackToBreakdowns: () => void
}) {
  let title: string
  let body: string
  if (httpStatus === 404) {
    title = `Couldn't load match ${matchId}`
    body = "OpenDota doesn't have data for that match — it may not exist, or it may not be a public pro match."
  } else if (httpStatus === 429) {
    // Distinct from generic 5xx per spec §1.2.
    title = "OpenDota's daily call limit"
    body = "OpenDota's free tier limits 3000 calls per day per IP. Try tomorrow, or get your own key at opendota.com/api-keys."
  } else if (httpStatus != null && httpStatus >= 500) {
    title = "OpenDota's having a moment"
    body = "Try again in a minute. Status: status.opendota.com"
  } else {
    title = `Couldn't load match ${matchId}`
    body = httpStatus
      ? `Request failed (HTTP ${httpStatus}). Try again, or head back to the listing.`
      : 'Request failed. Try again, or head back to the listing.'
  }
  return (
    <div className="dwr-breakdowns-error" role="alert">
      <p className="dwr-breakdowns-error-title">{title}</p>
      <p className="dwr-breakdowns-error-body">{body}</p>
      <div className="dwr-breakdowns-error-actions">
        <button type="button" className="dwr-btn" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="dwr-btn ghost" onClick={onBackToBreakdowns}>
          Back to Breakdowns
        </button>
      </div>
    </div>
  )
}

function ReadyView({
  detail,
  onBackToBreakdowns,
}: {
  detail: ODMatchDetail
  onBackToBreakdowns: () => void
}) {
  // Match-detail responses include team objects + leagueid that aren't on
  // ODMatchDetail's narrow type — read defensively.
  const d = detail as ODMatchDetail & {
    radiant_team?: { name?: string | null }
    dire_team?: { name?: string | null }
    league?: { name?: string | null }
    radiant_score?: number
    dire_score?: number
  }
  const radiantName = d.radiant_team?.name ?? 'Radiant'
  const direName = d.dire_team?.name ?? 'Dire'
  const leagueName = d.league?.name ?? null
  const radiantScore = d.radiant_score ?? 0
  const direScore = d.dire_score ?? 0
  const radiantWon = d.radiant_win
  const dotabuffUrl = `https://www.dotabuff.com/matches/${detail.match_id}`

  return (
    <>
      <header className="dwr-breakdowns-match-head">
        <div className="dwr-breakdowns-match-eyebrow">
          MATCH {detail.match_id}
        </div>
        <h1 className="dwr-breakdowns-match-teams">
          <span className={radiantWon ? 'win' : 'lose'}>{radiantName}</span>
          <span className="score">
            {' '}
            {radiantScore} <span className="dash">—</span> {direScore}{' '}
          </span>
          <span className={!radiantWon ? 'win' : 'lose'}>{direName}</span>
        </h1>
        <div className="dwr-breakdowns-match-meta">
          {leagueName && <span>{leagueName}</span>}
          {leagueName && <span className="sep">·</span>}
          <span>{formatDurationLong(detail.duration)}</span>
          <span className="sep">·</span>
          <span>{formatEnded(detail.start_time, detail.duration)}</span>
          <span className="sep">·</span>
          <a href={dotabuffUrl} target="_blank" rel="noreferrer">
            Watch on Dotabuff
          </a>
        </div>
        <div className="dwr-breakdowns-match-back">
          <button type="button" className="dwr-link-btn" onClick={onBackToBreakdowns}>
            ← Back to Breakdowns
          </button>
        </div>
      </header>

      <div className="dwr-breakdowns-match-body">
        <BreakdownsLeadLines detail={detail} />

        <BreakdownsPlayerGrid detail={detail} />

        <BreakdownsMatchSections detail={detail} />

        <details className="dwr-breakdowns-match-raw">
          <summary>Raw /matches/{detail.match_id} payload (JSON)</summary>
          <pre>{JSON.stringify(detail, null, 2)}</pre>
        </details>
      </div>
    </>
  )
}

function formatDurationLong(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatEnded(startUnix: number, duration: number): string {
  const endUnix = startUnix + duration
  if (!Number.isFinite(endUnix) || endUnix <= 0) return 'Ended recently'
  const then = new Date(endUnix * 1000)
  const diffMs = Date.now() - then.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (diffMin < 60) return `Ended ${Math.max(diffMin, 1)} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `Ended ${diffHr} hr ago`
  const diffDay = Math.floor(diffHr / 24)
  return `Ended ${diffDay} day${diffDay === 1 ? '' : 's'} ago`
}
