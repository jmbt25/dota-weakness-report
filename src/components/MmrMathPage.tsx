import { useState } from 'react'
import type { ODMatchSummary, ODPlayerProfile } from '../types'
import { rankLabel } from '../lib/baselines'
import { didWin } from '../lib/matchHelpers'
import { computeSessionStats } from '../lib/sessionHelpers'
import {
  gamesToBracket,
  mmrToNextBracket,
  nextBracketLabel,
  timeForGames,
} from '../lib/mmrMath'
import { SteamIcon } from './ApertureSigil'

interface MmrMathPageProps {
  /** Current report state (if any) — drives the "real numbers" view. */
  profile: ODPlayerProfile | null
  matches: ODMatchSummary[] | null
  /** Inline form for users who haven't analyzed yet. */
  onAnalyze: (raw: string) => void
  isLoading: boolean
  error?: string | null
}

const BENCHMARK_WR = 0.55

export function MmrMathPage({
  profile,
  matches,
  onAnalyze,
  isLoading,
  error,
}: MmrMathPageProps) {
  const [draft, setDraft] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoading && draft.trim()) onAnalyze(draft.trim())
  }

  const hasData = profile != null && matches != null && matches.length > 0

  // Compute when we have data.
  const computed = hasData ? compute(profile!, matches!) : null

  return (
    <section className="dwr-mmr">
      <div className="dwr-mmr-eyebrow">MMR Math</div>
      <h1 className="dwr-mmr-title">How many games?</h1>

      {!hasData && (
        <>
          <p className="dwr-mmr-empty-prose">
            Paste your Steam ID and we'll calculate how many games to your next
            rank at your current win rate, versus what it would take at 55%.
          </p>

          <form className="dwr-form dwr-mmr-form" onSubmit={submit}>
            <div className="dwr-input-wrap">
              <span className="dwr-input-icon"><SteamIcon /></span>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Paste your Steam ID or Dotabuff URL"
                className="dwr-input"
                autoComplete="off"
                spellCheck={false}
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              className="dwr-btn"
              disabled={isLoading || draft.trim().length === 0}
            >
              {isLoading ? 'Analyzing…' : 'Calculate'}
            </button>
          </form>
          {error && <p className="dwr-error" style={{ textAlign: 'center' }}>{error}</p>}

          <div className="dwr-mmr-divider">
            <span className="line" />
            <span className="diamond" />
            <span className="line" />
          </div>

          <div className="dwr-mmr-sample">
            <div className="dwr-mmr-sample-row">
              At a <b>50% WR</b>, you never reach the next bracket. You stay flat.
            </div>
            <div className="dwr-mmr-sample-row" style={{ marginTop: 6 }}>
              At a <b>55% WR</b>, you reach the next bracket in <b>~180 games</b>
              {' '}— about 3 months at 3 games/day.
            </div>
          </div>
        </>
      )}

      {hasData && computed && <Computed {...computed} />}
    </section>
  )
}

interface ComputedView {
  rank: string
  wr: number
  totalGames: number
  gamesPerDay: number
  immortal: boolean
  smallSample: boolean
  nextBracket: string | null
  currentGames: number | null
  currentTime: ReturnType<typeof timeForGames>
  benchmarkGames: number | null
  benchmarkTime: ReturnType<typeof timeForGames>
  isClimbingTrajectory: boolean
}

function compute(profile: ODPlayerProfile, matches: ODMatchSummary[]): ComputedView {
  const totalGames = matches.length
  const wins = matches.filter(didWin).length
  const wr = totalGames > 0 ? wins / totalGames : 0

  const session = computeSessionStats(matches)
  const gamesPerDay = Math.max(1, session.gamesPerActiveDay || 1)

  const rankTier = profile.rank_tier ?? 0
  const immortal = Math.floor(rankTier / 10) >= 8
  const mmrNeeded = mmrToNextBracket(rankTier)
  const next = nextBracketLabel(rankTier)
  const currentGames = mmrNeeded != null ? gamesToBracket(mmrNeeded, wr) : null
  const benchmarkGames = mmrNeeded != null ? gamesToBracket(mmrNeeded, BENCHMARK_WR) : null
  const currentTime = timeForGames(currentGames, gamesPerDay)
  const benchmarkTime = timeForGames(benchmarkGames, gamesPerDay)

  return {
    rank: rankLabel(rankTier),
    wr,
    totalGames,
    gamesPerDay,
    immortal,
    smallSample: totalGames < 20,
    nextBracket: next,
    currentGames,
    currentTime,
    benchmarkGames,
    benchmarkTime,
    // "Climbing" framing only when meaningfully above 51% WR — between
    // 49% and 51% the math doesn't give a useful answer (calibration
    // adjustments + behavior modifiers move slowly), so we route those
    // users to the "thousands of games" branch.
    isClimbingTrajectory: wr > 0.51,
  }
}

