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

  // Purchase-log availability is a property of the match, not of which
  // hero you played in it. Count it once across the whole filtered match
  // set so the footnote denominator is consistent regardless of which
  // heroes happen to be in the top 3 — otherwise role-split values stop
  // adding up (e.g. core 9/25 + support 12/25 ≠ all-games 13/50).
  let parsedMatchesWithPurchaseLog = 0
  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (player?.purchase_log?.length) parsedMatchesWithPurchaseLog++
  }

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
      note: `${parsedMatchesWithPurchaseLog}/${matches.length} matches had purchase logs.`,
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
  // Pick the worst-delta hero/item to anchor specific advice on.
  const worst = findings.reduce((acc, f) => (f.medianSec - f.benchmarkSec > acc.medianSec - acc.benchmarkSec ? f : acc), findings[0])
  const worstHeroName = heroName(worst.heroId)
  const worstItemName = itemDisplay(worst.item)
  const worstDeltaMin = Math.round((worst.medianSec - worst.benchmarkSec) / 60)
  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    finding = `Item timings are ${Math.round(worstDelta / 60)}+ min late. ${lines[0]}.`
    suggestion = `On ${worstHeroName}, your ${worstItemName} is landing ${worstDeltaMin} min late — cut situational items out of the build, get ${worstItemName} first, then react to the lobby.`
  } else if (severity === 'ok') {
    finding = `Timings slightly behind benchmark. ${lines.join('; ')}.`
    suggestion = `On ${worstHeroName} specifically, you're ${worstDeltaMin} min behind on ${worstItemName} — a stack-camp pull cycle in your jungle every minute is the cheapest way to recover that.`
  } else {
    finding = `Item timings look healthy. ${lines.join('; ')}.`
    suggestion = `Timings on ${worstHeroName}'s ${worstItemName} are on-pace — next bottleneck is item *order*: pick fights when your spike lands, not before.`
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
    note: `${parsedMatchesWithPurchaseLog}/${matches.length} matches had purchase logs.`,
    roastFacts: {
      hero: worstHeroName,
      item: worstItemName,
      actual_min: Math.round(worst.medianSec / 60),
      target_min: Math.round(worst.benchmarkSec / 60),
    },
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
