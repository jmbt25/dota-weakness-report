import type { AnalysisResult, ODMatchDetail, ODMatchPlayer, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import {
  classifyMatchRole,
  didWin,
  findPlayerInMatch,
  isParsed,
  isRadiantSlot,
} from '../lib/matchHelpers'

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
  let lanesWonButGameLost = 0
  const laneEffSamples: number[] = []

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

    // Per-match role classification — we use it twice below: once to
    // pick the right efficiency signal for the lane_outcome fallback,
    // and once to pick the right efficiency signal for the displayed
    // average that drives the divergence rule. A support's own
    // lane_efficiency_pct is structurally low (~30-50%) even on a
    // winning lane, so for support games we read efficiency off the
    // lane partner (the carry/offlaner) — that's the lane-aggregate
    // signal that actually says who came out ahead.
    const matchRole = classifyMatchRole(m, detail, accountId)
    const laneSignalEff =
      matchRole === 'support'
        ? laneAggregateEfficiency(detail, player)
        : player.lane_efficiency_pct ?? null

    // Primary: lane_outcome (1=won, 2=tied, 3=lost). When the OpenDota
    // response omits this field (which happens on a meaningful fraction
    // of parsed matches), fall back to lane_efficiency_pct thresholds.
    let outcome: 1 | 2 | 3 | null = null
    if (player.lane_outcome === 1 || player.lane_outcome === 2 || player.lane_outcome === 3) {
      outcome = player.lane_outcome
    } else if (typeof laneSignalEff === 'number') {
      if (laneSignalEff >= 55) outcome = 1
      else if (laneSignalEff >= 45) outcome = 2
      else outcome = 3
    }

    if (outcome == null) {
      nullOutcomeMatches++
      continue
    }

    lanesEvaluated++
    if (typeof laneSignalEff === 'number') laneEffSamples.push(laneSignalEff)
    const wonLane = outcome === 1
    if (wonLane) {
      lanesWon++
      lanesWonInOverall++
      if (didWin(m)) matchesWonGivenLaneWon++
      else lanesWonButGameLost++
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
      finding:
        nullOutcomeMatches >= parsedMatches && parsedMatches >= MIN_LANES_FOR_ANALYSIS
          ? "Lane outcome data isn't in OpenDota's free response right now (lane_outcome and lane_efficiency_pct are both missing on this account's parsed matches)."
          : `Only ${lanesEvaluated} match${lanesEvaluated === 1 ? '' : 'es'} produced a lane outcome — need at least ${MIN_LANES_FOR_ANALYSIS} for a stable read.`,
      suggestion: 'Once more of your matches finish parsing, re-run the report.',
      note: `${parsedMatches}/${matches.length} parsed · ${roamingMatches} roaming · ${nullOutcomeMatches} no lane data.`,
    }
  }

  const laneWR = lanesWon / lanesEvaluated
  const winGivenLane = lanesWonInOverall > 0 ? matchesWonGivenLaneWon / lanesWonInOverall : 0

  // Severity is the WORSE of two signals: lane WR vs lane efficiency.
  //
  // wrSeverity (calibration vs. 0.5 baseline):
  //   > 0.55 Strong, 0.45-0.55 Healthy, 0.375-0.45 Watch, < 0.375 Concerning
  //
  // The divergence rule fires when wrSeverity says 'good' but
  // avgLaneEff < EFF_DIVERGENCE_THRESHOLD — i.e. you're winning lanes
  // you should be losing on the scoreboard. That's not stable lane
  // play; it's variance. Downgrade the verdict and surface the gap.
  //
  // Reading lane efficiency from the lane partner for support games
  // (above) makes this rule role-fair — a support's own farm being low
  // doesn't trigger divergence, only a low LANE-aggregate signal does.
  const EFF_DIVERGENCE_THRESHOLD = 70

  const wrSeverity =
    laneWR < 0.375 ? 'concerning'
    : laneWR < 0.45 ? 'ok'
    : 'good'

  const avgLaneEff =
    laneEffSamples.length > 0
      ? Math.round(laneEffSamples.reduce((a, b) => a + b, 0) / laneEffSamples.length)
      : null
  const laneEffPhrase =
    avgLaneEff != null ? ` Lane efficiency averages ${avgLaneEff}%.` : ''

  const hasDivergence =
    wrSeverity === 'good' &&
    avgLaneEff != null &&
    avgLaneEff < EFF_DIVERGENCE_THRESHOLD

  // Promote a 'good' verdict down to 'ok' when the divergence rule fires.
  const severity: AnalysisResult['severity'] = hasDivergence ? 'ok' : wrSeverity

  let finding: string
  let suggestion: string
  if (wrSeverity === 'concerning') {
    const isExtreme = lanesWon <= 1 && lanesEvaluated >= 8
    if (isExtreme) {
      // Catastrophic-laning case — surface it directly instead of letting
      // the generic advice carry it. Most often hits supports whose lane
      // partner keeps eating dives.
      finding =
        inferredRole === 'support'
          ? `You're losing every support lane in this window — ${lanesWon}/${lanesEvaluated} fixed lanes won.${laneEffPhrase} That's almost always a lane-partner / matchup problem rather than your own farm.`
          : `${lanesWon}/${lanesEvaluated} lanes won — practically every lane is going wrong.${laneEffPhrase}`
      suggestion =
        inferredRole === 'support'
          ? 'Pull on a 53s cadence, deny the offlane creep when you can, and give up the lane fast if your carry is 0/3 — moving to jungle/rotations preserves XP and tempo.'
          : "Watch one replay through the 6-min mark. You'll find the same mistake (overpush, no-creep aggro, walked out of XP range) repeating across most of these lanes."
    } else {
      finding = `You win lane ${(laneWR * 100).toFixed(0)}% of the time (${lanesWon}/${lanesEvaluated} fixed-lane matches) — well below the ~${(baseline.laneWinRate * 100).toFixed(0)}% bracket baseline.${laneEffPhrase}`
      const effHint = avgLaneEff != null && avgLaneEff < 90 ? ` (You're at ${avgLaneEff}% lane efficiency — anything below 100% means you're behind expected farm at minute 10.)` : ''
      suggestion = inferredRole === 'support'
        ? `Your laning fundamentals are the cheapest MMR upgrade available — a full pull every 53s turns most lanes around.${effHint}`
        : inferredRole === 'core'
          ? `You're losing CS or trades. Watch one of your replays through the 6-min mark — most of your deficit is one identifiable mistake.${effHint}`
          : `Lane fundamentals are the cheapest MMR upgrade. Focus on the first 6 minutes — that's where most of the deficit comes from.${effHint}`
    }
  } else if (hasDivergence) {
    // WR says lane is fine; efficiency says it isn't. Don't paper over it.
    finding = `Lane outcomes are landing (${(laneWR * 100).toFixed(0)}% won, ${lanesWon}/${lanesEvaluated}) but lane efficiency averages ${avgLaneEff}% — you're winning despite the farm gap, not because of it. The wins are coming from elsewhere.`
    suggestion =
      inferredRole === 'support'
        ? `Pull cycles every ~53s and creep equilibrium are the fundamentals worth locking in. When efficiency lags lane WR (${avgLaneEff}% vs ${(laneWR * 100).toFixed(0)}% won), the wins aren't the lane play doing the work — the next bad matchup unwinds them.`
        : `Settle the wave so it stops bleeding XP, then prioritize CS efficiency. ${avgLaneEff}% efficiency at ${(laneWR * 100).toFixed(0)}% lane WR means you're winning lanes you should be losing on the scoreboard — that's variance, not a foundation.`
  } else if (wrSeverity === 'ok') {
    finding = `Lane WR is ${(laneWR * 100).toFixed(0)}% (${lanesWon}/${lanesEvaluated} fixed-lane matches), baseline ~${(baseline.laneWinRate * 100).toFixed(0)}%. When you do win lane, you convert ${(winGivenLane * 100).toFixed(0)}% into match wins.${laneEffPhrase}`
    suggestion = winGivenLane < baseline.winGivenLaneWon
      ? `You win lane (${(laneWR * 100).toFixed(0)}%) but lose mid-game (only ${(winGivenLane * 100).toFixed(0)}% of won lanes convert). Focus on the first Roshan timing instead of farming a 4th item.`
      : `Lane is fine at ${(laneWR * 100).toFixed(0)}%. Push it harder — turn even lanes into winning ones with cycle pulls and rune control.`
  } else {
    finding = `Strong laning: ${lanesWon}/${lanesEvaluated} fixed lanes won, ${(winGivenLane * 100).toFixed(0)}% match WR when lane is won (overall ${(overallWR * 100).toFixed(0)}%).${laneEffPhrase}`
    suggestion = `Lane (${(laneWR * 100).toFixed(0)}% WR) is a strength. Next bottleneck is mid-game — track your lane-to-Roshan timing on next 5 matches.`
  }

  // "Strong" only when both signals agree — laneWR > 0.55 AND no
  // divergence. Otherwise the badge would still say Strong while the
  // prose admits the gap.
  const severityLabel =
    severity === 'good' && laneWR > 0.55 && !hasDivergence ? 'Strong' : undefined

  // "Lanes won but games lost" sub-finding — surfaces the conversion gap
  // between winning lane and winning the match. Only useful when there's
  // at least one won lane to derive a ratio from.
  const subFinding =
    lanesWon > 0
      ? {
          kind: 'value' as const,
          label: 'Lanes won but games lost',
          value: `${lanesWonButGameLost} / ${lanesWon}`,
          sub:
            lanesWonButGameLost === 0
              ? `You converted every won lane into a match win — that's rare at any bracket.`
              : `Winning lane and converting it are different skills — ${lanesWonButGameLost} won lane${lanesWonButGameLost === 1 ? '' : 's'} ended in a loss.`,
        }
      : undefined

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
    roastFacts: {
      wins: lanesWon,
      total_lanes: lanesEvaluated,
      wr_pct: Math.round(laneWR * 100),
      // Efficiency is consumed by the divergence honest-mode template.
      // Default 100 so templates that gate on `efficiency < threshold`
      // don't fire when we have no efficiency data at all.
      efficiency: avgLaneEff ?? 100,
      diverged: hasDivergence ? 1 : 0,
    },
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
    subFinding,
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

/**
 * Lane-aggregate efficiency for the user's lane, used when `lane_outcome`
 * is missing and the user played support that game. We pick the maximum
 * `lane_efficiency_pct` across same-lane teammates (excluding roamers) —
 * that's effectively the lane's core, who actually represents whether
 * the lane came out ahead. Returns null if no qualifying lane partner
 * has a usable efficiency value.
 */
function laneAggregateEfficiency(
  detail: ODMatchDetail,
  user: ODMatchPlayer
): number | null {
  if (user.lane_role == null) return null
  const userIsRadiant = isRadiantSlot(user.player_slot)
  let best: number | null = null
  for (const p of detail.players) {
    if (p.player_slot === user.player_slot) continue
    if (isRadiantSlot(p.player_slot) !== userIsRadiant) continue
    if (p.lane_role !== user.lane_role) continue
    if (p.is_roaming === true) continue
    if (typeof p.lane_efficiency_pct !== 'number') continue
    if (best == null || p.lane_efficiency_pct > best) best = p.lane_efficiency_pct
  }
  return best
}
