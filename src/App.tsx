import { useMemo, useRef, useState } from 'react'
import { Hero } from './components/Hero'
import { Loader } from './components/Loader'
import { ReportGrid } from './components/ReportGrid'
import { Footer } from './components/Footer'
import { fetchAllMatchDetails, fetchPlayerMatches, fetchPlayerProfile } from './api/opendota'
import { parseAccountInput } from './lib/parseInput'
import { runAllAnalyses } from './analyses'
import { inferRole } from './lib/matchHelpers'
import { rankLabel } from './lib/baselines'
import { FREE_TIER_MATCH_LIMIT, PAID_TIER_MATCH_LIMIT } from './lib/license'
import type {
  AnalysisResult,
  ODMatchDetail,
  ODMatchSummary,
  ODPlayerProfile,
  ReportInput,
} from './types'

interface ReportState {
  profile: ODPlayerProfile
  matches: ODMatchSummary[] // sliced to the tier limit
  details: Record<number, ODMatchDetail>
  results: AnalysisResult[]
  totalAvailable: number // total matches OpenDota returned before slicing
}

type AppStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; stage: string; done?: number; total?: number }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; report: ReportState }

function App() {
  const [status, setStatus] = useState<AppStatus>({ kind: 'idle' })
  const [isPaid, setIsPaid] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const matchLimit = isPaid ? PAID_TIER_MATCH_LIMIT : FREE_TIER_MATCH_LIMIT

  async function analyze(raw: string) {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    const parsed = parseAccountInput(raw)
    if (!parsed.ok) {
      setStatus({ kind: 'error', message: parsed.error })
      return
    }

    try {
      setStatus({ kind: 'loading', stage: 'Looking up profile…' })
      const profile = await fetchPlayerProfile(parsed.accountId, ac.signal)

      setStatus({ kind: 'loading', stage: 'Fetching recent matches…' })
      const allMatches = await fetchPlayerMatches(parsed.accountId, PAID_TIER_MATCH_LIMIT, ac.signal)

      if (allMatches.length === 0) {
        setStatus({
          kind: 'error',
          message: 'No matches found for that account. Make sure your match history is public on Dota 2.',
        })
        return
      }

      const matches = allMatches.slice(0, matchLimit)
      const ids = matches.map((m) => m.match_id)

      setStatus({ kind: 'loading', stage: 'Fetching match details…', done: 0, total: ids.length })
      const details = await fetchAllMatchDetails(
        ids,
        ({ done, total }) =>
          setStatus({ kind: 'loading', stage: `Fetching match ${done}/${total}…`, done, total }),
        ac.signal
      )

      setStatus({ kind: 'loading', stage: 'Crunching analyses…' })
      const inferredRole = inferRole(matches, details, parsed.accountId)
      const reportInput: ReportInput = {
        accountId: parsed.accountId,
        matches,
        details,
        rankTier: profile.rank_tier ?? null,
        inferredRole,
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
        err instanceof Error
          ? err.message
          : 'Something went wrong fetching your data.'
      setStatus({ kind: 'error', message })
    }
  }

  function unlock(key: string) {
    setIsPaid(true)
    // Re-run with the larger window if we already have a report.
    if (status.kind === 'ready') {
      // Use the same account ID we already fetched.
      const accountId = status.report.profile.profile?.account_id
      if (accountId) analyze(String(accountId))
    }
    // (The key is intentionally unused for now; validateLicenseKey already accepted it.)
    void key
  }

  const errorMessage = status.kind === 'error' ? status.message : null

  return (
    <div className="min-h-full flex flex-col">
      <Hero
        onAnalyze={analyze}
        isLoading={status.kind === 'loading'}
        error={errorMessage}
      />

      {status.kind === 'loading' && (
        <Loader stage={status.stage} done={status.done} total={status.total} />
      )}

      {status.kind === 'ready' && (
        <>
          <ProfileBar profile={status.report.profile} matchCount={status.report.matches.length} />
          <ReportGrid
            results={status.report.results}
            matchCount={status.report.matches.length}
            totalAvailable={status.report.totalAvailable}
            isPaid={isPaid}
          />
        </>
      )}

      <div className="mt-auto">
        <Footer isPaid={isPaid} onUnlock={unlock} />
      </div>
    </div>
  )
}

function ProfileBar({ profile, matchCount }: { profile: ODPlayerProfile; matchCount: number }) {
  const name = profile.profile?.personaname ?? 'Anonymous player'
  const rank = useMemo(() => rankLabel(profile.rank_tier), [profile.rank_tier])
  return (
    <section className="max-w-6xl mx-auto px-6 pt-2 pb-6">
      <div className="flex items-center gap-4">
        {profile.profile?.avatarfull && (
          <img
            src={profile.profile.avatarfull}
            alt=""
            className="h-12 w-12 rounded-lg border border-line"
            referrerPolicy="no-referrer"
          />
        )}
        <div>
          <div className="text-lg font-medium">{name}</div>
          <div className="text-xs text-ink-muted">
            {rank} · {matchCount} matches analyzed
          </div>
        </div>
      </div>
    </section>
  )
}

export default App
