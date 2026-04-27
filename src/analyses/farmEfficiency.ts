import type { AnalysisResult, ReportInput } from '../types'
import { getBaseline } from '../lib/baselines'
import { findPlayerInMatch, isParsed } from '../lib/matchHelpers'
import { isFarmCore } from '../lib/heroes'

/**
 * Average GPM/XPM at the 10-min and 20-min marks vs. the rank+role baseline.
 *
 * Baseline source per role:
 *   - core    → CORE bracket baseline (e.g. 440 GPM @20 at low)
 *   - support → SUPPORT bracket baseline (e.g. 280 GPM @20 at low)
 *   - flex    → distribution-weighted blend of the two
 *
 * Prose is role-specific. Severity for support uses the same ratio cuts but
 * the *advice* is structural (stacking, pulling, rotation timing) — a support
 * cannot push past their GPM ceiling by being more mechanical.
 */
export function analyzeFarmEfficiency(input: ReportInput): AnalysisResult {
  const { matches, details, accountId, inferredRole, rankBucket, roleDistribution } = input
  const base = getBaseline(inferredRole, rankBucket, roleDistribution).farm

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
      note: `${parsedCount}/${matches.length} matches had parsed replays.`,
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
  const best = Math.max(ratio10, ratio20)

  const severity =
    worst >= 0.95 ? 'good'
    : worst >= 0.85 ? 'ok'
    : 'concerning'

  const numbers = `${gpm10} GPM @10 (vs ${base.gpm10} target), ${gpm20} GPM @20 (vs ${base.gpm20})`
  const userPlaysFarmCore =
    topHeroId != null && isFarmCore(topHeroId) && inferredRole === 'core'

  // Per-role copy. Support gets structural advice; core gets mechanical;
  // flex acknowledges the duality.
  let finding: string
  let suggestion: string
  if (severity === 'concerning') {
    const worseWindow = ratio10 < ratio20 ? 'lane stage' : 'mid-game'
    finding = `Farm is below the ${roleLabel(inferredRole)} target for your bracket: ${numbers}. The ${worseWindow} is the bigger gap.`
    suggestion = farmAdvice(inferredRole, worseWindow, userPlaysFarmCore, 'concerning')
  } else if (severity === 'ok') {
    finding = `Farm is roughly average for a ${roleLabel(inferredRole)} in your bracket: ${numbers}.`
    suggestion = farmAdvice(inferredRole, ratio10 < ratio20 ? 'lane stage' : 'mid-game', userPlaysFarmCore, 'ok')
  } else {
    // For 'good' severity, supports especially shouldn't be told they have
    // "strong farm" — high GPM as a support typically means stealing core
    // farm or hitting a coinflip game. Frame it differently per role.
    if (inferredRole === 'support') {
      finding = `Farm is on-pace for a support: ${numbers}. Don't try to push beyond this — high support GPM usually means stealing core farm or running away with a coinflip game.`
      suggestion = 'Focus on stacking, pulling, and rotation timing — that\'s where MMR comes from at this position. Your GPM ceiling is structural, not mechanical.'
    } else if (inferredRole === 'flex') {
      finding = `Farm sits above your weighted ${roleLabel(inferredRole)} target: ${numbers}.`
      suggestion = 'When you play core, convert this farm into fight pressure (track damage/networth ratio). When you play support, don\'t push GPM further — focus on rotation timing.'
    } else {
      finding = `Strong farm: ${numbers}.`
      suggestion = 'Make sure that farm converts to fight pressure — track your damage/networth ratio next.'
    }
  }

  // For "good" severity above the baseline by 10%+, surface "Strong" instead
  // of the default "Healthy" pill.
  const severityLabel =
    severity === 'good' && best >= 1.10 && inferredRole !== 'support' ? 'Strong' : undefined

  return {
    id: 'farm-efficiency',
    title: 'Farm efficiency',
    metric: gpm20,
    metricLabel: 'GPM @20',
    baseline: base.gpm20,
    baselineLabel: 'GPM @20',
    severity,
    severityLabel,
    finding,
    suggestion,
    note: `${parsedCount}/${matches.length} matches had parsed replays · baseline tuned for role: ${roleLabel(inferredRole)}.`,
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

function roleLabel(role: 'core' | 'support' | 'flex' | 'unknown'): string {
  if (role === 'support') return 'support'
  if (role === 'flex') return 'flex'
  if (role === 'core') return 'core'
  return 'pub'
}

function farmAdvice(
  role: 'core' | 'support' | 'flex' | 'unknown',
  window: 'lane stage' | 'mid-game',
  userPlaysFarmCore: boolean,
  severity: 'ok' | 'concerning'
): string {
  if (role === 'support') {
    return 'Support GPM ceiling is structural — focus instead on efficient stacking, pulling, and rotation timing. Don\'t chase last hits; chase utility timings (smoke, dust, sentry).'
  }
  if (role === 'flex') {
    return window === 'lane stage'
      ? 'When you play core, settle the wave for a free farm pattern. When you play support, target one full pull cycle every 53 seconds — that\'s where the support GPM gap closes.'
      : 'When you play core, hit ancient/jungle camps between objectives. When you play support, pivot to kill participation — passive supports flatline at this stage.'
  }
  // core
  if (window === 'lane stage') {
    return 'Cut creep aggression so the wave settles in your favor. Free farm > a few fancy trades.'
  }
  if (severity === 'ok' && userPlaysFarmCore) {
    return 'Try a Hand of Midas timing on your most-played hero — it tends to lift mid-game GPM more than another raw farming item.'
  }
  return 'Transition to ancient stacks/jungle camps between objectives instead of TPing across the map for fights you can\'t win.'
}
