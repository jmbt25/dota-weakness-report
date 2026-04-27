import { useEffect, useMemo, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Loader } from './components/Loader'
import { ReportGrid } from './components/ReportGrid'
import { Footer } from './components/Footer'
import { DeepDive } from './components/DeepDive'
import {
  fetchAllMatchDetails,
  fetchHeroes,
  fetchPlayerMatches,
  fetchPlayerProfile,
  parseMatches,
} from './api/opendota'
import { parseAccountInput } from './lib/parseInput'
import { runAllAnalyses } from './analyses'
import { inferRole } from './lib/matchHelpers'
import { rankBucketFromTier, rankBucketLabel, rankLabel } from './lib/baselines'
import { getHeroName, setHeroes } from './lib/heroes'
import {
  FREE_TIER_MATCH_LIMIT,
  MAX_DETAIL_FETCH,
  PAID_TIER_MATCH_LIMIT,
} from './lib/license'
import type {
  AnalysisResult,
  ODMatchDetail,
  ODMatchSummary,
  ODPlayerProfile,
  ReportInput,
} from './types'

interface ReportState {
  profile: ODPlayerProfile
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  results: AnalysisResult[]
  totalAvailable: number
}

type AppStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; stage: string; done?: number; total?: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: ReportState }

function App() {
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' })
  const [isPaid, setIsPaid] = useState(false)
  const lastInputRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const heroesLoadedRef = useRef(false)

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
      // Cap detail-fetch to MAX_DETAIL_FETCH most-recent matches. Hero-pool /
      // tilt analyses still see the full window via the summary list; the
      // parsed-only analyses (lane/farm/item/death-timing) operate on this
      // detail subset.
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
          pollIntervalMs: 5000,
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
      const { role: inferredRole, distribution: roleDistribution } = inferRole(
        matches,
        details,
        parsed.accountId
      )
      const reportInput: ReportInput = {
        accountId: parsed.accountId,
        matches,
        details,
        rankTier: profile.rank_tier ?? null,
        inferredRole,
        roleDistribution,
        rankBucket: rankBucketFromTier(profile.rank_tier),
        heroName: getHeroName,
      }
      const results = runAllAnalyses(reportInput)

      setStatus({
        kind: 'ready',
        report: {
          profile,
          matches,
          details,
          results,
          totalAvailable: allMatches.length,
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
    // Re-run the analysis in paid mode if a report is already on-screen.
    if (status.kind === 'ready' && lastInputRef.current) {
      analyze(lastInputRef.current, true)
    }
  }

  const errorMessage = status.kind === 'error' ? status.message : null

  return (
    <div className="min-h-full flex flex-col">
      <Hero
        onAnalyze={(raw) => analyze(raw)}
        isLoading={status.kind === 'loading'}
        error={errorMessage}
      />

      {status.kind === 'loading' && (
        <Loader stage={status.stage} done={status.done} total={status.total} />
      )}

      {status.kind === 'ready' && (
        <>
          <ProfileBar
            profile={status.report.profile}
            matchCount={status.report.matches.length}
            isPaid={isPaid}
          />
          <ReportGrid
            results={status.report.results}
            matchCount={status.report.matches.length}
            isPaid={isPaid}
          />
          {isPaid && <DeepDive matches={status.report.matches} />}
        </>
      )}

      <div className="mt-auto">
        <Footer isPaid={isPaid} onUnlock={unlock} />
      </div>
    </div>
  )
}

function ProfileBar({
  profile,
  matchCount,
  isPaid,
}: {
  profile: ODPlayerProfile
  matchCount: number
  isPaid: boolean
}) {
  const name = profile.profile?.personaname ?? 'Anonymous player'
  const rank = useMemo(() => rankLabel(profile.rank_tier), [profile.rank_tier])
  const bucket = useMemo(
    () => rankBucketLabel(rankBucketFromTier(profile.rank_tier)),
    [profile.rank_tier]
  )
  return (
    <section className="max-w-6xl mx-auto px-6 pt-4 pb-8 w-full">
      <div className="flex items-center gap-5 card">
        {profile.profile?.avatarfull && (
          <img
            src={profile.profile.avatarfull}
            alt=""
            className="h-16 w-16 rounded-lg border border-line"
            referrerPolicy="no-referrer"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold truncate">{name}</div>
          <div className="text-sm text-ink-muted mt-0.5">
            {rank} · baselines tuned for <span className="text-ink">{bucket}</span> · {matchCount} matches analyzed
          </div>
        </div>
        <span className={isPaid ? 'pill-good' : 'pill-muted'}>{isPaid ? 'Paid' : 'Free'}</span>
      </div>
    </section>
  )
}

export default App
