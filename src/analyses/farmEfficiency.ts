import type { AnalysisResult, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'
import { isFarmCore } from '../lib/heroes'

/**
 * Average GPM/XPM at the 10-min and 20-min marks vs. the rank+role baseline.
 * Uses cumulative `gold_t` / `xp_t` arrays from parsed matches.
 *
 * Without any parsed match the result is reported as 'unmeasured' rather than
 * making up numbers from whole-match averages — the rank baselines are
 * calibrated against minute-window GPM, so a whole-match comparison would be
 * misleading.
 */
export function analyzeFarmEfficiency(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket } = input
  const base = getBaseline(inferredRole, rankBucket).farm

  const samples10gpm: number[] = []
  const samples20gpm: number[] = []
  const samples10xpm: number[] = []
  const samples20xpm: number[] = []
  let parsedCount = 0
  let topHeroId: number | null = null
  const heroGames = new Map<number, number>()

  for (const m of matches) {
    heroGames.set(m.hero_id, (heroGames.get(m.hero_id) ?? 0) + 1)
    const detail = details[m.match_id]
    if (!detail) continue
    const player = findPlayerInMatch(detail, accountId)
    if (!player) continue

    if (isParsed(detail) && player.gold_t && player.xp_t) {
      parsedCount++
      const g10 = player.gold_t[10]
      const g20 = player.gold_t[20]
      const x10 = player.xp_t[10]
      const x20 = player.xp_t[20]
      if (typeof g10 === 'number') samples10gpm.push(g10 / 10)
      if (typeof g20 === 'number') samples20gpm.push(g20 / 20)
      if (typeof x10 === 'number') samples10xpm.push(x10 / 10)
      if (typeof x20 === 'number') samples20xpm.push(x20 / 20)
    }
  }
  // Identify top hero for suggestion targeting.
  let topGames = 0
  for (const [id, games] of heroGames) {
    if (games > topGames) { topGames = games; topHeroId = id }
  }

  if (parsedCount === 0 || samples10gpm.length === 0) {
    return {
      id: 'farm-efficiency',
      title: 'Farm efficiency',
      metric: 0,
      metricLabel: '',
      baseline: base.gpm20,
      baselineLabel: 'GPM @20',
      severity: 'unmeasured',
      finding: 'Farm efficiency needs per-minute GPM/XPM data, which only parsed matches expose.',
      suggestion: 'Once your matches finish parsing, re-run the report — this card will fill in.',
    }
  }

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const gpm10 = Math.round(avg(samples10gpm))
  const gpm20 = Math.round(avg(samples20gpm))
  const xpm10 = Math.round(avg(samples10xpm))
  const xpm20 = Math.round(avg(samples20xpm))

  const ratio10 = gpm10 / base.gpm10
  const ratio20 = gpm20 / base.gpm20
  const worst = Math.min(ratio10, ratio20)
  const severity =
    worst >= 0.95 ? 'good'
    : worst >= 0.85 ? 'ok'
    : 'concerning'

  const userPlaysFarmCore = topHeroId != null && isFarmCore(topHeroId) && inferredRole !== 'support'

  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    if (ratio10 < ratio20) {
      finding = `Your 10-min GPM (${gpm10}) is below the ${base.gpm10} ${inferredRole} target. The lane stage is bleeding economy.`
      suggestion = inferredRole === 'support'
        ? 'Focus on stacking, pulling, and rotation timing — your GPM ceiling is structural, not mechanical. Hit the 10-min pull window and the courier-snap gold scales the rest.'
        : 'Cut creep aggression so the wave settles in your favor. Free farm > a few fancy trades.'
    } else {
      finding = `Your 20-min GPM (${gpm20}) is below the ${base.gpm20} ${inferredRole} target. You stall after the lane.`
      suggestion = inferredRole === 'support'
        ? 'After laning, GPM growth is mostly hero-kill participation. Be the first to TP into kills your team is starting; passive supports flatline here.'
        : 'After laning, transition to ancient stacks/jungle camps between objectives instead of TPing across the map for fights you can’t win.'
    }
  } else if (severity === 'ok') {
    finding = `Farm is roughly average for your bracket: ${gpm10} GPM @10 vs ${base.gpm10}, ${gpm20} GPM @20 vs ${base.gpm20}.`
    suggestion = inferredRole === 'support'
      ? 'Focus on stacking, pulling, and rotation timing — your GPM ceiling is structural, not mechanical. The next 30 GPM comes from hitting more rotations on cooldown.'
      : userPlaysFarmCore
        ? 'Try a Hand of Midas timing on your most-played hero — it tends to lift mid-game GPM more than another raw farming item.'
        : 'Watch your laning replay back. Most of the gap is one or two missed pulls/stacks per game.'
  } else {
    finding = `Strong farm: ${gpm10} GPM @10 (vs ${base.gpm10}) and ${gpm20} GPM @20 (vs ${base.gpm20}).`
    suggestion = 'Make sure that farm converts to fight pressure — track your damage/networth ratio next.'
  }

  return {
    id: 'farm-efficiency',
    title: 'Farm efficiency',
    metric: gpm20,
    metricLabel: 'GPM @20',
    baseline: base.gpm20,
    baselineLabel: 'GPM @20',
    severity,
    finding,
    suggestion,
    note: parsedCount < matches.length
      ? `${parsedCount}/${matches.length} matches had parsed replays.`
      : undefined,
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
