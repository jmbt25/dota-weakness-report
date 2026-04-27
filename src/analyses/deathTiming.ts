import type { AnalysisResult, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'

const BUCKET_MIN = 5
// 10 contiguous 5-min windows (0-5, …, 45-50) plus a "50+" tail.
const NUM_BUCKETS = 11
const TAIL_BUCKET = NUM_BUCKETS - 1

function bucketLabel(i: number): string {
  if (i === TAIL_BUCKET) return '50+'
  return `${i * BUCKET_MIN}–${(i + 1) * BUCKET_MIN}`
}

function bucketTick(i: number): string {
  if (i === TAIL_BUCKET) return '50+'
  return String(i * BUCKET_MIN)
}

/**
 * Death timing analysis.
 *
 * Headline number is total deaths/game, sourced from `player.deaths` (always
 * populated on every match — parsed and unparsed alike). The bucket
 * distribution comes from parsed `objectives` events when available, with a
 * uniform-smear fallback for unparsed matches.
 *
 * Sanity guard (v4): if the headline number rounds to 0 across N>5 matches,
 * something has gone wrong with the data — return 'unmeasured' rather than
 * showing "0 deaths/game" as a Healthy result.
 */
export function analyzeDeathTiming(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket, roleDistribution } = input
  const baseline = getBaseline(inferredRole, rankBucket, roleDistribution)

  const buckets = new Array(NUM_BUCKETS).fill(0)
  let totalDeaths = 0
  let matchesUsed = 0
  let parsedCount = 0
  let timingsFromParse = 0

  // Diagnostic samples surfaced in the console — visible in production so we
  // can verify field shapes against real OpenDota responses.
  const debugSamples: { match: number; deaths: unknown; isParsed: boolean }[] = []

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    // `deaths` is post-game stats, not replay-derived — it should always be
    // a non-negative integer. Skip explicitly if it's null/undefined.
    if (player.deaths == null) {
      if (debugSamples.length < 5) {
        debugSamples.push({ match: m.match_id, deaths: player.deaths, isParsed: isParsed(detail) })
      }
      continue
    }

    matchesUsed++
    totalDeaths += player.deaths

    if (debugSamples.length < 5) {
      debugSamples.push({ match: m.match_id, deaths: player.deaths, isParsed: isParsed(detail) })
    }

    // Bucket distribution: if parsed `objectives` exist, try to extract death
    // timestamps. Otherwise smear total deaths uniformly across match length.
    let bucketsForThisMatch = 0
    if (isParsed(detail) && Array.isArray(detail.objectives)) {
      parsedCount++
      for (const obj of detail.objectives) {
        if (obj.type !== 'CHAT_MESSAGE_HERO_KILL') continue
        const victimSlot =
          typeof obj.key === 'number' ? obj.key
          : typeof obj.value === 'number' ? obj.value
          : undefined
        if (victimSlot !== player.player_slot) continue
        const minute = Math.max(0, Math.floor(obj.time / 60))
        const bucket = Math.min(TAIL_BUCKET, Math.floor(minute / BUCKET_MIN))
        buckets[bucket] += 1
        bucketsForThisMatch++
      }
    }
    if (bucketsForThisMatch > 0) {
      timingsFromParse++
    } else {
      // Fall back to smearing — covers unparsed matches AND parsed matches
      // where the objectives parser didn't yield any victim events for us.
      const dur = Math.max(1, m.duration)
      const matchBuckets = Math.min(NUM_BUCKETS, Math.ceil(dur / 60 / BUCKET_MIN))
      const perBucket = player.deaths / matchBuckets
      for (let i = 0; i < matchBuckets; i++) buckets[i] += perBucket
    }
  }

  if (debugSamples.length > 0) {
    // eslint-disable-next-line no-console
    console.debug('[death-timing] samples', { totalDeaths, matchesUsed, samples: debugSamples })
  }

  if (matchesUsed === 0) {
    return unmeasured('No match details available — death timing can’t be computed.')
  }

  const youPerGame = totalDeaths / matchesUsed

  // Sanity check: 0 deaths/game across multiple matches is implausible —
  // means our data extraction failed somewhere.
  if (youPerGame < 0.5 && matchesUsed > 5) {
    return unmeasured(
      `Couldn’t compute death rate (got ${totalDeaths} deaths across ${matchesUsed} matches, which is implausible). Please retry — this is usually transient.`
    )
  }

  const youPerBucket = buckets.map((b) => b / matchesUsed)
  const baseTotal = baseline.deaths.perGame
  const totalRatio = baseTotal > 0 ? youPerGame / baseTotal : 0

  // Worst bucket for prose targeting.
  let worstIdx = 0
  let worstRatio = 0
  for (let i = 0; i < NUM_BUCKETS; i++) {
    const base = baseline.deaths.perBucket[i] ?? baseline.deaths.perBucket.at(-1) ?? 1
    const ratio = base > 0 ? youPerBucket[i] / base : 0
    if (ratio > worstRatio) {
      worstRatio = ratio
      worstIdx = i
    }
  }

  // v6 calibration: <0.9 = good (Strong), 0.9-1.1 = good (Healthy),
  // 1.1-1.25 = ok (Watch), >1.25 = concerning. (Lower deaths is better, so
  // ratio < 1 means user dies less than baseline.)
  const severity =
    totalRatio >= 1.25 ? 'concerning'
    : totalRatio >= 1.1 ? 'ok'
    : 'good'

  // Footnote about the source of the bucket distribution.
  const note =
    timingsFromParse === 0
      ? `Bucket distribution is approximated by smearing total deaths across match duration (no parsed timing data available). Headline number is exact.`
      : timingsFromParse < matchesUsed
        ? `${timingsFromParse}/${matchesUsed} matches contributed parsed death timing; the rest are smeared.`
        : `${parsedCount}/${matchesUsed} matches had parsed replays.`

  const worstBucketDeaths = youPerBucket[worstIdx] ?? 0
  const worstBucketBaseline = baseline.deaths.perBucket[worstIdx] ?? 0
  const worstBucketPhrase = `${worstBucketDeaths.toFixed(1)} deaths/game in the ${bucketLabel(worstIdx)}-min window (vs ${worstBucketBaseline.toFixed(1)} baseline)`

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `You die ${youPerGame.toFixed(1)} times per game vs. a ${baseTotal.toFixed(1)} baseline for your rank+role. Worst window: ${worstBucketPhrase}.`
    suggestion =
      worstIdx <= 2
        ? `Most of those deaths happen during laning (${worstBucketDeaths.toFixed(1)}/game pre-10 min). Tighten positioning, ward your defensive triangle, and don't commit to trades you can't end.`
        : worstIdx >= 6
          ? `${worstBucketDeaths.toFixed(1)} deaths/game ${bucketLabel(worstIdx)} min in are catch-out deaths. Stop solo-farming once Roshan is up — group with at least one teammate.`
          : `${worstBucketDeaths.toFixed(1)} deaths/game in the ${bucketLabel(worstIdx)}-min window means you're contesting objectives without vision. Drop a sentry/observer pair before pushing or smoking.`
  } else if (severity === 'ok') {
    finding = `Death rate (${youPerGame.toFixed(1)}/game) is slightly above the ${baseTotal.toFixed(1)} baseline. Worst window: ${worstBucketPhrase}.`
    suggestion = `Pull up one of your matches with deaths in the ${bucketLabel(worstIdx)}-min window — usually one specific bad rotation explains the ${worstBucketDeaths.toFixed(1)}/game pattern.`
  } else {
    finding = `Death rate is healthy: ${youPerGame.toFixed(1)}/game vs. a ${baseTotal.toFixed(1)} baseline.`
    suggestion = `Even your worst window (${bucketLabel(worstIdx)}-min, ${worstBucketDeaths.toFixed(1)}/game) is at or below baseline. Keep prioritizing position over greed.`
  }

  // Death timing: lower is better, so "Strong" fires when ratio <= 0.9
  // (10%+ better than baseline).
  const severityLabel =
    severity === 'good' && totalRatio <= 0.9 ? 'Strong' : undefined

  // Late-game ratio for the "your hero is a creep" roast trigger.
  const lateBuckets = youPerBucket.slice(8) // 40-50 + 50+ tail
  const lateBaseline = baseline.deaths.perBucket.slice(8)
  const lateUser = lateBuckets.reduce((a, b) => a + b, 0)
  const lateBase = lateBaseline.reduce((a, b) => a + b, 0)
  const lateRatio = lateBase > 0 ? lateUser / lateBase : 0

  return {
    id: 'death-timing',
    title: 'Death timing',
    metric: Math.round(youPerGame * 10) / 10,
    metricLabel: 'deaths/game',
    baseline: Math.round(baseTotal * 10) / 10,
    baselineLabel: 'deaths/game',
    severity,
    severityLabel,
    finding,
    suggestion,
    note,
    roastFacts: {
      deaths_per_game: youPerGame.toFixed(1),
      baseline_dpg: baseTotal.toFixed(1),
      worst_window: bucketLabel(worstIdx),
      late_dpg: lateRatio.toFixed(1),
    },
    chart: {
      kind: 'bars',
      valueName: 'You',
      baselineName: 'Baseline',
      data: youPerBucket.map((v, i) => ({
        label: bucketTick(i),
        value: Math.round(v * 100) / 100,
        baseline: baseline.deaths.perBucket[i] ?? 0,
      })),
    },
  }
}

function unmeasured(finding: string): AnalysisResult {
  return {
    id: 'death-timing',
    title: 'Death timing',
    metric: 0,
    metricLabel: '',
    baseline: 0,
    baselineLabel: '',
    severity: 'unmeasured',
    finding,
    suggestion: 'Try again in a minute — if the issue persists, it’s a data shape problem on our side.',
  }
}
