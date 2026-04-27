import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'

/**
 * Tilt detection. Two signals:
 *   - longest consecutive loss streak in the window
 *   - win rate on the very next game after each loss vs. overall WR
 *
 * If post-loss WR is meaningfully below overall WR (delta >= 10pp), and
 * there's a streak of 3+, we flag tilt.
 *
 * Matches are returned by OpenDota newest-first. We process oldest-first so
 * "next game after a loss" is well-defined.
 */
export function analyzeTilt(input: ReportInput): AnalysisResult {
  const { matches } = input
  const ordered = [...matches].sort((a, b) => a.start_time - b.start_time)

  let longestLossStreak = 0
  let curLossStreak = 0
  let postLossGames = 0
  let postLossWins = 0
  let totalWins = 0

  for (let i = 0; i < ordered.length; i++) {
    const m = ordered[i]
    const won = didWin(m)
    if (won) totalWins++

    // Was the previous game a loss? Then this game counts as "post-loss".
    if (i > 0 && !didWin(ordered[i - 1])) {
      postLossGames++
      if (won) postLossWins++
    }

    if (won) {
      curLossStreak = 0
    } else {
      curLossStreak++
      if (curLossStreak > longestLossStreak) longestLossStreak = curLossStreak
    }
  }

  const overallWR = ordered.length > 0 ? totalWins / ordered.length : 0
  const postLossWR = postLossGames > 0 ? postLossWins / postLossGames : 0
  const deltaPp = (overallWR - postLossWR) * 100 // positive = tilt

  const severity =
    longestLossStreak >= 4 && deltaPp >= 15 ? 'concerning'
    : longestLossStreak >= 3 && deltaPp >= 8 ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `${longestLossStreak}-game loss streak in this window, and your post-loss WR (${(postLossWR * 100).toFixed(0)}%) is ${deltaPp.toFixed(0)}pp below your overall WR (${(overallWR * 100).toFixed(0)}%). That's a tilt pattern.`
    suggestion = 'Hard rule: after two losses, log off. The third game is statistically your worst, and it’s costing you the MMR you earned today.'
  } else if (severity === 'ok') {
    finding = `Some tilt risk: longest streak ${longestLossStreak} losses, post-loss WR ${(postLossWR * 100).toFixed(0)}% vs overall ${(overallWR * 100).toFixed(0)}%.`
    suggestion = 'Take a 10-minute break between matches when the previous one was a loss. Replay review > queueing tilted.'
  } else {
    finding = `Mental looks solid: longest streak ${longestLossStreak}, post-loss WR (${(postLossWR * 100).toFixed(0)}%) is on par with overall WR (${(overallWR * 100).toFixed(0)}%).`
    suggestion = 'You bounce back well after losses. Keep the queue discipline — it’s rarer than people think.'
  }

  return {
    id: 'tilt',
    title: 'Loss streak / tilt',
    metric: longestLossStreak,
    metricLabel: 'longest streak',
    baseline: 2,
    baselineLabel: 'safe streak',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'bars',
      valueName: 'WR %',
      data: [
        { label: 'Overall', value: Math.round(overallWR * 100) },
        { label: 'After a loss', value: Math.round(postLossWR * 100) },
      ],
    },
  }
}
