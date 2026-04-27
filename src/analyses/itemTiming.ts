import type { AnalysisResult, ReportInput } from '../types'
import { ITEM_GOOD_TIMING_SEC } from '../lib/baselines'
import { findPlayerInMatch } from '../lib/matchHelpers'

/**
 * For the user's top 3 most-played heroes, find the median timing of the
 * most-purchased core item (any item in ITEM_GOOD_TIMING_SEC) and compare
 * it to the hardcoded benchmark.
 *
 * If no parsed matches with purchase logs exist for the top heroes, returns
 * 'unmeasured' rather than a fake zero.
 */
export function analyzeItemTiming(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, heroName } = input

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
    const itemTimings = new Map<string, number[]>()
    for (const m of matches) {
      if (m.hero_id !== heroId) continue
      const detail = details[m.match_id]
      if (!detail) continue
      const player = findPlayerInMatch(detail, accountId)
      if (!player?.purchase_log?.length) continue
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
      games: bestCount,
    })
  }

  if (findings.length === 0) {
    return {
      id: 'item-timing',
      title: 'Item timing',
      metric: 0,
      metricLabel: '',
      baseline: 0,
      baselineLabel: '',
      severity: 'unmeasured',
      finding: 'No parsed matches with purchase logs found for your top heroes.',
      suggestion: 'Once your matches finish parsing, re-run the report — this card will fill in.',
    }
  }

  let worstDelta = 0
  for (const f of findings) {
    worstDelta = Math.max(worstDelta, f.medianSec - f.benchmarkSec)
  }
  const severity =
    worstDelta >= 5 * 60 ? 'concerning'
    : worstDelta >= 2 * 60 ? 'ok'
    : 'good'

  const lines = findings.map(
    (f) =>
      `${heroName(f.heroId)} → ${itemDisplay(f.item)} median ${fmtMin(f.medianSec)} vs target ${fmtMin(f.benchmarkSec)} (${f.games} game${f.games === 1 ? '' : 's'})`
  )
  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `Item timings are ${Math.round(worstDelta / 60)}+ min late. ${lines[0]}.`
    suggestion = 'Cut situational items out of your build — get the core item, then react to the lobby. A 4-min-late Battlefury is just a 4-min-late spike.'
  } else if (severity === 'ok') {
    finding = `Timings slightly behind benchmark. ${lines.join('; ')}.`
    suggestion = 'Stack ancients between waves on your top hero — the 2-3 min you’re losing is exactly what a stack camp recovers.'
  } else {
    finding = `Item timings look healthy. ${lines.join('; ')}.`
    suggestion = 'Solid. Next thing to optimize is item *order* — pick fights when your spike lands, not before.'
  }

  return {
    id: 'item-timing',
    title: 'Item timing',
    metric: Math.round(findings[0].medianSec / 60),
    metricLabel: `min for ${itemDisplay(findings[0].item)}`,
    baseline: Math.round(findings[0].benchmarkSec / 60),
    baselineLabel: 'min target',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'bars',
      valueName: 'You (min)',
      baselineName: 'Target (min)',
      // Two-line tick labels: item name on top, hero name underneath. The
      // ReportCard renders these by splitting on this separator.
      xMultilineSplit: '\n',
      data: findings.map((f) => ({
        label: `${itemDisplay(f.item)}\n${heroName(f.heroId)}`,
        value: Math.round(f.medianSec / 60),
        baseline: Math.round(f.benchmarkSec / 60),
      })),
    },
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
