import type { AnalysisResult, ODMatchPlayer, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { didWin, findPlayerInMatch } from '../lib/matchHelpers'

/**
 * Lane win rate via OpenDota's `lane_outcome` field (parsed-only):
 *   1 = won, 2 = tied, 3 = lost (encodings vary slightly by lane, but lower
 *   is always better). We treat 1 as a win, anything else (or null) as
 *   not-won. If `lane_outcome` is missing on a parsed match, fall back to
 *   `lane_efficiency_pct` >= 100 as a secondary signal.
 *
 * Renders the result as two large stat blocks rather than a confusing
 * 3-bar comparison chart.
 */
export function analyzeLaneOutcome(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket } = input
  const baseline = getBaseline(inferredRole, rankBucket)

  let lanesEvaluated = 0
  let lanesWon = 0
  let matchesWonGivenLaneWon = 0
  let lanesWonInOverall = 0
  let overallWins = 0

  // Dev-time verification per the v3 review: log raw lane_outcome values
  // for the first few matches so we can confirm we're parsing correctly.
  const debugSamples: { match: number; outcome: unknown; effPct: unknown }[] = []

  for (const m of matches) {
    if (didWin(m)) overallWins++
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    const wonLane = laneWasWon(player)
    if (debugSamples.length < 5) {
      debugSamples.push({
        match: m.match_id,
        outcome: player.lane_outcome,
        effPct: player.lane_efficiency_pct,
      })
    }

    if (wonLane === null) continue
    lanesEvaluated++
    if (wonLane) {
      lanesWon++
      lanesWonInOverall++
      if (didWin(m)) matchesWonGivenLaneWon++
    }
  }

  if (debugSamples.length > 0 && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug('[lane-outcome] raw samples', debugSamples)
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
      finding: 'Lane outcome requires parsed matches.',
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
    finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time (${lanesWon}/${lanesEvaluated}) — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% bracket baseline.`
    suggestion = inferredRole === 'support'
      ? 'Your laning fundamentals are the cheapest MMR upgrade available. Practice creep aggro pulling and zoning the offlaner — a single full pull every 53 seconds turns most lanes around.'
      : 'You’re losing CS or trades. Watch your replay until the 6-min mark — most of your deficit is one identifiable mistake (greedy CS, overextending, no ward).'
  } else if (severity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (${lanesWon}/${lanesEvaluated}), baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%. When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% into match wins.`
    suggestion = winGivenLane < baseline.winGivenLaneWon
      ? 'You win lane but lose mid-game. Focus on the first Roshan timing and tempo objectives instead of farming a 4th item.'
      : 'Lane is fine. Push it harder — turn even lanes into winning ones with cycle pulls and runic shrine pickups.'
  } else {
    finding = `Strong laning: ${lanesWon}/${lanesEvaluated} lanes won, ${(winGivenLane * 100).toFixed(0)}% match WR when lane is won (overall ${(overallWR * 100).toFixed(0)}%).`
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
      kind: 'stat-blocks',
      blocks: [
        {
          label: 'Lanes won',
          value: `${lanesWon} / ${lanesEvaluated}`,
          sub: `${(laneWR * 100).toFixed(0)}% · baseline ${(baseline.laneWinRate * 100).toFixed(0)}%`,
        },
        {
          label: 'Match WR when winning lane',
          value: `${(winGivenLane * 100).toFixed(0)}%`,
          sub: `vs ${(overallWR * 100).toFixed(0)}% overall · baseline ${(baseline.winGivenLaneWon * 100).toFixed(0)}%`,
        },
      ],
    },
  }
}

/**
 * Returns true if won, false if tied/lost, null if outcome can't be
 * determined (no parse data on this match).
 */
function laneWasWon(player: ODMatchPlayer): boolean | null {
  // Primary signal: OpenDota lane_outcome (1 = won).
  if (player.lane_outcome != null) return player.lane_outcome === 1

  // Fallback signal: lane_efficiency_pct >= 100 indicates above-average lane.
  // We only use this when lane_outcome is explicitly missing (not just 0).
  const eff =
    player.lane_efficiency_pct ??
    (player.lane_efficiency != null ? player.lane_efficiency * 100 : null)
  if (eff != null) return eff >= 100

  return null
}
