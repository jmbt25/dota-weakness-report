import type { AnalysisResult, ODMatchPlayer, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { didWin, findPlayerInMatch, isParsed } from '../lib/matchHelpers'

/**
 * Lane outcome.
 *
 * Primary signal: OpenDota's `lane_outcome` field on parsed match players
 * (1 = won lane, 2 = tied, 3 = lost). Fallback when missing:
 * `lane_efficiency_pct` > 100 = won (above the lane-role average).
 *
 * Denominator is parsed-only — we only count matches where we could form an
 * opinion. Sanity guard: if 0 lanes won across N>5 evaluated, return
 * 'unmeasured' rather than reporting 0% (almost certainly a data issue).
 */
export function analyzeLaneOutcome(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket } = input
  const baseline = getBaseline(inferredRole, rankBucket)

  let parsedMatches = 0
  let lanesEvaluated = 0
  let lanesWon = 0
  let matchesWonGivenLaneWon = 0
  let lanesWonInOverall = 0
  let overallWins = 0

  // Production-visible diagnostics — first 5 parsed matches.
  const debugSamples: {
    match: number
    lane_outcome: unknown
    lane_efficiency_pct: unknown
    lane_role: unknown
  }[] = []

  for (const m of matches) {
    if (didWin(m)) overallWins++
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    const parsed = isParsed(detail)
    if (parsed) parsedMatches++

    if (debugSamples.length < 5 && parsed) {
      debugSamples.push({
        match: m.match_id,
        lane_outcome: player.lane_outcome,
        lane_efficiency_pct: player.lane_efficiency_pct,
        lane_role: player.lane_role,
      })
    }

    const wonLane = laneWasWon(player)
    if (wonLane === null) continue

    lanesEvaluated++
    if (wonLane) {
      lanesWon++
      lanesWonInOverall++
      if (didWin(m)) matchesWonGivenLaneWon++
    }
  }

  if (debugSamples.length > 0) {
    // eslint-disable-next-line no-console
    console.debug('[lane-outcome] raw samples', {
      parsedMatches,
      lanesEvaluated,
      lanesWon,
      samples: debugSamples,
    })
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
      finding: 'Lane outcome requires parsed matches with lane data — none were available.',
      suggestion: 'Once your matches finish parsing, re-run the report — this card will fill in.',
    }
  }

  // Sanity guard: 0 lanes won across N>5 evaluated lanes is implausible at
  // any rank — likely means our extraction is reading the wrong field.
  if (lanesWon === 0 && lanesEvaluated > 5) {
    return {
      id: 'lane-outcome',
      title: 'Lane outcome',
      metric: 0,
      metricLabel: '',
      baseline: Math.round(baseline.laneWinRate * 100),
      baselineLabel: '% baseline',
      severity: 'unmeasured',
      finding: `Couldn’t compute lane outcome reliably (read 0 wins across ${lanesEvaluated} parsed lanes). Please retry — this is usually transient.`,
      suggestion: 'Try again in a minute. If it keeps showing this, it’s a data shape problem on our side.',
      note: `${parsedMatches}/${matches.length} matches had parsed replays.`,
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
    finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time (${lanesWon}/${lanesEvaluated} parsed lanes) — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% bracket baseline.`
    suggestion = inferredRole === 'support'
      ? 'Your laning fundamentals are the cheapest MMR upgrade available. Practice creep aggro pulling and zoning the offlaner — a single full pull every 53 seconds turns most lanes around.'
      : inferredRole === 'core'
        ? 'You’re losing CS or trades. Watch your replay until the 6-min mark — most of your deficit is one identifiable mistake (greedy CS, overextending, no ward).'
        : 'Lane fundamentals are the cheapest MMR upgrade. Whether you’re carrying or supporting, focus on the first 6 minutes — that’s where most of the deficit comes from.'
  } else if (severity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (${lanesWon}/${lanesEvaluated} parsed lanes), baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%. When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% into match wins.`
    suggestion = winGivenLane < baseline.winGivenLaneWon
      ? 'You win lane but lose mid-game. Focus on the first Roshan timing and tempo objectives instead of farming a 4th item.'
      : 'Lane is fine. Push it harder — turn even lanes into winning ones with cycle pulls and runic shrine pickups.'
  } else {
    finding = `Strong laning: ${lanesWon}/${lanesEvaluated} parsed lanes won, ${(winGivenLane * 100).toFixed(0)}% match WR when lane is won (overall ${(overallWR * 100).toFixed(0)}%).`
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
    note: `${parsedMatches}/${matches.length} matches had parsed replays; ${lanesEvaluated} produced lane data.`,
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

/** true = won, false = tied/lost, null = no signal available. */
function laneWasWon(player: ODMatchPlayer): boolean | null {
  // Primary signal: OpenDota lane_outcome (1 = won).
  if (player.lane_outcome != null) return player.lane_outcome === 1

  // Fallback: lane_efficiency_pct > 100 means above-average lane.
  // The strict `>` (not `>=`) avoids counting exactly-average ties as wins.
  const eff =
    player.lane_efficiency_pct ??
    (player.lane_efficiency != null ? player.lane_efficiency * 100 : null)
  if (eff != null) return eff > 100

  return null
}
