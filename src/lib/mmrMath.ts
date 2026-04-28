// MMR math helpers powering the /mmr-math page.

export const MMR_PER_WIN = 25

/** rank_tier shape: <medal_digit><star_digit>. Immortal = 80-89. */
export type MedalDigit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Approximate MMR floor for each rank star. Valve's actual brackets shift
 * slightly per season; these are ballparks pulled from public Dotabuff/
 * Stratz aggregates. They drive the "MMR needed to reach the next bracket"
 * calculation on the MMR Math page.
 *
 * Index = rank_tier (e.g. 31 = Crusader 1, 35 = Crusader 5, 80 = Immortal).
 */
export const RANK_TIER_MMR_FLOOR: Record<number, number> = {
  // Herald
  11: 0, 12: 154, 13: 308, 14: 462, 15: 616,
  // Guardian
  21: 770, 22: 924, 23: 1078, 24: 1232, 25: 1386,
  // Crusader
  31: 1540, 32: 1694, 33: 1848, 34: 2002, 35: 2156,
  // Archon
  41: 2310, 42: 2464, 43: 2618, 44: 2772, 45: 2926,
  // Legend
  51: 3080, 52: 3234, 53: 3388, 54: 3542, 55: 3696,
  // Ancient
  61: 3850, 62: 4004, 63: 4158, 64: 4312, 65: 4466,
  // Divine
  71: 4620, 72: 4820, 73: 5020, 74: 5220, 75: 5420,
  // Immortal — flat floor
  80: 5620,
}

const TIER_NAMES: Record<MedalDigit, string> = {
  1: 'Herald',
  2: 'Guardian',
  3: 'Crusader',
  4: 'Archon',
  5: 'Legend',
  6: 'Ancient',
  7: 'Divine',
  8: 'Immortal',
}

/** Looks up "next bracket" — the next medal-up. So Herald 5 → Guardian 1. */
export function nextBracketLabel(rankTier: number): string | null {
  if (!rankTier) return null
  const medal = Math.floor(rankTier / 10) as MedalDigit
  if (medal >= 8) return null
  const nextMedal = (medal + 1) as MedalDigit
  return `${TIER_NAMES[nextMedal]} 1`
}

export function rankTierMmr(rankTier: number): number {
  if (!rankTier) return 0
  if (rankTier >= 80) return RANK_TIER_MMR_FLOOR[80]
  return RANK_TIER_MMR_FLOOR[rankTier] ?? 0
}

/** MMR needed to reach the next medal floor from current rank tier. */
export function mmrToNextBracket(rankTier: number): number | null {
  if (!rankTier) return null
  const medal = Math.floor(rankTier / 10) as MedalDigit
  if (medal >= 8) return null
  const star = rankTier % 10
  // Half-bracket assumption: assume the user is in the middle of their
  // current star (~halfway between this floor and the next star floor).
  // Avoids returning "you need 154 MMR" for someone who actually just
  // hit the star yesterday.
  const currentFloor = rankTierMmr(rankTier)
  const nextStarTier = star >= 5 ? (medal + 1) * 10 + 1 : rankTier + 1
  const nextStarFloor = rankTierMmr(nextStarTier)
  const assumedCurrent = (currentFloor + nextStarFloor) / 2
  const targetMedalTier = (medal + 1) * 10 + 1
  const targetFloor = rankTierMmr(targetMedalTier)
  return Math.max(0, Math.round(targetFloor - assumedCurrent))
}

/**
 * Games-to-bracket math.
 *
 * For a player with WR `p` (0..1) winning `+25` per win and losing `-25`
 * per loss, expected MMR per game = 25*(2p - 1).
 *
 * If `expectedPerGame <= 0`, you never reach the next bracket — return null.
 */
export function gamesToBracket(mmrNeeded: number, wr: number): number | null {
  if (mmrNeeded <= 0) return 0
  const expectedPerGame = MMR_PER_WIN * (2 * wr - 1)
  if (expectedPerGame <= 0) return null
  return Math.ceil(mmrNeeded / expectedPerGame)
}

export interface TimeEstimate {
  totalDays: number
  /** Pretty-printed duration like "14 months" / "3 weeks" / "12 days". */
  prose: string
}

export function timeForGames(games: number | null, gamesPerDay: number): TimeEstimate | null {
  if (games == null || gamesPerDay <= 0) return null
  const days = games / gamesPerDay
  if (!isFinite(days)) return null
  if (days < 14) {
    const d = Math.max(1, Math.round(days))
    return { totalDays: days, prose: `${d} day${d === 1 ? '' : 's'}` }
  }
  if (days < 60) {
    const w = Math.round(days / 7)
    return { totalDays: days, prose: `${w} week${w === 1 ? '' : 's'}` }
  }
  if (days < 365 * 2) {
    const months = Math.round(days / 30)
    return { totalDays: days, prose: `${months} month${months === 1 ? '' : 's'}` }
  }
  const years = (days / 365).toFixed(1)
  return { totalDays: days, prose: `${years} years` }
}
