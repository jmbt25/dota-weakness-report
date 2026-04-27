import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'
import { heroPoolTarget, rankBucketLabel } from '../lib/baselines'

const MIN_GAMES_FOR_ANALYSIS = 15
const VISIBLE_HEROES_IN_CHART = 8

/**
 * Hero pool concentration. Requires at least 15 games for meaningful signal —
 * below that, spread/win rate numbers are too noisy.
 *
 * Recommended max pool size scales with rank: lower brackets get a wider
 * recommendation (more experimentation pays off when fundamentals matter
 * more than specialization), higher brackets get tighter ones.
 */
export function analyzeHeroPool(input: ReportInput): AnalysisResult {
  const { matches, heroName, rankBucket } = input

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

  const target = heroPoolTarget(rankBucket)
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

  // "Spread thin" if pool exceeds the rank-appropriate target.
  const tooThin = distinct > target
  const topLosing = topGames >= 3 && topWR < 0.5

  const severity =
    tooThin && topLosing ? 'concerning'
    : tooThin || topLosing ? 'ok'
    : 'good'

  const bracketName = rankBucketLabel(rankBucket)
  let finding: string
  let suggestion: string
  if (tooThin && topLosing) {
    finding = `${distinct} different heroes in ${matches.length} games, and your most-played (${heroName(topId)}, ${topGames} games) wins only ${(topWR * 100).toFixed(0)}%.`
    suggestion = `Pick ${target - 1}–${target} heroes you actually want to learn this month and spam the same draft. At ${bracketName}, that focus is worth more than versatility.`
  } else if (tooThin) {
    finding = `You played ${distinct} different heroes in ${matches.length} games — wider than the ${target}-hero target for ${bracketName}.`
    suggestion = `Cut your pool to ~${target} heroes that share an item build. Decision-making transfers; muscle memory accumulates.`
  } else if (topLosing) {
    finding = `${heroName(topId)} is your most-played (${topGames} games) but only wins ${(topWR * 100).toFixed(0)}%.`
    suggestion = 'Either bench this hero for two weeks or watch a high-rank replay of it. Continuing the loss streak on a comfort pick is the most common MMR sink.'
  } else {
    finding = `Hero pool looks healthy: ${distinct} heroes across ${matches.length} games (target ~${target} at ${bracketName}), top hero (${heroName(topId)}) at ${(topWR * 100).toFixed(0)}% WR.`
    suggestion = 'Nice — focused pool with a winning anchor. Keep it small and only add new heroes when patches force a meta shift.'
  }

  // Top heroes as a horizontal bar chart, sorted by games played. Top 8 +
  // an explicit "Other (N heroes, M games)" bucket so it's clear what
  // fraction of games it represents.
  const data = sorted.slice(0, VISIBLE_HEROES_IN_CHART).map(([id, s]) => ({
    label: heroName(id),
    value: s.games,
    // Stash WR in baseline so the tooltip can show it (kept off the rendered bar).
    baseline: Math.round((s.wins / s.games) * 100),
  }))
  const otherEntries = sorted.slice(VISIBLE_HEROES_IN_CHART)
  const otherGames = otherEntries.reduce((acc, [, s]) => acc + s.games, 0)
  if (otherEntries.length > 0) {
    data.push({
      label: `Other (${otherEntries.length} heroes, ${otherGames} games)`,
      value: otherGames,
      baseline: 0,
    })
  }

  return {
    id: 'hero-pool',
    title: 'Hero pool',
    metric: distinct,
    metricLabel: `distinct / ${matches.length} games`,
    baseline: target,
    baselineLabel: `target at ${bracketName}`,
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
