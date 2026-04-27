import type { AnalysisResult, ReportInput } from '../types'
import { getRoleBaseline } from '../lib/baselines'
import { didWin, findPlayerInMatch } from '../lib/matchHelpers'

const LANE_EFFICIENCY_WIN_THRESHOLD = 1.0 // OpenDota lane_efficiency_pct: 100% ≈ on-par with average

/**
 * Lane win rate and the conditional probability of winning a match given
 * the user won lane. Uses OpenDota's `lane_efficiency` (a normalized score
 * available on parsed matches) — values >= 1.0 (or pct >= 100) indicate
 * the player out-laned the average.
 */
export function analyzeLaneOutcome(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole } = input
  const baseline = getRoleBaseline(inferredRole)

  let lanesEvaluated = 0
  let lanesWon = 0
  let matchesWonGivenLaneWon = 0
  let lanesWonInOverall = 0

  let overallWins = 0

  for (const m of matches) {
    if (didWin(m)) overallWins++
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue
    const eff = player.lane_efficiency_pct ?? (player.lane_efficiency != null ? player.lane_efficiency * 100 : null)
    if (eff == null) continue

    lanesEvaluated++
    const wonLane = eff >= LANE_EFFICIENCY_WIN_THRESHOLD * 100
    if (wonLane) {
      lanesWon++
      lanesWonInOverall++
      if (didWin(m)) matchesWonGivenLaneWon++
    }
  }

  const laneWR = lanesEvaluated > 0 ? lanesWon / lanesEvaluated : 0
  const winGivenLane = lanesWonInOverall > 0 ? matchesWonGivenLaneWon / lanesWonInOverall : 0
  const overallWR = matches.length > 0 ? overallWins / matches.length : 0

  const severity =
    lanesEvaluated === 0 ? 'ok'
    : laneWR < 0.4 ? 'concerning'
    : laneWR < baseline.laneWinRate ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (lanesEvaluated === 0) {
    finding = 'Lane efficiency requires parsed matches — none were available, so this metric is unmeasured.'
    suggestion = 'Request a parse on dotabuff/opendota for a few recent games, then re-run.'
  } else if (severity === 'concerning') {
    finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% baseline.`
    suggestion = inferredRole === 'support'
      ? 'Your laning fundamentals are the cheapest MMR upgrade available. Practice creep aggro pulling and zoning the offlaner — a single full pull every 53 seconds turns most lanes around.'
      : 'You’re losing CS or trades. Watch your replay until the 6-min mark — most of your deficit is one identifiable mistake (greedy CS, overextending, no ward).'
  } else if (severity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%). When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% of those into wins.`
    suggestion = winGivenLane < 0.55
      ? 'You win lane but lose mid-game. Focus on the first Roshan timing and tempo objectives instead of farming a 4th item.'
      : 'Lane is fine. Push it harder — turn an even lane into a winning one with a runic shrine or Nyctasha-style aggro stack.'
  } else {
    finding = `Strong laning: ${(laneWR * 100).toFixed(0)}% lane WR, ${(winGivenLane * 100).toFixed(0)}% match WR when lane is won (overall ${(overallWR * 100).toFixed(0)}%).`
    suggestion = 'Lane is a strength. Next bottleneck is probably mid-game decision making — track lane-to-Roshan timing.'
  }

  return {
    id: 'lane-outcome',
    title: 'Lane outcome',
    metric: Math.round(laneWR * 100),
    metricLabel: '% lanes won',
    baseline: Math.round(baseline.laneWinRate * 100),
    baselineLabel: 'baseline %',
    severity,
    finding,
    suggestion,
    chart:
      lanesEvaluated > 0
        ? {
            kind: 'bars',
            valueName: 'You',
            baselineName: 'Baseline',
            data: [
              {
                label: 'Lane WR %',
                value: Math.round(laneWR * 100),
                baseline: Math.round(baseline.laneWinRate * 100),
              },
              {
                label: 'Win | lane won %',
                value: Math.round(winGivenLane * 100),
                baseline: Math.round(baseline.winGivenLaneWon * 100),
              },
              {
                label: 'Overall WR %',
                value: Math.round(overallWR * 100),
                baseline: 50,
              },
            ],
          }
        : undefined,
  }
}
