import type {
  AnalysisResult,
  ODMatchPlayer,
  ReportInput,
  WardKind,
  WardOutcome,
  WardPlacement,
} from '../types'
import { getBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed, isRadiantSlot } from '../lib/matchHelpers'

const MIN_ELIGIBLE_MATCHES = 5

// Ward sight radii: observer wards see ~1600 game units. The spec uses 1500
// as a "user warded near the death" threshold. OpenDota's coordinate grid
// spans ~128 grid units across ~16384 game units, so 1500 game units ≈
// 11.7 grid units. We use 12 grid units for the proximity check.
//
// TODO: tighten once we backfill real placements vs deaths against
// in-game vision radii (truesight vs normal, day vs night).
const MISMATCH_RADIUS_GRID = 12

const OBS_DURATION_SEC = 6 * 60
const SEN_DURATION_SEC = 7 * 60

/**
 * Vision analysis.
 *
 * Per-match: collect every observer/sentry placement along with its
 * outcome (dewarded by enemy, expired naturally, or still alive at match
 * end), and a lifetime in seconds. Aggregate into per-game averages and
 * an unmapped placement list — `VisionCard` renders the placements as
 * SVG dots over the bundled Dota 2 minimap.
 *
 * Vision-death mismatch: for each death event with coordinates, count it
 * as "no-vision" if the user placed no ward within ~1500 game units that
 * match. Death coordinates are not always present on the OpenDota free
 * response — when none are, mismatchPct is null and the prose stops
 * citing it.
 */
