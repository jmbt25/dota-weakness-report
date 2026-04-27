import type { AnalysisResult, ODMatchPlayer, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { didWin, findPlayerInMatch, isParsed } from '../lib/matchHelpers'

const MIN_LANES_FOR_ANALYSIS = 5

/**
 * Lane outcome.
 *
 * Primary signal: OpenDota's `lane_outcome` field on parsed match players
 * (1 = won, 2 = tied, 3 = lost). Roaming supports have `is_roaming === true`
 * and `lane_outcome` is typically null on those games — we exclude them
 * explicitly rather than counting them as losses.
 *
 * Denominator: matches with `is_roaming === false` AND `lane_outcome != null`.
 * If that count is below 5, return 'unmeasured' with the roaming-support copy.
 */
export function analyzeLaneOutcome(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket, roleDistribution } = input
  const baseline = getBaseline(inferredRole, rankBucket, roleDistribution)

  let parsedMatches = 0
  let roamingMatches = 0
  let nullOutcomeMatches = 0
  let lanesEvaluated = 0
  let lanesWon = 0
  let matchesWonGivenLaneWon = 0
  let lanesWonInOverall = 0
  let overallWins = 0

  // Production-visible diagnostics — first 8 parsed matches.
  const debugSamples: {
    match: number
    lane_outcome: unknown
    lane_role: unknown
    is_roaming: unknown
    lane_efficiency_pct: unknown
  }[] = []

  for (const m of matches) {
    if (didWin(m)) overallWins++
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    const parsed = isParsed(detail)
    if (parsed) parsedMatches++

    if (debugSamples.length < 8 && parsed) {
      debugSamples.push({
        match: m.match_id,
        lane_outcome: player.lane_outcome,
        lane_role: player.lane_role,
        is_roaming: player.is_roaming,
        lane_efficiency_pct: player.lane_efficiency_pct,
      })
    }

    if (player.is_roaming === true) {
      roamingMatches++
      continue
    }
    if (player.lane_outcome == null) {
      nullOutcomeMatches++
      continue
    }

    lanesEvaluated++
    const wonLane = player.lane_outcome === 1
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
      roamingMatches,
      nullOutcomeMatches,
      lanesEvaluated,
      lanesWon,
      samples: debugSamples,
    })
  }

  const overallWR = matches.length > 0 ? overallWins / matches.length : 0

  // Roaming-support case: parsed matches exist but most are roaming, so
  // lane outcome doesn't apply.
  if (lanesEvaluated < MIN_LANES_FOR_ANALYSIS) {
    if (parsedMatches > 0 && roamingMatches >= parsedMatches * 0.5) {
      return {
        id: 'lane-outcome',
        title: 'Lane outcome',
        metric: 0,
        metricLabel: '',
        baseline: Math.round(baseline.laneWinRate * 100),
        baselineLabel: '% baseline',
        severity: 'unmeasured',
        finding: `Lane outcome doesn't apply — you played mostly roaming supports in this window (${roamingMatches}/${parsedMatches} parsed matches). Lane analysis works best when ≥${MIN_LANES_FOR_ANALYSIS} matches have a fixed laning role.`,
        suggestion: 'Try a window with more fixed-position games, or check the death-timing card — that one still works for roaming supports.',
        note: `${parsedMatches}/${matches.length} parsed · ${roamingMatches} roaming · ${nullOutcomeMatches} no lane data.`,
      }
    }
    return {
      id: 'lane-outcome',
      title: 'Lane outcome',
      metric: 0,
      metricLabel: '',
      baseline: Math.round(baseline.laneWinRate * 100),
      baselineLabel: '% baseline',
      severity: 'unmeasured',
      finding: `Only ${lanesEvaluated} match${lanesEvaluated === 1 ? '' : 'es'} produced a lane outcome — need at least ${MIN_LANES_FOR_ANALYSIS} for a stable read.`,
      suggestion: 'Once more of your matches finish parsing, re-run the report.',
      note: `${parsedMatches}/${matches.length} parsed · ${roamingMatches} roaming · ${nullOutcomeMatches} no lane data.`,
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
    finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time (${lanesWon}/${lanesEvaluated} fixed-lane matches) — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% bracket baseline.`
    suggestion = inferredRole === 'support'
      ? 'Your laning fundamentals are the cheapest MMR upgrade available. Practice creep aggro pulling and zoning the offlaner — a single full pull every 53 seconds turns most lanes around.'
      : inferredRole === 'core'
        ? 'You\'re losing CS or trades. Watch your replay until the 6-min mark — most of your deficit is one identifiable mistake (greedy CS, overextending, no ward).'
        : 'Lane fundamentals are the cheapest MMR upgrade. Whether you\'re carrying or supporting, focus on the first 6 minutes — that\'s where most of the deficit comes from.'
  } else if (severity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (${lanesWon}/${lanesEvaluated} fixed-lane matches), baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%. When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% into match wins.`
    suggestion = winGivenLane < baseline.winGivenLaneWon
      ? 'You win lane but lose mid-game. Focus on the first Roshan timing and tempo objectives instead of farming a 4th item.'
      : 'Lane is fine. Push it harder — turn even lanes into winning ones with cycle pulls and runic shrine pickups.'
  } else {
    finding = `Strong laning: ${lanesWon}/${lanesEvaluated} fixed lanes won, ${(winGivenLane * 100).toFixed(0)}% match WR when lane is won (overall ${(overallWR * 100).toFixed(0)}%).`
    suggestion = 'Lane is a strength. Next bottleneck is probably mid-game decision making — track lane-to-Roshan timing.'
  }

  const severityLabel =
    severity === 'good' && laneWR >= baseline.laneWinRate + 0.1 ? 'Strong' : undefined

  return {
    id: 'lane-outcome',
    title: 'Lane outcome',
    metric: Math.round(laneWR * 100),
    metricLabel: '% lanes won',
    baseline: Math.round(baseline.laneWinRate * 100),
    baselineLabel: '% baseline',
    severity,
    severityLabel,
    finding,
    suggestion,
    note: `${parsedMatches}/${matches.length} parsed · ${roamingMatches} roaming excluded · ${lanesEvaluated} fixed-lane matches.`,
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

// Keeping this as a documented helper even though we now read lane_outcome
// directly — it captures the "secondary fallback" idea if we ever need it
// for matches where lane_outcome is null but lane_efficiency_pct is set.
export function _laneWasWonFallback(player: ODMatchPlayer): boolean | null {
  if (player.lane_outcome != null) return player.lane_outcome === 1
  const eff = player.lane_efficiency_pct
  if (eff != null) return eff > 100
  return null
}
