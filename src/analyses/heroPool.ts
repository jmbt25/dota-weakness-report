import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'

const MIN_GAMES_FOR_ANALYSIS = 15
const SPREAD_THIN_THRESHOLD = 12

/**
 * Hero pool concentration. Requires at least 15 games for meaningful signal —
 * below that, spread/win rate numbers are too noisy.
 *
 * Flags:
 *   1. Spread too thin — >12 unique heroes in 20 games means little mastery.
 *   2. Most-played hero is sub-50% — the hero you grind most should be winning.
 */
export function analyzeHeroPool(input: ReportInput): AnalysisResult {
  const { matches, heroName } = input

  if (matches.length < MIN_GAMES_FOR_ANALYSIS) {
    return {
      id: 'hero-pool',
      title: 'Hero pool',
      metric: matches.length,
      metricLabel: 'games',
      baseline: MIN_GAMES_FOR_ANALYSIS,
      baselineLabel: 'min games',
      severity: 'unmeasured',
      finding: `Need at least ${MIN_GAMES_FOR_ANALYSIS} games for hero pool analysis (you have ${matches.length}).`,
      suggestion: 'Play a few more games and re-run — distinct-hero counts are too noisy below this sample size.',
    }
  }

  const heroStats = new Map<number, { games: number; wins: number }>()
  for (const m of matches) {
    const cur = heroStats.get(m.hero_id) ?? { games: 0, wins: 0 }
    cur.games++
    if (didWin(m)) cur.wins++
    heroStats.set(m.hero_id, cur)
  }

  const distinct = heroStats.size
  const sorted = [...heroStats.entries()].sort((a, b) => b[1].games - a[1].games)
  const top = sorted[0]
  const topId = top[0]
  const topGames = top[1].games
  const topWR = top[1].wins / top[1].games

  const tooThin = distinct > SPREAD_THIN_THRESHOLD
  const topLosing = topGames >= 3 && topWR < 0.5

  const severity =
    tooThin && topLosing ? 'concerning'
    : tooThin || topLosing ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (tooThin && topLosing) {
    finding = `${distinct} different heroes in ${matches.length} games, and your most-played (${heroName(topId)}, ${topGames} games) wins only ${(topWR * 100).toFixed(0)}%.`
    suggestion = 'Pick 3 heroes you actually want to learn this month. Spam the same draft until your win rate climbs to 55%+ — variety is costing you reps.'
  } else if (tooThin) {
    finding = `You played ${distinct} different heroes in ${matches.length} games — that's a wide pool to be climbing on.`
    suggestion = 'Cut your pool to ~5 heroes that share an item build. The decision-making transfers; the muscle memory accumulates.'
  } else if (topLosing) {
    finding = `${heroName(topId)} is your most-played (${topGames} games) but only wins ${(topWR * 100).toFixed(0)}%.`
    suggestion = 'Either bench this hero for two weeks or watch a high-rank replay of it. Continuing the loss streak on a comfort pick is the most common MMR sink.'
  } else {
    finding = `Hero pool looks healthy: ${distinct} heroes across ${matches.length} games, top hero (${heroName(topId)}) at ${(topWR * 100).toFixed(0)}% WR.`
    suggestion = 'Nice — focused pool with a winning anchor. Keep this small and only add new heroes when patches force a meta shift.'
  }

  // Top heroes as a horizontal bar chart, sorted by games played.
  // We trim to the top 8 to keep the card readable.
  const data = sorted.slice(0, 8).map(([id, s]) => ({
    label: heroName(id),
    value: s.games,
    // Stash WR in baseline so the tooltip can show it (stays out of the bar render).
    baseline: Math.round((s.wins / s.games) * 100),
  }))
  const otherGames = sorted.slice(8).reduce((acc, [, s]) => acc + s.games, 0)
  if (otherGames > 0) data.push({ label: `Other (${sorted.length - 8})`, value: otherGames, baseline: 0 })

  return {
    id: 'hero-pool',
    title: 'Hero pool',
    metric: distinct,
    metricLabel: `distinct / ${matches.length} games`,
    baseline: SPREAD_THIN_THRESHOLD,
    baselineLabel: 'max recommended',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'bars',
      horizontal: true,
      valueName: 'Games',
      data,
    },
  }
}
