// Corpus loader for /watch Cat 1A prose.
//
// Loads src/data/pro-baselines.json once at module load and exposes a
// Map<account_id, PlayerBaseline> for cheap O(1) lookups during prose
// runs. The JSON is bundled by Vite (~120 KB raw, much smaller after
// minification), regenerated weekly by refresh-pro-baselines.mjs.
//
// PlayerBaseline shape mirrors what scripts/refresh-pro-baselines.mjs
// writes — keep the two in sync when the corpus build changes shape.

import corpusJson from '../../data/pro-baselines.json'

export interface HeroPoolEntry {
  games: number
  wins: number
  kda_avg: number
}

export interface LaneOutcome {
  match_id: number
  won: boolean
  lane_efficiency_pct: number | null
}

export interface PlayerBaseline {
  personaname: string
  team: string
  matches_in_window: number
  detail_samples: number
  last_match_unix: number
  rolling_kda: number
  rolling_gpm: number | null
  rolling_xpm: number | null
  rolling_lh_per_min: number | null
  rolling_obs_per_game: number | null
  rolling_sen_per_game: number | null
  rolling_teamfight_part: number | null
  /** [pos1, pos2, pos3, pos4, pos5] shares summing to ~1. */
  season_role_distribution: number[]
  recent_hero_pool: Record<string, HeroPoolEntry>
  recent_lane_outcomes: LaneOutcome[]
}

const BY_ACCOUNT_ID = new Map<number, PlayerBaseline>()
{
  const players = (corpusJson as { players?: Record<string, PlayerBaseline> }).players ?? {}
  for (const [accountIdStr, baseline] of Object.entries(players)) {
    const id = Number(accountIdStr)
    if (Number.isFinite(id)) BY_ACCOUNT_ID.set(id, baseline)
  }
}

export function getBaseline(accountId: number | null | undefined): PlayerBaseline | null {
  if (typeof accountId !== 'number') return null
  return BY_ACCOUNT_ID.get(accountId) ?? null
}

export function corpusSize(): number {
  return BY_ACCOUNT_ID.size
}

/**
 * Compute the player's overall rolling WR from their hero-pool entries
 * (the corpus doesn't store overall WR directly). Returns null if
 * fewer than 5 total corpus games — too thin for comparison.
 */
export function overallRollingWr(baseline: PlayerBaseline): number | null {
  let games = 0
  let wins = 0
  for (const e of Object.values(baseline.recent_hero_pool)) {
    games += e.games
    wins += e.wins
  }
  if (games < 5) return null
  return wins / games
}