export function analyzeVision(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket, roleDistribution } = input
  const baseline = getBaseline(inferredRole, rankBucket, roleDistribution).vision

  const placements: WardPlacement[] = []
  let eligibleMatches = 0
  let totalObsPlaced = 0
  let totalSenPlaced = 0
  let totalDewards = 0
  const obsLifetimes: number[] = []
  const senLifetimes: number[] = []
  let deathSamples = 0
  let noVisionDeaths = 0
  let deathSampleMatches = 0

  let debugLogged = false

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue
    if (!isParsed(detail)) continue

    const obsLog = Array.isArray(player.obs_log) ? player.obs_log : []
    const senLog = Array.isArray(player.sen_log) ? player.sen_log : []
    const obsLeft = Array.isArray(player.obs_left_log) ? player.obs_left_log : []
    const senLeft = Array.isArray(player.sen_left_log) ? player.sen_left_log : []

    if (obsLog.length === 0 && senLog.length === 0) continue
    eligibleMatches++

    if (!debugLogged) {
      // eslint-disable-next-line no-console
      console.debug('[vision] sample parsed match', {
        match: m.match_id,
        obs_placed: player.obs_placed,
        sen_placed: player.sen_placed,
        observer_kills: player.observer_kills,
        sentry_kills: player.sentry_kills,
        obs_log_len: obsLog.length,
        sen_log_len: senLog.length,
        first_obs: obsLog[0],
        first_obs_left: obsLeft[0],
        objectives_with_xy: (detail.objectives ?? [])
          .filter((o) => typeof o.x === 'number' && typeof o.y === 'number')
          .slice(0, 3),
      })
      debugLogged = true
    }

    totalObsPlaced += obsLog.length || (player.obs_placed ?? 0)
    totalSenPlaced += senLog.length || (player.sen_placed ?? 0)
    totalDewards += (player.observer_kills ?? 0) + (player.sentry_kills ?? 0)

    const matchWardCoords: { x: number; y: number }[] = []
    collectPlacements(
      obsLog,
      obsLeft,
      'observer',
      OBS_DURATION_SEC,
      m.duration,
      placements,
      obsLifetimes,
      matchWardCoords
    )
    collectPlacements(
      senLog,
      senLeft,
      'sentry',
      SEN_DURATION_SEC,
      m.duration,
      placements,
      senLifetimes,
      matchWardCoords
    )

    // Vision-death mismatch. OpenDota's CHAT_MESSAGE_HERO_KILL events
    // sometimes carry x/y; when they do, we can score deaths against the
    // user's wards in that match. When they don't, this branch stays
    // silent and mismatchPct ends up null.
    if (Array.isArray(detail.objectives)) {
      let matchContributedDeath = false
      for (const obj of detail.objectives) {
        if (obj.type !== 'CHAT_MESSAGE_HERO_KILL') continue
        const victimSlot =
          typeof obj.key === 'number' ? obj.key
          : typeof obj.value === 'number' ? obj.value
          : undefined
        if (victimSlot !== player.player_slot) continue
        if (typeof obj.x !== 'number' || typeof obj.y !== 'number') continue
        deathSamples++
        matchContributedDeath = true
        if (!hasNearbyWard(obj.x, obj.y, matchWardCoords)) noVisionDeaths++
      }
      if (matchContributedDeath) deathSampleMatches++
    }

    // userIsRadiant retained for future use (e.g. team-side colored dots);
    // currently every dot is colored by ward kind, not team.
    void isRadiantSlot
  }

  const totalMatches = matches.length

  if (eligibleMatches < MIN_ELIGIBLE_MATCHES) {
    return {
      id: 'vision',
      title: 'Vision',
      metric: 0,
      metricLabel: '',
      baseline: roleHeadlineBaseline(inferredRole, baseline),
      baselineLabel: roleHeadlineLabel(inferredRole),
      severity: 'unmeasured',
      finding: `Vision data needs parsed replays — only ${eligibleMatches} of ${totalMatches} matches had ward logs. Need at least ${MIN_ELIGIBLE_MATCHES} for a stable read.`,
      suggestion: 'Once more of your matches finish parsing, re-run the report.',
      note: `${eligibleMatches}/${totalMatches} matches had ward logs.`,
    }
  }

  const obsPerGame = totalObsPlaced / eligibleMatches
  const senPerGame = totalSenPlaced / eligibleMatches
  const dewardsPerGame = totalDewards / eligibleMatches
  const avgObs = obsLifetimes.length > 0 ? mean(obsLifetimes) : 0
  const avgSen = senLifetimes.length > 0 ? mean(senLifetimes) : 0
  const allLifetimes = [...obsLifetimes, ...senLifetimes]
  const avgLifetimeSec = allLifetimes.length > 0 ? mean(allLifetimes) : 0

  const mismatchPct = deathSamples > 0 ? (noVisionDeaths / deathSamples) * 100 : null

  // Headline metric pivots on role.
  const isCore = inferredRole === 'core'
  const headline = isCore ? dewardsPerGame : obsPerGame
  const headlineBase = isCore ? baseline.dewardsPerGame : baseline.obsPerGame
  const headlineLabel = roleHeadlineLabel(inferredRole)
  const headlineRatio = headlineBase > 0 ? headline / headlineBase : 0

  // Severity calibration per spec.
  let severity: AnalysisResult['severity'] = 'good'
  if (headlineRatio < 0.75) severity = 'concerning'
  else if (headlineRatio < 0.9) severity = 'ok'
  if (mismatchPct != null) {
    if (mismatchPct > 40 && severity !== 'concerning') severity = 'concerning'
    else if (mismatchPct > 25 && severity === 'good') severity = 'ok'
  }

  const severityLabel =
    severity === 'good' && headlineRatio > 1.10 && (mismatchPct == null || mismatchPct < 25)
      ? 'Strong'
      : undefined

  const lifetimeStr = formatMmSs(avgLifetimeSec)
  const lifetimeBaselineSec = baseline.avgWardLifetimeSec
  const lifetimeDelta = avgLifetimeSec - lifetimeBaselineSec
  const lifetimeComparison =
    Math.abs(lifetimeDelta) < 15
      ? 'matches'
      : lifetimeDelta > 0
        ? 'beats'
        : 'trails'

  let finding: string
  let suggestion: string
  if (isCore) {
    if (severity === 'concerning') {
      finding =
        `You kill ${dewardsPerGame.toFixed(1)} enemy wards/game vs ${baseline.dewardsPerGame.toFixed(1)} core target. ` +
        `Each enemy ward you let live is 6 minutes of free intel.`
      suggestion =
        `${dewardsPerGame.toFixed(1)} dewards/game means most enemy vision is up the full duration. ` +
        `Buy one extra sentry per laning phase — even an obvious sweep clears the obvious wards.`
    } else if (severity === 'ok') {
      finding =
        `Dewards run ${dewardsPerGame.toFixed(1)}/game vs ${baseline.dewardsPerGame.toFixed(1)} target. ` +
        (mismatchPct != null
          ? `${Math.round(mismatchPct)}% of your deaths happened where you hadn't warded that game.`
          : `Ward lifetime averages ${lifetimeStr}.`)
      suggestion =
        `Closing the gap is sentry-cadence work — keep one in your inventory across the laning phase.`
    } else {
      finding =
        `Strong vision pressure: ${dewardsPerGame.toFixed(1)} dewards/game vs ${baseline.dewardsPerGame.toFixed(1)} target. ` +
        `Wards live ${lifetimeStr} on average.`
      suggestion =
        `As a core, vision clearing is the cheapest map control you can buy. Keep buying sentries before mid-game smokes.`
    }
  } else {
    if (severity === 'concerning') {
      finding =
        `${obsPerGame.toFixed(1)} observers/game vs ${baseline.obsPerGame.toFixed(1)} ${roleLabel(inferredRole)} baseline. ` +
        `Wards average ${lifetimeStr} of life — ${lifetimeComparison} the ${formatMmSs(lifetimeBaselineSec)} bracket norm.` +
        (mismatchPct != null
          ? ` ${Math.round(mismatchPct)}% of deaths happened in regions you hadn't warded.`
          : '')
      suggestion =
        mismatchPct != null && mismatchPct > 40
          ? `Move 2 wards/game from your jungle to the river — most of your deaths are coming from rotations, not ganks in farm.`
          : `Place an observer on cooldown — even an obvious spot beats no vision. Target ${baseline.obsPerGame.toFixed(0)}/game minimum.`
    } else if (severity === 'ok') {
      finding =
        `${obsPerGame.toFixed(1)} observers/game vs ${baseline.obsPerGame.toFixed(1)} ${roleLabel(inferredRole)} baseline. ` +
        `Wards live ${lifetimeStr} (${lifetimeComparison} ${formatMmSs(lifetimeBaselineSec)} bracket).` +
        (mismatchPct != null ? ` Vision-death mismatch sits at ${Math.round(mismatchPct)}%.` : '')
      suggestion =
        `Push for ${baseline.obsPerGame.toFixed(0)} observers + ${baseline.senPerGame.toFixed(0)} sentries/game. ` +
        `Sentries pay for themselves the first time you spot a smoke.`
    } else {
      finding =
        `${obsPerGame.toFixed(1)} obs and ${senPerGame.toFixed(1)} sentries/game vs ${baseline.obsPerGame.toFixed(1)}/${baseline.senPerGame.toFixed(1)} baseline. ` +
        `Wards live ${lifetimeStr}.`
      suggestion =
        `Vision count is there. Next bottleneck is placement — spot-check whether your wards see incoming smokes versus just the rune.`
    }
  }

  // Footnote
  const note =
    `${eligibleMatches}/${totalMatches} matches had ward logs · ` +
    `${placements.length} placements mapped` +
    (mismatchPct != null ? ` · ${deathSamples} deaths scored for vision mismatch` : '')

  // Roast facts (every key referenced by a vision template appears here).
  const roastFacts: Record<string, string | number> = {
    obs: obsPerGame.toFixed(1),
    obs_baseline: baseline.obsPerGame.toFixed(1),
    sen: senPerGame.toFixed(1),
    sen_baseline: baseline.senPerGame.toFixed(1),
    dewards: dewardsPerGame.toFixed(1),
    dewards_baseline: baseline.dewardsPerGame.toFixed(1),
    seconds: Math.round(avgLifetimeSec),
    lifetime_baseline_sec: lifetimeBaselineSec,
    mismatch: mismatchPct != null ? Math.round(mismatchPct) : 0,
    headline: headline.toFixed(1),
    headline_baseline: headlineBase.toFixed(1),
    role: roleLabel(inferredRole),
  }

  return {
    id: 'vision',
    title: 'Vision',
    metric: Math.round(headline * 10) / 10,
    metricLabel: headlineLabel,
    baseline: Math.round(headlineBase * 10) / 10,
    baselineLabel: headlineLabel,
    severity,
    severityLabel,
    finding,
    suggestion,
    note,
    roastFacts,
    vision: {
      placements,
      obsPerGame,
      senPerGame,
      dewardsPerGame,
      avgLifetimeSec,
      avgObsLifetimeSec: avgObs,
      avgSenLifetimeSec: avgSen,
      obsBaseline: baseline.obsPerGame,
      senBaseline: baseline.senPerGame,
      dewardsBaseline: baseline.dewardsPerGame,
      lifetimeBaselineSec,
      mismatchPct,
      deathSamples,
      deathSampleMatches,
      eligibleMatches,
      totalMatches,
      inferredRole,
    },
  }
}

