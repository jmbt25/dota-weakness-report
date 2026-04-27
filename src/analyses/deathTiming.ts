import type { AnalysisResult, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'

const BUCKET_MIN = 5
// 10 contiguous 5-min windows (0-5, 5-10, …, 45-50) plus a "50+" tail.
const NUM_BUCKETS = 11
const TAIL_BUCKET = NUM_BUCKETS - 1

function bucketLabel(i: number): string {
  if (i === TAIL_BUCKET) return '50+'
  return `${i * BUCKET_MIN}–${(i + 1) * BUCKET_MIN}`
}

/**
 * Buckets the user's deaths into 5-minute windows and compares each bucket
 * against the rank+role baseline. Severity is driven by the *total* death
 * ratio (so the headline number is what's flagged, not a single noisy bucket).
 *
 * For parsed matches we use the `objectives` array. Unparsed matches contribute
 * a uniform smear of total deaths across match duration.
 */
export function analyzeDeathTiming(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket } = input
  const baseline = getBaseline(inferredRole, rankBucket)

  const buckets = new Array(NUM_BUCKETS).fill(0)
  let matchesUsed = 0
  let parsedCount = 0

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    matchesUsed++
    if (isParsed(detail) && Array.isArray(detail.objectives)) {
      parsedCount++
      for (const obj of detail.objectives) {
        if (obj.type !== 'CHAT_MESSAGE_HERO_KILL') continue
        // OpenDota encodes the victim either via `key` (number = slot) or
        // `value`; either way we want events where the user's slot is the
        // victim, not the killer.
        const victimSlot =
          typeof obj.key === 'number' ? obj.key
          : typeof obj.value === 'number' ? obj.value
          : undefined
        if (victimSlot !== player.player_slot) continue
        const minute = Math.max(0, Math.floor(obj.time / 60))
        const bucket = Math.min(TAIL_BUCKET, Math.floor(minute / BUCKET_MIN))
        buckets[bucket] += 1
      }
    } else {
      // Unparsed fallback: smear total deaths uniformly across match length.
      const dur = Math.max(1, m.duration)
      const matchBuckets = Math.min(NUM_BUCKETS, Math.ceil(dur / 60 / BUCKET_MIN))
      const perBucket = m.deaths / matchBuckets
      for (let i = 0; i < matchBuckets; i++) buckets[i] += perBucket
    }
  }

  if (matchesUsed === 0) {
    return unmeasured('No match details available — death timing can’t be computed.')
  }

  const youPerBucket = buckets.map((b) => b / matchesUsed)
  const youPerGame = youPerBucket.reduce((a, b) => a + b, 0)
  const baseTotal = baseline.deaths.perGame
  const totalRatio = baseTotal > 0 ? youPerGame / baseTotal : 0

  // Find the worst bucket for prose targeting.
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

  // Severity is anchored to the total — much more stable than per-bucket noise.
  const severity =
    totalRatio >= 1.3 ? 'concerning'
    : totalRatio >= 1.1 ? 'ok'
    : 'good'

  const parsedNote =
    parsedCount === 0
      ? 'No parsed replays in this window — timings are approximated by smearing deaths across match duration.'
      : parsedCount < matchesUsed
        ? `${parsedCount}/${matchesUsed} matches had parsed replays; the rest are approximated.`
        : undefined

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `You die ${youPerGame.toFixed(1)} times per game vs. a ${baseTotal.toFixed(1)} baseline for your rank. The ${bucketLabel(worstIdx)}-min window is the worst.`
    suggestion =
      worstIdx <= 2
        ? 'Most of those deaths happen during laning. Tighten up positioning, ward your defensive triangle, and don’t commit to trades you can’t end.'
        : worstIdx >= 6
          ? 'Late-game deaths are usually catch-out deaths. Stop solo-farming the map once Roshan is up, and group with at least one teammate.'
          : 'Mid-game deaths usually come from contesting objectives without vision. Drop a sentry/observer pair before pushing or smoking.'
  } else if (severity === 'ok') {
    finding = `Death rate (${youPerGame.toFixed(1)}/game) is slightly above the ${baseTotal.toFixed(1)} baseline for your rank. The ${bucketLabel(worstIdx)}-min window is where you die most often.`
    suggestion = 'Watch the replay of one match where you died most in this window — usually one specific bad rotation explains the pattern.'
  } else {
    finding = `Death rate is healthy: ${youPerGame.toFixed(1)}/game vs. a ${baseTotal.toFixed(1)} baseline.`
    suggestion = 'Keep prioritizing position over greed. This is one of your strengths.'
  }

  return {
    id: 'death-timing',
    title: 'Death timing',
    metric: Math.round(youPerGame * 10) / 10,
    metricLabel: 'deaths/game',
    baseline: Math.round(baseTotal * 10) / 10,
    baselineLabel: 'deaths/game',
    severity,
    finding,
    suggestion,
    note: parsedNote,
    chart: {
      kind: 'bars',
      valueName: 'You',
      baselineName: 'Baseline',
      data: youPerBucket.map((v, i) => ({
        label: bucketLabel(i),
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
    suggestion: 'Try again after the parser has a chance to process your matches.',
  }
}
