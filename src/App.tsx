import { useEffect, useMemo, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Loader } from './components/Loader'
import { ReportGrid } from './components/ReportGrid'
import { Footer } from './components/Footer'
import { DeepDive } from './components/DeepDive'
import { HonestModeToggle } from './components/HonestModeToggle'
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
  const [honestMode, setHonestMode] = useState(false)
  // Language is fixed to English at launch. The Taglish templates live in
  // lib/honest-mode/taglish-templates.ts as a paid-tier feature; once
  // wired up, this becomes useState<HonestLanguage>('english') again.
  const language: HonestLanguage = 'english'
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
    if (status.kind === 'ready' && lastInputRef.current) {
      analyze(lastInputRef.current, true)
    }
  }

  function goHome() {
    abortRef.current?.abort()
    lastInputRef.current = null
    setHonestMode(false)
    setStatus({ kind: 'idle' })
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
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

  return (
    <div className="dwr" data-honest={honestMode ? 'true' : 'false'}>
      <div className="cosmos" />

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

      {isReady && (
        <>
          <ProfileBar
            profile={status.report.profile}
            matchCount={status.report.matches.length}
            isPaid={isPaid}
            honestMode={honestMode}
            onToggleHonestMode={setHonestMode}
          />
          <ReportGrid
            results={status.report.results}
            matchCount={status.report.matches.length}
            isPaid={isPaid}
            honestMode={honestMode}
            language={language}
            accountId={status.report.profile.profile?.account_id ?? 0}
          />
          {isPaid && <DeepDive matches={status.report.matches} />}
        </>
      )}

      <Footer isPaid={isPaid} onUnlock={unlock} onHome={goHome} />
    </div>
  )
}

function ProfileBar({
  profile,
  matchCount,
  isPaid,
  honestMode,
  onToggleHonestMode,
}: {
  profile: ODPlayerProfile
  matchCount: number
  isPaid: boolean
  honestMode: boolean
  onToggleHonestMode: (v: boolean) => void
}) {
  const name = profile.profile?.personaname ?? 'Anonymous player'
  const rank = useMemo(() => rankLabel(profile.rank_tier), [profile.rank_tier])
  const bucket = useMemo(
    () => rankBucketLabel(rankBucketFromTier(profile.rank_tier)),
    [profile.rank_tier]
  )
  const initial = (name.trim()[0] ?? 'A').toUpperCase()
  const avatarUrl = profile.profile?.avatarfull

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
            <span className="sep">·</span>
            <span>baselines tuned for {bucket}</span>
            <span className="sep">·</span>
            <span>{matchCount} matches analyzed</span>
          </div>
        </div>
        <div className="dwr-badges">
          <span className={`dwr-badge ${isPaid ? 'paid' : ''}`}>{isPaid ? 'Paid' : 'Free'}</span>
          <HonestModeToggle enabled={honestMode} onToggle={onToggleHonestMode} />
        </div>
      </div>
    </section>
  )
}

export default App
