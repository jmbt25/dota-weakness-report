import type { AnalysisResult, ReportInput } from '../types'
import { getRoleBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'

const BUCKET_MIN = 5
const NUM_BUCKETS = 10 // covers up to 50 minutes; longer matches go in the last bucket

/**
 * Buckets the user's deaths into 5-minute windows and compares each bucket
 * against the role baseline. Flags windows where the user dies >1.5x the
 * baseline rate.
 *
 * For parsed matches we use the `objectives` array (CHAT_MESSAGE_HERO_KILL
 * entries with the user's player_slot as the victim). For unparsed matches
 * we approximate by spreading total deaths uniformly across the match
 * duration — better than nothing, but the prose finding will say so.
 */
export function analyzeDeathTiming(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole } = input
  const baseline = getRoleBaseline(inferredRole).deaths.perBucket

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
      // Death events on the user's hero are CHAT_MESSAGE_HERO_KILL where
      // the player_slot field references the *killer*. The victim is encoded
      // via `key` (target slot) on some replays, or by the slot field on
      // others. To stay robust, we look at events that mention the user's
      // slot as the victim/key.
      for (const obj of detail.objectives) {
        if (obj.type !== 'CHAT_MESSAGE_HERO_KILL') continue
        const victimSlot =
          typeof obj.key === 'number' ? obj.key
          : typeof obj.value === 'number' ? obj.value
          : undefined
        if (victimSlot !== player.player_slot) continue
        const minute = Math.max(0, Math.floor(obj.time / 60))
        const bucket = Math.min(NUM_BUCKETS - 1, Math.floor(minute / BUCKET_MIN))
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

  const youPerBucket = buckets.map((b) => (matchesUsed > 0 ? b / matchesUsed : 0))

  // Find worst bucket vs baseline (largest ratio).
  let worstIdx = 0
  let worstRatio = 0
  for (let i = 0; i < NUM_BUCKETS; i++) {
    const base = baseline[i] ?? baseline[baseline.length - 1] ?? 1
    const ratio = base > 0 ? youPerBucket[i] / base : 0
    if (ratio > worstRatio) {
      worstRatio = ratio
      worstIdx = i
    }
  }

  const totalYou = youPerBucket.reduce((a, b) => a + b, 0)
  const totalBaseline = baseline.slice(0, NUM_BUCKETS).reduce((a, b) => a + b, 0)

  const severity =
    worstRatio >= 1.5 ? 'concerning'
    : worstRatio >= 1.2 ? 'ok'
    : 'good'

  const window = `${worstIdx * BUCKET_MIN}-${(worstIdx + 1) * BUCKET_MIN} min`
  const parsedNote =
    matchesUsed > 0 && parsedCount === 0
      ? ' (Approximated — none of these matches have parsed replays, so timing is averaged across match duration.)'
      : parsedCount < matchesUsed
        ? ` (${parsedCount}/${matchesUsed} matches had parsed replays; the rest are approximated.)`
        : ''

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `You die ${worstRatio.toFixed(1)}x more than the average ${inferredRole} during the ${window} window.${parsedNote}`
    suggestion =
      worstIdx <= 2
        ? 'Most of those deaths happen during laning. Tighten up positioning, ward your defensive triangle, and don’t commit to trades you can’t end.'
        : worstIdx >= 6
          ? 'Late-game deaths are usually catch-out deaths. Stop solo-farming the map once Roshan is up, and group with at least one teammate.'
          : 'Mid-game deaths usually come from contesting objectives without vision. Drop a sentry/observer pair before pushing or smoking.'
  } else if (severity === 'ok') {
    finding = `Your death timing is broadly in line with the ${inferredRole} baseline, though you die slightly more during the ${window} window.${parsedNote}`
    suggestion = 'Watch the replay of one match where you died most in this window — usually one specific bad rotation explains the pattern.'
  } else {
    finding = `You die ${totalYou.toFixed(1)} times per game vs. a baseline of ${totalBaseline.toFixed(1)} — death distribution looks healthy.${parsedNote}`
    suggestion = 'Keep prioritizing position over greed. This is one of your strengths.'
  }

  return {
    id: 'death-timing',
    title: 'Death timing',
    metric: Math.round(totalYou * 10) / 10,
    metricLabel: 'deaths/game',
    baseline: Math.round(totalBaseline * 10) / 10,
    baselineLabel: 'baseline',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'bars',
      valueName: 'You',
      baselineName: 'Baseline',
      data: youPerBucket.map((v, i) => ({
        label: `${i * BUCKET_MIN}–${(i + 1) * BUCKET_MIN}`,
        value: Math.round(v * 100) / 100,
        baseline: baseline[i] ?? 0,
      })),
    },
  }
}
