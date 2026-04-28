import { useEffect, useMemo, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Loader } from './components/Loader'
import { ReportGrid } from './components/ReportGrid'
import { Footer } from './components/Footer'
import { DeepDive } from './components/DeepDive'
import { HonestModeToggle } from './components/HonestModeToggle'
import { ChangelogPage } from './components/ChangelogPage'
import { MmrMathPage } from './components/MmrMathPage'
import { MetaPage } from './components/MetaPage'
import { TopNav, type NavRoute } from './components/TopNav'
import { ProgressStrip, type ReportPhase } from './components/ProgressStrip'
import {
  fetchAllMatchDetails,
  fetchHeroes,
  fetchPlayerMatches,
  fetchPlayerProfile,
  parseMatches,
} from './api/opendota'
import { parseAccountInput } from './lib/parseInput'
import { runAllAnalyses } from './analyses'
import { computeRoleSplit, inferRole, type RoleSplit } from './lib/matchHelpers'
import { rankBucketFromTier, rankBucketLabel, rankLabel } from './lib/baselines'
import { getHeroName, setHeroes } from './lib/heroes'
import { FREE_TIER_MATCH_LIMIT, MAX_DETAIL_FETCH } from './lib/license'
import type {
  AnalysisResult,
  HonestLanguage,
  ODMatchDetail,
  ODMatchSummary,
  ODPlayerProfile,
  ReportInput,
} from './types'

interface ReportState {
  profile: ODPlayerProfile
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  totalAvailable: number
  accountId: number
  phase: ReportPhase
  detailsFetched: number
  totalDetails: number
  parsedCount: number
  unparsedRemaining: number
  stalledCount: number
  totalToParse: number
}

type AppStatus =
  | { kind: 'idle' }
  | { kind: 'preparing'; stage: string }
  | { kind: 'error'; message: string }
  | { kind: 'streaming'; report: ReportState }

type RoleFilter = 'all' | 'core' | 'support'

