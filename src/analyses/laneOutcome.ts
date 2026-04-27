import type { AnalysisResult, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { didWin, findPlayerInMatch } from '../lib/matchHelpers'

const LANE_EFF_PCT_WIN_THRESHOLD = 100 // OpenDota lane_efficiency_pct >= 100 ≈ above-average lane

/**
 * Lane win rate via OpenDota's `lane_efficiency_pct` (parsed-only) and the
 * conditional probability of winning the match given the user won lane.
 */
export function analyzeLaneOutcome(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket } = input
  const baseline = getBaseline(inferredRole, rankBucket)

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
    const eff =
      player.lane_efficiency_pct ??
      (player.lane_efficiency != null ? player.lane_efficiency * 100 : null)
    if (eff == null) continue

    lanesEvaluated++
    const wonLane = eff >= LANE_EFF_PCT_WIN_THRESHOLD
    if (wonLane) {
      lanesWon++
      lanesWonInOverall++
      if (didWin(m)) matchesWonGivenLaneWon++
    }
  }

  const overallWR = matches.length > 0 ? overallWins / matches.length : 0

  if (lanesEvaluated === 0) {
    return {
      id: 'lane-outcome',
      title: 'Lane outcome',
      metric: 0,
      metricLabel: '',
      baseline: Math.round(baseline.laneWinRate * 100),
      baselineLabel: '% baseline',
      severity: 'unmeasured',
      finding: 'Lane efficiency requires parsed matches.',
      suggestion: 'Once your matches finish parsing, re-run the report — this card will fill in.',
    }
  }

  const laneWR = lanesWon / lanesEvaluated
  const winGivenLane = lanesWonInOverall > 0 ? matchesWonGivenLaneWon / lanesWonInOverall : 0

  const severity =
    laneWR < 0.4 ? 'concerning'
    : laneWR < baseline.laneWinRate ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% bracket baseline.`
    suggestion = inferredRole === 'support'
      ? 'Your laning fundamentals are the cheapest MMR upgrade available. Practice creep aggro pulling and zoning the offlaner — a single full pull every 53 seconds turns most lanes around.'
      : 'You’re losing CS or trades. Watch your replay until the 6-min mark — most of your deficit is one identifiable mistake (greedy CS, overextending, no ward).'
  } else if (severity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%). When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% into match wins.`
    suggestion = winGivenLane < baseline.winGivenLaneWon
      ? 'You win lane but lose mid-game. Focus on the first Roshan timing and tempo objectives instead of farming a 4th item.'
      : 'Lane is fine. Push it harder — turn even lanes into winning ones with cycle pulls and runic shrine pickups.'
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
    baselineLabel: '% baseline',
    severity,
    finding,
    suggestion,
    note: lanesEvaluated < matches.length
      ? `${lanesEvaluated}/${matches.length} matches had parsed lane data.`
      : undefined,
    chart: {
      kind: 'bars',
      valueName: 'You',
      baselineName: 'Baseline',
      yMax: 100,
      data: [
        { label: 'Lane WR', value: Math.round(laneWR * 100), baseline: Math.round(baseline.laneWinRate * 100) },
        { label: 'Win | lane won', value: Math.round(winGivenLane * 100), baseline: Math.round(baseline.winGivenLaneWon * 100) },
        { label: 'Overall WR', value: Math.round(overallWR * 100), baseline: 50 },
      ],
    },
  }
}