function Computed(c: ComputedView) {
  if (c.immortal) {
    return (
      <>
        <p className="dwr-mmr-stage">
          You've reached <b>Immortal</b>.
        </p>
        <p className="dwr-mmr-empty-prose" style={{ marginTop: 24 }}>
          The math doesn't apply anymore. Above Divine 5, MMR is a
          numerical leaderboard rather than a star ladder — every win or
          loss simply moves you up or down the rank list against everyone
          else who's queued tonight.
        </p>
      </>
    )
  }

  // Near-breakeven band: WR between 49% and 51% inclusive. Pure-math
  // answer is "infinite," but real Dota MMR moves slowly even at 50%
  // (calibration adjustments, behavior modifiers, role-queue rotations),
  // so framing as "thousands of games" is more honest than "never."
  if (c.wr >= 0.49 && c.wr <= 0.51) {
    const wrPct = (c.wr * 100).toFixed(0)
    return (
      <>
        <p className="dwr-mmr-stage">
          At your current <b>{wrPct}% WR</b>
        </p>
        <p className="dwr-mmr-stage">You will reach</p>
        <div className="dwr-mmr-bracket">{c.nextBracket}</div>
        <div className="dwr-mmr-block">
          <p className="dwr-mmr-num bad">~ thousands of games</p>
        </div>
        <p className="dwr-mmr-empty-prose">
          Your WR needs to climb above 51% for the math to give a useful
          answer. Below that, calibration adjustments and behavior
          modifiers move MMR slowly — climbing is real but glacial.
        </p>
        {c.smallSample && <SmallSampleNote totalGames={c.totalGames} />}
        <Tagline trajectory={false} />
      </>
    )
  }

  // Trajectory framing — split based on whether the player is climbing.
  if (c.isClimbingTrajectory) {
    return (
      <>
        <p className="dwr-mmr-stage">
          At your current <b>{(c.wr * 100).toFixed(0)}% WR</b>
        </p>
        <p className="dwr-mmr-stage">You will reach</p>
        <div className="dwr-mmr-bracket">{c.nextBracket}</div>
        <div className="dwr-mmr-block">
          <p className="dwr-mmr-num good">
            {c.currentGames != null ? `~ ${c.currentGames} games` : '—'}
          </p>
          {c.currentTime && (
            <p className="dwr-mmr-time">
              ~ {c.currentTime.prose} at {c.gamesPerDay.toFixed(1)} games/day
            </p>
          )}
        </div>
        {c.smallSample && <SmallSampleNote totalGames={c.totalGames} />}
        <p className="dwr-mmr-tagline-end">
          You're already on a <span className="red">climbing trajectory</span>.
          Don't queue when tilted — that's how the WR drops.
        </p>
      </>
    )
  }

  // Sub-49% branch — strictly losing trajectory. The math says you don't
  // reach the next bracket without improving, so show NEVER and contrast
  // with the 55% benchmark.
  return (
    <>
      <p className="dwr-mmr-stage">
        At your current <b>{(c.wr * 100).toFixed(0)}% WR</b>
      </p>
      <p className="dwr-mmr-stage">You will reach</p>
      <div className="dwr-mmr-bracket">{c.nextBracket}</div>

      <div className="dwr-mmr-block">
        <p className="dwr-mmr-num bad">NEVER</p>
      </div>

      <div className="dwr-mmr-divider">
        <span className="line" />
        <span className="diamond" />
        <span className="line" />
      </div>

      <p className="dwr-mmr-stage">
        If your WR was <b>55%</b>
      </p>
      <div className="dwr-mmr-block">
        <p className="dwr-mmr-num good">
          {c.benchmarkGames != null ? `~ ${c.benchmarkGames} games` : '—'}
        </p>
        {c.benchmarkTime && (
          <p className="dwr-mmr-time">
            ~ {c.benchmarkTime.prose} at {c.gamesPerDay.toFixed(1)} games/day
          </p>
        )}
      </div>

      {c.smallSample && <SmallSampleNote totalGames={c.totalGames} />}

      <p className="dwr-mmr-tagline-end">
        The difference isn't <span className="red">talent</span>.
        <br />
        It's whether you're <span className="red">improving</span> or grinding.
      </p>
    </>
  )
}

function SmallSampleNote({ totalGames }: { totalGames: number }) {
  return (
    <p className="dwr-mmr-caveat">
      Small sample — only {totalGames} game{totalGames === 1 ? '' : 's'} in this
      window. Your real WR may differ by a few points either way.
    </p>
  )
}

function Tagline({ trajectory }: { trajectory: boolean }) {
  if (trajectory) {
    return (
      <p className="dwr-mmr-tagline-end">
        You're already on a <span className="red">climbing trajectory</span>.
      </p>
    )
  }
  return (
    <p className="dwr-mmr-tagline-end">
      Climbing requires <span className="red">improving</span>, not just queueing.
    </p>
  )
}
