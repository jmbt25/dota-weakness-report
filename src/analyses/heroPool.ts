import type { AnalysisResult, ReportInput } from '../types'
import { didWin } from '../lib/matchHelpers'
import { heroPoolTarget, rankBucketLabel } from '../lib/baselines'

const MIN_GAMES_FOR_ANALYSIS = 15
// Heroes with fewer than this many games are too noisy to recommend as
// a "keep" pick. Surfaced separately as "too few games to evaluate".
const MIN_GAMES_FOR_RECOMMEND = 2

interface HeroStat {
  games: number
  wins: number
  kills: number
  deaths: number
  assists: number
}

function kda(s: HeroStat): number {
  return (s.kills + s.assists) / s.games / Math.max(s.deaths / s.games, 1)
}

function heroSummary(id: number, s: HeroStat, name: (id: number) => string): string {
  const wr = Math.round((s.wins / s.games) * 100)
  return `${name(id)} (${s.games}g, ${wr}% WR, ${kda(s).toFixed(1)} KDA)`
}

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
  const heroStats = new Map<number, HeroStat>()
  for (const m of matches) {
    const cur = heroStats.get(m.hero_id) ?? {
      games: 0, wins: 0, kills: 0, deaths: 0, assists: 0,
    }
    cur.games++
    if (didWin(m)) cur.wins++
    cur.kills += m.kills ?? 0
    cur.deaths += m.deaths ?? 0
    cur.assists += m.assists ?? 0
    heroStats.set(m.hero_id, cur)
  }

  const distinct = heroStats.size
  const byGames = [...heroStats.entries()].sort((a, b) => b[1].games - a[1].games)
  const top = byGames[0]
  const topId = top[0]
  const topGames = top[1].games
  const topWR = top[1].wins / top[1].games

  // Recommendation set: heroes with at least MIN_GAMES_FOR_RECOMMEND games,
  // sorted by WR desc, ties broken by games played (more is better — bigger
  // sample). Picking by recency or raw game count was surfacing 1-game 0% WR
  // heroes as "keep" picks, which is the opposite of useful.
  const eligible = [...heroStats.entries()].filter(
    ([, s]) => s.games >= MIN_GAMES_FOR_RECOMMEND
  )
  eligible.sort((a, b) => {
    const wrA = a[1].wins / a[1].games
    const wrB = b[1].wins / b[1].games
    if (wrB !== wrA) return wrB - wrA
    return b[1].games - a[1].games
  })
  const topPicks = eligible.slice(0, 4)
  const tooFew = [...heroStats.entries()].filter(
    ([, s]) => s.games < MIN_GAMES_FOR_RECOMMEND
  )

  const topPicksSummary = topPicks
    .map(([id, s]) => heroSummary(id, s, heroName))
    .join(', ')
  const tooFewNames = tooFew.map(([id]) => heroName(id)).join(', ')
  const tooFewLine =
    tooFew.length > 0
      ? ` Heroes with too few games to evaluate: ${tooFewNames}.`
      : ''

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

  if (topPicks.length === 0) {
    // Edge case: no hero has enough reps to recommend.
    finding = `${distinct} different heroes in ${matches.length} games, and no hero has more than 1 game — pool is too wide to evaluate.`
    suggestion = `Pick 5–8 heroes you actually like and play them 3+ times each — then this card will give you real signal.${tooFewLine}`
  } else if (tooThin && topLosing) {
    finding = `${distinct} different heroes in ${matches.length} games, and your most-played (${heroName(topId)}, ${topGames} games) wins only ${(topWR * 100).toFixed(0)}%.`
    suggestion = `Heroes worth keeping: ${topPicksSummary}. Pick the ${target - 1}–${target} of those you actually want to learn this month and spam them — at ${bracketName}, focus on those is worth more than versatility.${tooFewLine}`
  } else if (tooThin) {
    finding = `You played ${distinct} different heroes in ${matches.length} games — wider than the ${target}-hero target for ${bracketName}.`
    suggestion = `Heroes worth keeping: ${topPicksSummary}. Cut the rest unless they share an item build — reps on these compound.${tooFewLine}`
  } else if (topLosing) {
    finding = `${heroName(topId)} is your most-played (${topGames} games) but only wins ${(topWR * 100).toFixed(0)}%.`
    const fallback = topPicks.find(([id]) => id !== topId) ?? topPicks[0]
    const fallbackText = fallback ? heroSummary(fallback[0], fallback[1], heroName) : 'your next-most-played hero'
    suggestion = `Bench ${heroName(topId)} for two weeks and lean into ${fallbackText} instead — continuing a loss streak on a comfort pick is the most common MMR sink.${tooFewLine}`
  } else {
    finding = `Hero pool looks healthy: ${distinct} heroes across ${matches.length} games (target ~${target} at ${bracketName}), top hero (${heroName(topId)}) at ${(topWR * 100).toFixed(0)}% WR.`
    suggestion = `Heroes worth keeping: ${topPicksSummary}. Keep the pool tight; only add a new hero when a patch forces a meta shift.${tooFewLine}`
  }

  // One bar per hero, sorted by games descending. We used to lump the
  // tail into a single "Other" bar, but that bar visually dominated and
  // hid the long-tail spread that's the actual point of this card.
  const data = byGames.map(([id, s]) => ({
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
