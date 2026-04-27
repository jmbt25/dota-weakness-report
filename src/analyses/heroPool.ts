import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'

const SPREAD_THIN_THRESHOLD = 12 // distinct heroes in 20 games

/**
 * Hero pool concentration. Flags two failure modes:
 *   1. Spread too thin — more than 12 unique heroes in 20 games means little
 *      mastery on any one of them.
 *   2. Most-played hero is sub-50% — the hero you grind most should be
 *      winning, otherwise it’s the hero costing you MMR.
 */
export function analyzeHeroPool(input: ReportInput): AnalysisResult {
  const { matches } = input

  const heroStats = new Map<number, { games: number; wins: number }>()
  for (const m of matches) {
    const cur = heroStats.get(m.hero_id) ?? { games: 0, wins: 0 }
    cur.games++
    if (didWin(m)) cur.wins++
    heroStats.set(m.hero_id, cur)
  }

  const distinct = heroStats.size
  const sorted = [...heroStats.entries()].sort((a, b) => b[1].games - a[1].games)
  const topHero = sorted[0]
  const topHeroId = topHero?.[0] ?? null
  const topHeroGames = topHero?.[1].games ?? 0
  const topHeroWR = topHero ? topHero[1].wins / topHero[1].games : 0

  const tooThin = distinct > SPREAD_THIN_THRESHOLD
  const topHeroLosing = topHeroGames >= 3 && topHeroWR < 0.5

  const severity =
    tooThin && topHeroLosing ? 'concerning'
    : tooThin || topHeroLosing ? 'ok'
    : 'good'

  let finding: string
  let suggestion: string
  if (tooThin && topHeroLosing) {
    finding = `${distinct} different heroes in ${matches.length} games, and your most-played (Hero ${topHeroId}, ${topHeroGames} games) wins only ${(topHeroWR * 100).toFixed(0)}%.`
    suggestion = 'Pick 3 heroes you actually want to learn this month. Spam the same draft until your win rate on it climbs to 55%+ — variety is costing you reps.'
  } else if (tooThin) {
    finding = `You played ${distinct} different heroes in ${matches.length} games — that’s a wide pool to be climbing on.`
    suggestion = 'Cut your pool to ~5 heroes that share an item build. The decision-making transfers; the muscle memory accumulates.'
  } else if (topHeroLosing) {
    finding = `Hero ${topHeroId} is your most-played (${topHeroGames} games) but only wins ${(topHeroWR * 100).toFixed(0)}%.`
    suggestion = 'Either bench this hero for two weeks or watch a high-rank replay of it. Continuing the loss streak on a comfort pick is the most common MMR sink.'
  } else {
    finding = `Hero pool looks healthy: ${distinct} heroes across ${matches.length} games, top hero (Hero ${topHeroId}) at ${(topHeroWR * 100).toFixed(0)}% WR.`
    suggestion = 'Nice — focused pool with a winning anchor. Keep this small and only add new heroes when patches force a meta shift.'
  }

  // Pie of top heroes by games played.
  const pieData = sorted.slice(0, 6).map(([heroId, s]) => ({
    label: `Hero ${heroId}`,
    value: s.games,
  }))
  const otherGames = sorted.slice(6).reduce((acc, [, s]) => acc + s.games, 0)
  if (otherGames > 0) pieData.push({ label: 'Other', value: otherGames })

  return {
    id: 'hero-pool',
    title: 'Hero pool',
    metric: distinct,
    metricLabel: `distinct heroes / ${matches.length}`,
    baseline: SPREAD_THIN_THRESHOLD,
    baselineLabel: 'max recommended',
    severity,
    finding,
    suggestion,
    chart: {
      kind: 'pie',
      data: pieData,
    },
  }
}
