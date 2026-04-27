import { useEffect, useMemo, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Loader } from './components/Loader'
import { ReportGrid } from './components/ReportGrid'
import { Footer } from './components/Footer'
import { DeepDive } from './components/DeepDive'
import { HonestModeToggle } from './components/HonestModeToggle'
import { ChangelogPage } from './components/ChangelogPage'
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
import {
  FREE_TIER_MATCH_LIMIT,
  MAX_DETAIL_FETCH,
  PAID_TIER_MATCH_LIMIT,
} from './lib/license'
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
}

type AppStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; stage: string; done?: number; total?: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: ReportState }

type RoleFilter = 'all' | 'core' | 'support'

function App() {
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' })
  const [isPaid, setIsPaid] = useState(false)
  const [honestMode, setHonestMode] = useState(false)
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  // Language is fixed to English at launch. The Taglish templates live in
  // lib/honest-mode/taglish-templates.ts as a paid-tier feature; once
  // wired up, this becomes useState<HonestLanguage>('english') again.
  const language: HonestLanguage = 'english'
  const [route, setRoute] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/'
  )
  const lastInputRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const heroesLoadedRef = useRef(false)

  // Browser back/forward syncs into our route state. We only push state
  // from goHome()/goChangelog(); everything else is read-only.
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

  // Fetch the hero index once on mount; falls back to "Hero N" if it fails.
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

  async function analyze(raw: string, paid: boolean = isPaid) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    lastInputRef.current = raw

    const parsed = parseAccountInput(raw)
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error })
      return
    }

    const matchLimit = paid ? PAID_TIER_MATCH_LIMIT : FREE_TIER_MATCH_LIMIT

    try {
      setStatus({ kind: 'loading', stage: 'Looking up profile…' })
      const profile = await fetchPlayerProfile(parsed.accountId, ac.signal)

      setStatus({ kind: 'loading', stage: `Fetching last ${matchLimit} matches…` })
      const allMatches = await fetchPlayerMatches(parsed.accountId, matchLimit, ac.signal)

      if (allMatches.length === 0) {
        setStatus({
          kind: 'error',
          message: 'No matches found for that account. Make sure your match history is public on Dota 2.',
        })
        return
      }

      const matches = allMatches
      const matchesToDetailFetch = matches.slice(0, MAX_DETAIL_FETCH)
      const ids = matchesToDetailFetch.map((m) => m.match_id)

      setStatus({ kind: 'loading', stage: 'Fetching match details…', done: 0, total: ids.length })
      const details = await fetchAllMatchDetails(
        ids,
        ({ done, total }) =>
          setStatus({ kind: 'loading', stage: `Fetching match ${done}/${total}…`, done, total }),
        ac.signal
      )

      const unparsedCount = matchesToDetailFetch.filter((m) => {
        const d = details[m.match_id]
        return !d || d.version == null
      }).length

      if (unparsedCount > 0) {
        setStatus({
          kind: 'loading',
          stage: `Parsing replays (this can take a minute)…`,
          done: 0,
          total: unparsedCount,
        })
        await parseMatches(matchesToDetailFetch, details, {
          concurrency: 5,
          // Parse-phase tuning: skip the first ~15s of polling (OpenDota
          // parses almost never finish in <15s), then poll every 7s up to
          // 90s. Faster than the old 5s/90s loop without dropping long-
          // tail matches that legitimately need the full 90s window
          // during peak parse-queue hours.
          initialDelayMs: 15_000,
          pollIntervalMs: 7_000,
          timeoutMs: 90_000,
          onProgress: ({ done, total }) =>
            setStatus({
              kind: 'loading',
              stage: `Parsing match ${Math.min(done + 1, total)}/${total}…`,
              done,
              total,
            }),
          signal: ac.signal,
        })
      }

      setStatus({ kind: 'loading', stage: 'Crunching analyses…' })

      // Reset the role filter on every fresh analysis so a new account
      // doesn't inherit the previous run's filter (which might be invalid
      // for the new player's match shape).
      setRoleFilter('all')

      setStatus({
        kind: 'ready',
        report: {
          profile,
          matches,
          details,
          totalAvailable: allMatches.length,
          accountId: parsed.accountId,
        },
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      const message =
        err instanceof Error ? err.message : 'Something went wrong fetching your data.'
      setStatus({ kind: 'error', message })
    }
  }

  function unlock(key: string) {
    setIsPaid(true)
    void key
    if (status.kind === 'ready' && lastInputRef.current) {
      analyze(lastInputRef.current, true)
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

  const errorMessage = status.kind === 'error' ? status.message : null
  const isReady = status.kind === 'ready'

  // When the report finishes loading, jump back to the top so the user sees
  // the user card and the first row of analyses without scrolling.
  useEffect(() => {
    if (status.kind === 'ready' && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [status.kind])

  const isChangelog = route === '/changelog'

  // Per-match role classification for the role-split toggle. Computed
  // once per report from the full match window — independent of the
  // current filter.
  const roleSplit = useMemo<RoleSplit | null>(() => {
    if (status.kind !== 'ready') return null
    return computeRoleSplit(
      status.report.matches,
      status.report.details,
      status.report.accountId
    )
  }, [status])

  // Filter the match list to whatever the user picked. If the toggle
  // isn't eligible (rare role mix), we lock to 'all' so a stale filter
  // can't silently empty the report.
  const effectiveFilter: RoleFilter = roleSplit?.isEligible ? roleFilter : 'all'

  const filteredMatches = useMemo<ODMatchSummary[]>(() => {
    if (status.kind !== 'ready') return []
    if (effectiveFilter === 'all' || !roleSplit) return status.report.matches
    return status.report.matches.filter(
      (m) => roleSplit.byMatch[m.match_id] === effectiveFilter
    )
  }, [status, roleSplit, effectiveFilter])

  // Re-run all 9 analyses against the filtered subset. inferRole runs on
  // the filtered subset too, which means "Core only" view shows core
  // baselines and "Support only" shows support baselines automatically.
  //
  // Stored in state (not useMemo) on purpose: useMemo is "best-effort
  // caching" and can drop the cached value across innocuous re-renders.
  // When that happens, `results` becomes a new array reference, Recharts
  // inside the bottom-row cards thinks its `data` prop is new, and
  // ResponsiveContainer briefly measures off-screen children at 0 height
  // — making the last row collapse until a window resize forces a
  // repaint. Pinning to useState + useEffect keeps the reference stable
  // across honest-mode toggles and other unrelated re-renders.
  const [reportComputed, setReportComputed] = useState<{
    results: AnalysisResult[]
    inferredRole: 'core' | 'support' | 'flex' | 'unknown'
  } | null>(null)
  useEffect(() => {
    if (status.kind !== 'ready') {
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

  return (
    <div className="dwr" data-honest={honestMode ? 'true' : 'false'}>
      <div className="cosmos" />

      {isChangelog ? (
        <ChangelogPage onHome={goHome} />
      ) : (
        <>
          <Hero
            onAnalyze={(raw) => analyze(raw)}
            isLoading={status.kind === 'loading'}
            error={errorMessage}
            showLanding={!isReady}
            onHome={goHome}
            loaderSlot={
              status.kind === 'loading' ? (
                <Loader stage={status.stage} done={status.done} total={status.total} />
              ) : null
            }
          />

          {isReady && reportComputed && roleSplit && (
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
              <ReportGrid
                results={reportComputed.results}
                matchCount={filteredMatches.length}
                isPaid={isPaid}
                honestMode={honestMode}
                language={language}
                accountId={status.report.profile.profile?.account_id ?? 0}
                roleFilter={effectiveFilter}
              />
              {isPaid && <DeepDive matches={filteredMatches} />}
            </>
          )}
        </>
      )}

      <Footer
        isPaid={isPaid}
        onUnlock={unlock}
        onHome={goHome}
        onChangelog={goChangelog}
        showCta={!isChangelog}
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
  // When the user is filtering to Core or Support, the role label shows
  // the filtered count to make it obvious what subset they're viewing.
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
          <span className={`dwr-badge ${isPaid ? 'paid' : ''}`}>{isPaid ? 'Paid' : 'Free'}</span>
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
