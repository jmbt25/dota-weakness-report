import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'
import { heroPoolTarget, rankBucketLabel } from '../lib/baselines'

const MIN_GAMES_FOR_ANALYSIS = 15

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
  // Top 4 by name + WR — surfaced in suggestion prose.
  const top4Summary = sorted
    .slice(0, 4)
    .map(([id, s]) => `${heroName(id)} (${s.games}g, ${(s.wins / s.games * 100).toFixed(0)}% WR)`)
    .join(', ')
  let finding: string
  let suggestion: string
  if (tooThin && topLosing) {
    finding = `${distinct} different heroes in ${matches.length} games, and your most-played (${heroName(topId)}, ${topGames} games) wins only ${(topWR * 100).toFixed(0)}%.`
    suggestion = `Your top 4: ${top4Summary}. Pick the ${target - 1}–${target} of those you actually want to learn this month and spam them — at ${bracketName}, focus on those is worth more than versatility.`
  } else if (tooThin) {
    finding = `You played ${distinct} different heroes in ${matches.length} games — wider than the ${target}-hero target for ${bracketName}.`
    suggestion = `Your top 4: ${top4Summary}. Cut the rest unless they share an item build — reps on these four compound.`
  } else if (topLosing) {
    finding = `${heroName(topId)} is your most-played (${topGames} games) but only wins ${(topWR * 100).toFixed(0)}%.`
    const fallback = sorted[1]
    const fallbackName = fallback ? `${heroName(fallback[0])} (${fallback[1].games}g, ${(fallback[1].wins / fallback[1].games * 100).toFixed(0)}% WR)` : 'your next-most-played hero'
    suggestion = `Bench ${heroName(topId)} for two weeks and lean into ${fallbackName} instead — continuing a loss streak on a comfort pick is the most common MMR sink.`
  } else {
    finding = `Hero pool looks healthy: ${distinct} heroes across ${matches.length} games (target ~${target} at ${bracketName}), top hero (${heroName(topId)}) at ${(topWR * 100).toFixed(0)}% WR.`
    suggestion = `Top 4 anchors: ${top4Summary}. Keep the pool tight; only add a new hero when a patch forces a meta shift.`
  }

  // One bar per hero, sorted by games descending. We used to lump the
  // tail into a single "Other" bar, but that bar visually dominated and
  // hid the long-tail spread that's the actual point of this card.
  const data = sorted.map(([id, s]) => ({
    label: `${heroName(id)} (${s.games}g)`,
    value: s.games,
    // Stash WR in baseline so the tooltip can show it (kept off the rendered bar).
    baseline: Math.round((s.wins / s.games) * 100),
  }))

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
    roastFacts: {
      hero_count: distinct,
      games: matches.length,
      top_hero: heroName(topId),
      top_wr: Math.round(topWR * 100),
    },
    chart: {
      kind: 'bars',
      horizontal: true,
      valueName: 'Games',
      data,
    },
  }
}
