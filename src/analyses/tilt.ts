import type { AnalysisResult, ReportInput, SubFindingPayload } from '../types'
import { didWin } from '../lib/matchHelpers'
import { computeSessionStats } from '../lib/sessionHelpers'

const SAFE_STREAK = 2

/**
 * Tilt detection.
 *
 * Severity rules (v3):
 *   - longest_streak ≤ SAFE_STREAK         → Healthy
 *   - longest_streak > SAFE_STREAK
 *       AND post-loss WR < overall WR     → Concerning (you tilt-queue)
 *   - longest_streak > SAFE_STREAK
 *       AND post-loss WR ≥ overall WR     → Watch (you ride streaks but don't melt)
 *
 * The post-loss bounce-back is the strongest signal — when it's good, lead
 * the prose with it.
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
  const bouncesBack = postLossWR >= overallWR

  let severity: AnalysisResult['severity']
  if (longestLossStreak <= SAFE_STREAK) severity = 'good'
  else if (bouncesBack) severity = 'ok'
  else severity = 'concerning'

  const overallPct = (overallWR * 100).toFixed(0)
  const postPct = (postLossWR * 100).toFixed(0)

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    const deltaPp = (overallWR - postLossWR) * 100
    finding = `${longestLossStreak}-game loss streak, and your post-loss WR (${postPct}%) is ${deltaPp.toFixed(0)}pp below your overall WR (${overallPct}%). That's a tilt pattern.`
    suggestion = 'Hard rule: after two losses, log off. The third game is statistically your worst, and it’s costing you the MMR you earned today.'
  } else if (severity === 'ok') {
    // Lead with the bounce-back since it's the standout signal here.
    finding = `Bounce-back is solid (post-loss WR ${postPct}% vs overall ${overallPct}%), but you hit a ${longestLossStreak}-game streak — a couple of long losing skids in this window.`
    suggestion = 'Mental holds up after individual losses; the work is recognizing when a streak is forming early. Take a 10-min break after two consecutive losses, not five.'
  } else {
    finding = `Mental looks solid: longest streak ${longestLossStreak}, post-loss WR (${postPct}%) is on par with overall WR (${overallPct}%).`
    suggestion = 'You bounce back well after losses and don’t hit deep streaks. Keep the queue discipline — it’s rarer than people think.'
  }

  // "Strong" badge when there's no streak AND post-loss WR is meaningfully
  // above overall WR — that's a player who actively bounces back.
  const severityLabel =
    severity === 'good' && longestLossStreak <= SAFE_STREAK && postLossWR > overallWR + 0.1
      ? 'Strong'
      : undefined

  // WR-by-session-position sub-finding. Only renders the chart when EVERY
  // bucket (1st / 2nd / 3rd / 4th+) has >= 8 games — below that, "0% WR
  // in your 1st game off 4 games" is statistical noise, not a finding.
  // When the threshold isn't met but there's some session data, we
  // surface a small note instead so the user knows the metric exists
  // but their sample is too thin yet.
  const SESSION_BUCKET_MIN = 8
  const sessionStats = computeSessionStats(matches)
  const hasSessionData = sessionStats.longSessionGames > 0
  // Treat missing buckets (e.g. no 4th-game sessions) as 0 — that's a
  // bucket below threshold, which correctly suppresses the chart.
  const minBucketGames =
    sessionStats.buckets.length === 4
      ? Math.min(...sessionStats.buckets.map((b) => b.games))
      : 0
  const meetsThreshold =
    hasSessionData &&
    sessionStats.buckets.length >= 3 &&
    minBucketGames >= SESSION_BUCKET_MIN

  let subFinding: SubFindingPayload | undefined
  if (meetsThreshold) {
    const labelFor = (p: 1 | 2 | 3 | 4) => (p === 4 ? '4th+' : `${p}${p === 1 ? 'st' : p === 2 ? 'nd' : 'rd'}`)
    subFinding = {
      kind: 'rows',
      label: 'WR by session position (3+ games in a row)',
      rows: sessionStats.buckets.map((b) => ({
        name: labelFor(b.position),
        pct: b.wr * 100,
        sub: `${b.games}g`,
      })),
      sub: 'A session is a sequence of games with under 2h between starts.',
    }
  } else {
    subFinding = {
      kind: 'value',
      label: 'WR by session position',
      value: '—',
      sub: 'Not enough multi-game sessions in this window to detect a session-position pattern. Comes back at higher game counts or after more 3+ game sessions.',
    }
  }

  return {
    id: 'tilt',
    title: 'Loss streak / tilt',
    metric: longestLossStreak,
    metricLabel: 'longest streak',
    baseline: SAFE_STREAK,
    baselineLabel: 'safe streak',
    severity,
    severityLabel,
    finding,
    suggestion,
    roastFacts: {
      streak: longestLossStreak,
      post_loss: Math.round(postLossWR * 100),
      overall: Math.round(overallWR * 100),
    },
    chart: {
      kind: 'bars',
      valueName: 'WR %',
      yMax: 100,
      data: [
        { label: 'Overall', value: Math.round(overallWR * 100) },
        { label: 'After a loss', value: Math.round(postLossWR * 100) },
      ],
    },
    subFinding,
  }
}