function App() {
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' })
  // Paid tier UI is unwired pending Gumroad — `validateLicenseKey` in
  // src/lib/license.ts and the FREE/PAID/MAX_DETAIL_FETCH constants are
  // kept so that re-wiring later is just adding a license input back in.
  const isPaid = false
  const [honestMode, setHonestMode] = useState(false)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const language: HonestLanguage = 'english'
  const [route, setRoute] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  )
  const lastInputRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const heroesLoadedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onPop = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function navigate(path: string) {
    if (typeof window === 'undefined') return
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path)
    }
    setRoute(path)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  useEffect(() => {
    if (heroesLoadedRef.current) return
    heroesLoadedRef.current = true
    fetchHeroes()
      .then((heroes) => setHeroes(heroes))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('Hero index unavailable; falling back to numeric IDs.', err)
      })
  }, [])

  async function analyze(raw: string) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    lastInputRef.current = raw

    const parsed = parseAccountInput(raw)
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error })
      return
    }

    const matchLimit = FREE_TIER_MATCH_LIMIT

    try {
      setStatus({ kind: 'preparing', stage: 'Looking up profile…' })
      const profile = await fetchPlayerProfile(parsed.accountId, ac.signal)

      setStatus({ kind: 'preparing', stage: `Fetching last ${matchLimit} matches…` })
      const allMatches = await fetchPlayerMatches(parsed.accountId, matchLimit, ac.signal)

      if (allMatches.length === 0) {
        setStatus({
          kind: 'error',
          message:
            'No matches found for that account. Make sure your match history is public on Dota 2.',
        })
        return
      }

      // Reset the role filter on every fresh analysis so a new account
      // doesn't inherit the previous run's filter.
      setRoleFilter('all')

      const matchesToDetailFetch = allMatches.slice(0, MAX_DETAIL_FETCH)
      const ids = matchesToDetailFetch.map((m) => m.match_id)

      // Render the report skeleton immediately. Tier-1 cards (hero pool,
      // tilt) work straight off the matches list. Tier-2/3 cards stay in
      // their "waiting for first parsed match" state until details + parses
      // arrive below.
      const initialReport: ReportState = {
        profile,
        matches: allMatches,
        details: {},
        totalAvailable: allMatches.length,
        accountId: parsed.accountId,
        phase: 'fetching-details',
        detailsFetched: 0,
        totalDetails: ids.length,
        parsedCount: 0,
        unparsedRemaining: 0,
        stalledCount: 0,
        totalToParse: 0,
      }
      setStatus({ kind: 'streaming', report: initialReport })

      // Mutable details map — fetchAllMatchDetails writes into it via the
      // callback below, and we publish a fresh shallow copy into React state
      // on each update so the analyses pipeline re-runs.
      const liveDetails: Record<number, ODMatchDetail> = {}

      await fetchAllMatchDetails(
        ids,
        (id, detail, prog) => {
          if (detail) liveDetails[id] = detail
          setStatus((prev) => {
            if (prev.kind !== 'streaming') return prev
            return {
              kind: 'streaming',
              report: {
                ...prev.report,
                details: { ...liveDetails },
                detailsFetched: prog.done,
              },
            }
          })
        },
        ac.signal
      )

      // Detail-fetch phase is done. Some of those matches may already be
      // parsed (OpenDota cached them) — skip those and only request parses
      // for the rest.
      const unparsedIds = matchesToDetailFetch.filter((m) => {
        const d = liveDetails[m.match_id]
        return !d || d.version == null
      })
      const alreadyParsed = matchesToDetailFetch.length - unparsedIds.length

      setStatus((prev) => {
        if (prev.kind !== 'streaming') return prev
        return {
          kind: 'streaming',
          report: {
            ...prev.report,
            phase: unparsedIds.length === 0 ? 'done' : 'parsing',
            parsedCount: alreadyParsed,
            unparsedRemaining: unparsedIds.length,
            stalledCount: 0,
            totalToParse: unparsedIds.length,
          },
        }
      })

      if (unparsedIds.length > 0) {
        await parseMatches(unparsedIds, liveDetails, {
          concurrency: 5,
          initialDelayMs: 15_000,
          pollIntervalMs: 7_000,
          timeoutMs: 90_000,
          // 3-min hard ceiling per the progressive-render spec — after this
          // we mark the match stalled and let the user refresh to retry.
          stallTimeoutMs: 180_000,
          onMatchResolved: (_id, _detail, outcome) => {
            setStatus((prev) => {
              if (prev.kind !== 'streaming') return prev
              const r = prev.report
              return {
                kind: 'streaming',
                report: {
                  ...r,
                  details: { ...liveDetails },
                  unparsedRemaining: Math.max(0, r.unparsedRemaining - 1),
                  parsedCount: outcome === 'parsed' ? r.parsedCount + 1 : r.parsedCount,
                  stalledCount: outcome === 'stalled' ? r.stalledCount + 1 : r.stalledCount,
                },
              }
            })
          },
          signal: ac.signal,
        })
      }

      // Final flip to 'done' so the progress strip transitions to its
      // resting state.
      setStatus((prev) => {
        if (prev.kind !== 'streaming') return prev
        return {
          kind: 'streaming',
          report: { ...prev.report, phase: 'done' },
        }
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const message =
        err instanceof Error ? err.message : 'Something went wrong fetching your data.'
      setStatus({ kind: 'error', message })
    }
  }

  function goHome() {
    abortRef.current?.abort()
    lastInputRef.current = null
    setHonestMode(false)
    setRoleFilter('all')
    setStatus({ kind: 'idle' })
    navigate('/')
  }

  function goChangelog() {
    navigate('/changelog')
  }

  function navByRoute(r: NavRoute) {
    if (r === 'report') {
      // If user has analyzed, just navigate back to "/" without resetting
      // their report state (so they can flip between pages without
      // re-running analysis).
      navigate('/')
    } else if (r === 'mmr-math') {
      navigate('/mmr-math')
    } else if (r === 'meta') {
      navigate('/meta')
    }
  }

  const errorMessage = status.kind === 'error' ? status.message : null
  const isPreparing = status.kind === 'preparing'
  const isStreaming = status.kind === 'streaming'

  // When the report skeleton first appears, jump back to the top so the
  // user sees the user card and the first row of analyses without scrolling.
  // We only fire this on the *transition* into streaming, not on every
  // streaming update — otherwise mid-load updates would yank the page back.
  const lastStatusKindRef = useRef<AppStatus['kind']>('idle')
  useEffect(() => {
    const prev = lastStatusKindRef.current
    lastStatusKindRef.current = status.kind
    if (prev !== 'streaming' && status.kind === 'streaming' && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [status.kind])

  const isChangelog = route === '/changelog'
  const isMmrMath = route === '/mmr-math'
  const isMeta = route === '/meta'
  const isReportRoute = !isChangelog && !isMmrMath && !isMeta

  // Per-match role classification for the role-split toggle. Recomputed
  // whenever the live details map changes — early on when most matches
  // are unparsed, classification falls back to the summary-only KDA
  // heuristic; as parses complete it gets sharper.
  const roleSplit = useMemo<RoleSplit | null>(() => {
    if (status.kind !== 'streaming') return null
    const split = computeRoleSplit(
      status.report.matches,
      status.report.details,
      status.report.accountId
    )
    // Diagnostic log so we can see which side of the eligibility threshold
    // a given account lands on. The toggle only appears when both subsets
    // are >= ROLE_SPLIT_MIN_GAMES (10), so genuinely flex-mixed accounts
    // showing 9/41 here would explain a missing toggle.
    if (status.report.phase === 'done') {
      // eslint-disable-next-line no-console
      console.debug('[role-split] eligibility', {
        coreCount: split.coreCount,
        supportCount: split.supportCount,
        isEligible: split.isEligible,
        totalMatches: status.report.matches.length,
      })
    }
    return split
  }, [status])

  const effectiveFilter: RoleFilter = roleSplit?.isEligible ? roleFilter : 'all'

  const filteredMatches = useMemo<ODMatchSummary[]>(() => {
    if (status.kind !== 'streaming') return []
    if (effectiveFilter === 'all' || !roleSplit) return status.report.matches
    return status.report.matches.filter(
      (m) => roleSplit.byMatch[m.match_id] === effectiveFilter
    )
  }, [status, roleSplit, effectiveFilter])

  // Re-run all 9 analyses against the filtered subset whenever data
  // changes. Stored in state (not useMemo) on purpose — see CLAUDE.md
  // ("Don't move reportComputed back to useMemo") for the bottom-row
  // flicker root cause. We don't debounce: detail-fetch updates already
  // arrive ~1/s thanks to the rate limiter, and parse completions are
  // even sparser. The analyses themselves are cheap (well under 50ms in
  // aggregate), so running them on each update keeps the cards' footnotes
  // honest in real time.
  const [reportComputed, setReportComputed] = useState<{
    results: AnalysisResult[]
    inferredRole: 'core' | 'support' | 'flex' | 'unknown'
  } | null>(null)
  useEffect(() => {
    if (status.kind !== 'streaming') {
      setReportComputed(null)
      return
    }
    const { profile, details, accountId } = status.report
    const { role: inferredRole, distribution: roleDistribution } = inferRole(
      filteredMatches,
      details,
      accountId
    )
    const reportInput: ReportInput = {
      accountId,
      matches: filteredMatches,
      details,
      rankTier: profile.rank_tier ?? null,
      inferredRole,
      roleDistribution,
      rankBucket: rankBucketFromTier(profile.rank_tier),
      heroName: getHeroName,
    }
    const results = runAllAnalyses(reportInput)
    setReportComputed({ results, inferredRole })
  }, [status, filteredMatches])

  const reportPhase: ReportPhase | null = isStreaming ? status.report.phase : null

  // The report state lives in `status` and is preserved across page
  // navigation — flipping to /mmr-math or /meta won't reset analysis.
  // /mmr-math and /meta only need the profile + matches summary, both
  // of which are populated as soon as streaming starts (the parse phase
  // doesn't add anything they care about).
  const reportProfile =
    status.kind === 'streaming' ? status.report.profile : null
  const reportMatches =
    status.kind === 'streaming' ? status.report.matches : null

  return (
    <div className="dwr" data-honest={honestMode ? 'true' : 'false'}>
      <div className="cosmos" />

      {isChangelog && <ChangelogPage onHome={goHome} />}

      {isMmrMath && (
        <>
          <TopNav
            active="mmr-math"
            reportDisabled={!isStreaming && !isPreparing}
            onNavigate={navByRoute}
          />
          <MmrMathPage
            profile={reportProfile}
            matches={reportMatches}
            onAnalyze={(raw) => analyze(raw)}
            isLoading={isPreparing}
            error={errorMessage}
          />
        </>
      )}

      {isMeta && (
        <>
          <TopNav
            active="meta"
            reportDisabled={!isStreaming && !isPreparing}
            onNavigate={navByRoute}
          />
          <MetaPage profile={reportProfile} matches={reportMatches} />
        </>
      )}

      {isReportRoute && (
        <>
          <TopNav
            active="report"
            reportDisabled={!isStreaming && !isPreparing}
            onNavigate={navByRoute}
          />
          {!isStreaming && (
            <Hero
              onAnalyze={(raw) => analyze(raw)}
              isLoading={isPreparing}
              error={errorMessage}
              showLanding={!isStreaming}
              onHome={goHome}
              hideHeader
              loaderSlot={
                isPreparing ? <Loader stage={(status as { stage: string }).stage} /> : null
              }
            />
          )}

          {isStreaming && reportComputed && roleSplit && (
            <>
              <ProfileBar
                profile={status.report.profile}
                matchCount={filteredMatches.length}
                totalMatches={status.report.matches.length}
                inferredRole={reportComputed.inferredRole}
                isPaid={isPaid}
                honestMode={honestMode}
                onToggleHonestMode={setHonestMode}
                roleSplit={roleSplit}
                roleFilter={effectiveFilter}
                onRoleFilterChange={setRoleFilter}
              />
              {reportPhase && reportPhase !== 'done' && (
                <ProgressStrip
                  phase={reportPhase}
                  detailsFetched={status.report.detailsFetched}
                  totalDetails={status.report.totalDetails}
                  parsedCount={status.report.parsedCount}
                  unparsedRemaining={status.report.unparsedRemaining}
                  stalledCount={status.report.stalledCount}
                  totalToParse={status.report.totalToParse}
                />
              )}
              {reportPhase === 'done' && status.report.stalledCount > 0 && (
                <ProgressStrip
                  phase="done"
                  detailsFetched={status.report.detailsFetched}
                  totalDetails={status.report.totalDetails}
                  parsedCount={status.report.parsedCount}
                  unparsedRemaining={0}
                  stalledCount={status.report.stalledCount}
                  totalToParse={status.report.totalToParse}
                />
              )}
              <ReportGrid
                results={reportComputed.results}
                matchCount={filteredMatches.length}
                honestMode={honestMode}
                language={language}
                accountId={status.report.profile.profile?.account_id ?? 0}
                roleFilter={effectiveFilter}
                phase={reportPhase ?? 'done'}
              />
              {isPaid && <DeepDive matches={filteredMatches} />}
            </>
          )}
        </>
      )}

      <Footer
        onHome={goHome}
        onChangelog={goChangelog}
        showCta={isReportRoute}
      />
    </div>
  )
}

function ProfileBar({
  profile,
  matchCount,
  totalMatches,
  inferredRole,
  isPaid,
  honestMode,
  onToggleHonestMode,
  roleSplit,
  roleFilter,
  onRoleFilterChange,
}: {
  profile: ODPlayerProfile
  matchCount: number
  totalMatches: number
  inferredRole: 'core' | 'support' | 'flex' | 'unknown'
  isPaid: boolean
  honestMode: boolean
  onToggleHonestMode: (v: boolean) => void
  roleSplit: RoleSplit
  roleFilter: RoleFilter
  onRoleFilterChange: (f: RoleFilter) => void
}) {
  const name = profile.profile?.personaname ?? 'Anonymous player'
  const rank = useMemo(() => rankLabel(profile.rank_tier), [profile.rank_tier])
  const bucket = useMemo(
    () => rankBucketLabel(rankBucketFromTier(profile.rank_tier)),
    [profile.rank_tier]
  )
  const initial = (name.trim()[0] ?? 'A').toUpperCase()
  const avatarUrl = profile.profile?.avatarfull
  const roleLabel =
    roleFilter === 'core'
      ? `Core (${matchCount} games)`
      : roleFilter === 'support'
      ? `Support (${matchCount} games)`
      : inferredRole === 'core' ? 'Core'
      : inferredRole === 'support' ? 'Support'
      : inferredRole === 'flex' ? 'Flex'
      : null

  return (
    <section className="dwr-report-head">
      <div className="dwr-user">
        <div className="dwr-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            initial
          )}
        </div>
        <div className="dwr-user-info">
          <div className="dwr-user-name">{name}</div>
          <div className="dwr-user-meta">
            <span className="rank">{rank}</span>
            {roleLabel && (
              <>
                <span className="sep">·</span>
                <span>{roleLabel}</span>
              </>
            )}
            <span className="sep">·</span>
            <span>baselines tuned for {bucket}</span>
            <span className="sep">·</span>
            <span>{matchCount} matches analyzed</span>
          </div>
          {!roleSplit.isEligible && (
            <div className="dwr-user-hint">
              Role split view (Core only / Support only) hidden — needs ≥10 games as both core and support. Your mix: {roleSplit.coreCount} core / {roleSplit.supportCount} support.
            </div>
          )}
        </div>
        <div className="dwr-badges">
          {roleSplit.isEligible && (
            <RoleFilterToggle
              filter={roleFilter}
              onChange={onRoleFilterChange}
              totalCount={totalMatches}
              coreCount={roleSplit.coreCount}
              supportCount={roleSplit.supportCount}
            />
          )}
          {/* "Free" badge removed — it floated without context for new users.
              Paid status (when unlocked) still shows so the user can see their
              license took. Tier info lives in the unlock CTA at the bottom. */}
          {isPaid && <span className="dwr-badge paid">Paid</span>}
          <HonestModeToggle enabled={honestMode} onToggle={onToggleHonestMode} />
        </div>
      </div>
    </section>
  )
}

function RoleFilterToggle({
  filter,
  onChange,
  totalCount,
  coreCount,
  supportCount,
}: {
  filter: RoleFilter
  onChange: (f: RoleFilter) => void
  totalCount: number
  coreCount: number
  supportCount: number
}) {
  const opts: { value: RoleFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All games', count: totalCount },
    { value: 'core', label: 'Core only', count: coreCount },
    { value: 'support', label: 'Support only', count: supportCount },
  ]
  return (
    <div
      className="dwr-role-filter"
      role="radiogroup"
      aria-label="Filter analyses by role"
    >
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={filter === o.value}
          className={`dwr-role-filter-opt ${filter === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label} <span className="count">({o.count})</span>
        </button>
      ))}
    </div>
  )
}

export default App