function collectPlacements(
  placed: NonNullable<ODMatchPlayer['obs_log']>,
  left: NonNullable<ODMatchPlayer['obs_left_log']>,
  kind: WardKind,
  defaultDurationSec: number,
  matchDurationSec: number,
  outPlacements: WardPlacement[],
  outLifetimes: number[],
  outMatchCoords: { x: number; y: number }[]
): void {
  for (let i = 0; i < placed.length; i++) {
    const w = placed[i]
    if (typeof w.x !== 'number' || typeof w.y !== 'number') continue

    const matched = left[i]
    let outcome: WardOutcome
    let lifetime: number
    if (matched && typeof matched.time === 'number') {
      lifetime = Math.max(0, matched.time - w.time)
      // Heuristic: if the ward died earlier than its natural duration, it
      // was almost certainly dewarded. Some wards die to building
      // destruction (Tinker rearm rocket), but those are rare enough not
      // to matter in aggregate.
      // TODO: refine — some wards may be destroyed in ways not logged.
      outcome = lifetime + 5 < defaultDurationSec ? 'dewarded' : 'expired'
    } else {
      // No matching left-event. Either still alive at match end, or the
      // expiry wasn't logged. Cap at match duration.
      const naturalEnd = w.time + defaultDurationSec
      const cap = matchDurationSec > 0 ? matchDurationSec : naturalEnd
      lifetime = Math.max(0, Math.min(naturalEnd, cap) - w.time)
      outcome = naturalEnd <= cap ? 'expired' : 'still_alive_at_match_end'
    }

    outPlacements.push({ kind, x: w.x, y: w.y, outcome, lifetimeSec: lifetime })
    outLifetimes.push(lifetime)
    outMatchCoords.push({ x: w.x, y: w.y })
  }
}

function hasNearbyWard(
  dx: number,
  dy: number,
  wardCoords: { x: number; y: number }[]
): boolean {
  for (const w of wardCoords) {
    const dxx = dx - w.x
    const dyy = dy - w.y
    if (dxx * dxx + dyy * dyy <= MISMATCH_RADIUS_GRID * MISMATCH_RADIUS_GRID) {
      return true
    }
  }
  return false
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function formatMmSs(sec: number): string {
  const s = Math.round(sec)
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

function roleLabel(role: 'core' | 'support' | 'flex' | 'unknown'): string {
  if (role === 'support') return 'support'
  if (role === 'core') return 'core'
  if (role === 'flex') return 'flex'
  return 'pub'
}

function roleHeadlineLabel(role: 'core' | 'support' | 'flex' | 'unknown'): string {
  return role === 'core' ? 'dewards/game' : 'observers/game'
}

function roleHeadlineBaseline(
  role: 'core' | 'support' | 'flex' | 'unknown',
  baseline: { obsPerGame: number; dewardsPerGame: number }
): number {
  return Math.round((role === 'core' ? baseline.dewardsPerGame : baseline.obsPerGame) * 10) / 10
}
