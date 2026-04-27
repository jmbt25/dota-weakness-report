import type { AnalysisResult, ReportInput } from '../types'
import { ITEM_GOOD_TIMING_SEC } from '../lib/baselines'
import { findPlayerInMatch } from '../lib/matchHelpers'

/**
 * For the user's top 3 most-played heroes, find the median timing of the
 * most-purchased "core" item (any item in ITEM_GOOD_TIMING_SEC) and compare
 * it to the hardcoded "good" timing.
 *
 * Requires parsed matches (purchase_log is parsed-only). Heroes without
 * parsed data simply get skipped.
 */
export function analyzeItemTiming(input: ReportInput): AnalysisResult {
  const { matches, details, accountId } = input

  // Count games per hero.
  const heroCounts = new Map<number, number>()
  for (const m of matches) heroCounts.set(m.hero_id, (heroCounts.get(m.hero_id) ?? 0) + 1)
  const top3Heroes = [...heroCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([heroId]) => heroId)

  interface HeroFinding {
    heroId: number
    item: string
    medianSec: number
    benchmarkSec: number
    games: number
  }
  const findings: HeroFinding[] = []

  for (const heroId of top3Heroes) {
    // For each hero, gather purchase_log entries across that hero's matches.
    const itemTimings = new Map<string, number[]>()
    let games = 0
    for (const m of matches) {
      if (m.hero_id !== heroId) continue
      const detail = details[m.match_id]
      if (!detail) continue
      const player = findPlayerInMatch(detail, accountId)
      if (!player?.purchase_log?.length) continue
      games++
      // Take the *first* purchase of each item per match (built it once).
      const seen = new Set<string>()
      for (const entry of player.purchase_log) {
        const key = entry.key
        if (!ITEM_GOOD_TIMING_SEC[key]) continue
        if (seen.has(key)) continue
        seen.add(key)
        const arr = itemTimings.get(key) ?? []
        arr.push(entry.time)
        itemTimings.set(key, arr)
      }
    }
    // Pick the most-frequently-built core item for this hero.
    let bestItem: string | null = null
    let bestCount = 0
    for (const [item, times] of itemTimings) {
      if (times.length > bestCount) {
        bestItem = item
        bestCount = times.length
      }
    }
    if (!bestItem || bestCount === 0) continue
    const times = itemTimings.get(bestItem)!
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    findings.push({
      heroId,
      item: bestItem,
      medianSec: median,
      benchmarkSec: ITEM_GOOD_TIMING_SEC[bestItem],
      games,
    })
  }

  // Aggregate severity.
  let worstDelta = 0 // seconds late
  for (const f of findings) {
    worstDelta = Math.max(worstDelta, f.medianSec - f.benchmarkSec)
  }
  const severity =
    findings.length === 0 ? 'ok'
    : worstDelta >= 5 * 60 ? 'concerning'
    : worstDelta >= 2 * 60 ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (findings.length === 0) {
    finding = 'No parsed matches with purchase logs found for your top heroes — item timing can’t be measured yet.'
    suggestion = 'Request a replay parse on dotabuff/opendota for a few recent matches, then re-run this report.'
  } else {
    const lines = findings.map(
      (f) =>
        `Hero ${f.heroId} → ${itemDisplay(f.item)} median ${fmtMin(f.medianSec)} vs target ${fmtMin(f.benchmarkSec)} (${f.games} games)`
    )
    if (severity === 'concerning') {
      finding = `Item timings are ${Math.round(worstDelta / 60)}+ minutes late. ${lines[0]}.`
      suggestion = 'Cut the situational items out of your build — get the core item, then react to the lobby. A 4-min-late Battlefury is just a 4-min-late spike.'
    } else if (severity === 'ok') {
      finding = `Timings are slightly behind benchmark. ${lines.join('; ')}.`
      suggestion = 'Stack ancients between waves on your top hero — that 2-3 min you’re losing is exactly what a stack camp recovers.'
    } else {
      finding = `Item timings look healthy. ${lines.join('; ')}.`
      suggestion = 'Solid. Next thing to optimize is item *order* — pick fights when your spike lands, not before.'
    }
  }

  // Chart shows median vs benchmark per hero finding.
  return {
    id: 'item-timing',
    title: 'Item timing',
    metric: findings[0]?.medianSec ? Math.round(findings[0].medianSec / 60) : 0,
    metricLabel: findings[0] ? `min for ${itemDisplay(findings[0].item)}` : 'min',
    baseline: findings[0]?.benchmarkSec ? Math.round(findings[0].benchmarkSec / 60) : 0,
    baselineLabel: 'target min',
    severity,
    finding,
    suggestion,
    chart:
      findings.length > 0
        ? {
            kind: 'bars',
            valueName: 'You (min)',
            baselineName: 'Target (min)',
            data: findings.map((f) => ({
              label: `${itemDisplay(f.item)} (H${f.heroId})`,
              value: Math.round(f.medianSec / 60),
              baseline: Math.round(f.benchmarkSec / 60),
            })),
          }
        : undefined,
  }
}

function fmtMin(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function itemDisplay(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
