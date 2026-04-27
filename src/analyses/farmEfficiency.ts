import type { AnalysisResult, ReportInput } from '../types'
import { getRoleBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'

/**
 * Farm efficiency: average GPM/XPM at the 10-minute and 20-minute marks vs.
 * the role baseline. We use the per-minute `gold_t` / `xp_t` arrays from
 * parsed matches (they are cumulative totals indexed by minute).
 *
 * Falls back to whole-match GPM/XPM for unparsed matches.
 */
export function analyzeFarmEfficiency(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole } = input
  const base = getRoleBaseline(inferredRole).farm

  const samples10gpm: number[] = []
  const samples20gpm: number[] = []
  const samples10xpm: number[] = []
  const samples20xpm: number[] = []
  let fallbackUsed = 0

  for (const m of matches) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    if (isParsed(detail) && player.gold_t && player.xp_t) {
      // gold_t[10] = cumulative gold at minute 10 → GPM = total/10
      const g10 = player.gold_t[10]
      const g20 = player.gold_t[20]
      const x10 = player.xp_t[10]
      const x20 = player.xp_t[20]
      if (typeof g10 === 'number') samples10gpm.push(g10 / 10)
      if (typeof g20 === 'number') samples20gpm.push(g20 / 20)
      if (typeof x10 === 'number') samples10xpm.push(x10 / 10)
      if (typeof x20 === 'number') samples20xpm.push(x20 / 20)
    } else {
      fallbackUsed++
      // Use the whole-match averages as a proxy for both buckets.
      samples10gpm.push(player.gold_per_min)
      samples20gpm.push(player.gold_per_min)
      samples10xpm.push(player.xp_per_min)
      samples20xpm.push(player.xp_per_min)
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const gpm10 = Math.round(avg(samples10gpm))
  const gpm20 = Math.round(avg(samples20gpm))
  const xpm10 = Math.round(avg(samples10xpm))
  const xpm20 = Math.round(avg(samples20xpm))

  // Severity is driven by the worse of the two GPM windows vs baseline.
  const ratio10 = gpm10 / base.gpm10
  const ratio20 = gpm20 / base.gpm20
  const worst = Math.min(ratio10, ratio20)
  const severity =
    worst >= 0.95 ? 'good'
    : worst >= 0.85 ? 'ok'
    : 'concerning'

  const fallbackNote =
    fallbackUsed === matches.length
      ? ' (Approximated using whole-match GPM/XPM — none of these matches have parsed replays.)'
      : fallbackUsed > 0
        ? ` (${fallbackUsed} of ${matches.length} matches were unparsed and used whole-match averages.)`
        : ''

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    if (ratio10 < ratio20) {
      finding = `Your 10-min GPM (${gpm10}) is well below the ${inferredRole} baseline (${base.gpm10}). The lane stage is bleeding economy.${fallbackNote}`
      suggestion = inferredRole === 'support'
        ? 'Even as a 4 or 5, target ~25 last hits by 10 min when your carry is missing CS, and grab pull camps on cycle.'
        : 'Cut creep aggression so the wave settles in your favor. Free farm > a few fancy trades.'
    } else {
      finding = `Your 20-min GPM (${gpm20}) is below the ${inferredRole} baseline (${base.gpm20}). You win lane but stall after.${fallbackNote}`
      suggestion = 'After laning, transition to ancient stacks/jungle camps between objectives instead of TPing across the map for fights you can’t win.'
    }
  } else if (severity === 'ok') {
    finding = `Farm is roughly average for ${inferredRole}: ${gpm10} GPM @10 vs ${base.gpm10} baseline, ${gpm20} GPM @20 vs ${base.gpm20}.${fallbackNote}`
    suggestion = 'Try a hand of midas timing on one farm-heavy hero — it tends to lift mid-game GPM more than another raw farming item.'
  } else {
    finding = `Strong farm: ${gpm10} GPM @10 (vs ${base.gpm10}) and ${gpm20} GPM @20 (vs ${base.gpm20}).${fallbackNote}`
    suggestion = 'Make sure that farm converts to fight pressure — track your damage/networth ratio next.'
  }

  return {
    id: 'farm-efficiency',
    title: 'Farm efficiency',
    metric: gpm20,
    metricLabel: 'GPM @20',
    baseline: base.gpm20,
    baselineLabel: 'baseline GPM @20',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'series',
      valueName: 'You',
      baselineName: 'Baseline',
      data: [
        { x: 'GPM @10', you: gpm10, baseline: base.gpm10 },
        { x: 'GPM @20', you: gpm20, baseline: base.gpm20 },
        { x: 'XPM @10', you: xpm10, baseline: base.xpm10 },
        { x: 'XPM @20', you: xpm20, baseline: base.xpm20 },
      ],
    },
  }
}
