// Rank-aware baselines. Numbers are rounded ballparks pulled from publicly
// available Dota 2 stat aggregations (Stratz/Dotabuff bracket averages).
//
// TODO: replace with dynamic baseline (e.g. nightly aggregate from OpenDota
// /heroStats + /benchmarks/{match_id}, or a self-hosted JSON file we
// regenerate per patch).

import type { RankBucket, Role } from '../types'

export interface FarmBaseline {
  gpm10: number
  gpm20: number
  xpm10: number
  xpm20: number
}

export interface DeathBaseline {
  /** Average deaths per 5-minute window (10 windows covering 0-50 min, then a "50+" tail). */
  perBucket: number[]
  /** Average total deaths/game for this rank+role. */
  perGame: number
}

export interface RoleBaseline {
  farm: FarmBaseline
  deaths: DeathBaseline
  /** Lane win rate baseline (0-1). Lane is roughly zero-sum, so this stays near 0.5. */
  laneWinRate: number
  /** Match win rate when winning lane (0-1). Higher ranks convert better. */
  winGivenLaneWon: number
}

// Death distribution shape. Total ≈ perGame; weighted toward mid-game.
const DEATH_SHAPE = [0.06, 0.10, 0.14, 0.16, 0.16, 0.13, 0.10, 0.08, 0.04, 0.02, 0.01]
function deathDist(perGame: number): DeathBaseline {
  return {
    perGame,
    perBucket: DEATH_SHAPE.map((w) => Number((perGame * w).toFixed(2))),
  }
}

const CORE: Record<RankBucket, RoleBaseline> = {
  low: {
    farm: { gpm10: 350, gpm20: 440, xpm10: 400, xpm20: 510 },
    deaths: deathDist(8.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.58,
  },
  mid: {
    farm: { gpm10: 400, gpm20: 500, xpm10: 440, xpm20: 560 },
    deaths: deathDist(7.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.62,
  },
  high: {
    farm: { gpm10: 460, gpm20: 580, xpm10: 490, xpm20: 620 },
    deaths: deathDist(6.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.66,
  },
  top: {
    farm: { gpm10: 520, gpm20: 660, xpm10: 540, xpm20: 700 },
    deaths: deathDist(5.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.70,
  },
}

const SUPPORT: Record<RankBucket, RoleBaseline> = {
  low: {
    farm: { gpm10: 220, gpm20: 280, xpm10: 320, xpm20: 410 },
    deaths: deathDist(9.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.56,
  },
  mid: {
    farm: { gpm10: 250, gpm20: 320, xpm10: 350, xpm20: 450 },
    deaths: deathDist(8.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.60,
  },
  high: {
    farm: { gpm10: 290, gpm20: 380, xpm10: 390, xpm20: 510 },
    deaths: deathDist(7.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.64,
  },
  top: {
    farm: { gpm10: 330, gpm20: 430, xpm10: 430, xpm20: 570 },
    deaths: deathDist(6.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.68,
  },
}

export function getBaseline(role: Role, bucket: RankBucket): RoleBaseline {
  const set = role === 'support' ? SUPPORT : CORE
  return set[bucket]
}

/**
 * Item timing benchmarks — "good" timings (in seconds from match start) for
 * commonly-built items, calibrated against mid-bracket averages.
 *
 * TODO: replace with dynamic baseline (per-hero, per-rank from
 * /heroes/{id}/itemPopularity + percentile timings).
 */
export const ITEM_GOOD_TIMING_SEC: Record<string, number> = {
  bfury: 22 * 60,
  blink: 18 * 60,
  ultimate_scepter: 25 * 60,
  shivas_guard: 28 * 60,
  black_king_bar: 22 * 60,
  manta: 20 * 60,
  radiance: 22 * 60,
  desolator: 18 * 60,
  butterfly: 30 * 60,
  daedalus: 30 * 60,
  satanic: 32 * 60,
  abyssal_blade: 32 * 60,
  heart: 30 * 60,
  octarine_core: 28 * 60,
  refresher: 32 * 60,
  assault: 32 * 60,
  power_treads: 11 * 60,
  phase_boots: 11 * 60,
  arcane_boots: 10 * 60,
  tranquil_boots: 9 * 60,
  hand_of_midas: 12 * 60,
  maelstrom: 16 * 60,
  mjollnir: 26 * 60,
  vladmir: 14 * 60,
  pipe: 18 * 60,
  guardian_greaves: 22 * 60,
  force_staff: 12 * 60,
  glimmer_cape: 14 * 60,
  ghost: 12 * 60,
  veil_of_discord: 12 * 60,
  mekansm: 14 * 60,
  greater_crit: 30 * 60,
  hurricane_pike: 22 * 60,
  bloodthorn: 28 * 60,
  orchid: 18 * 60,
  diffusal_blade: 16 * 60,
}

// rank_tier in OpenDota is encoded as <medal_digit><star_digit>.
// 1x = Herald, 2x = Guardian, 3x = Crusader, 4x = Archon, 5x = Legend,
// 6x = Ancient, 7x = Divine, 8x = Immortal.
export function rankBucketFromTier(rankTier?: number | null): RankBucket {
  if (!rankTier) return 'mid'
  const medal = Math.floor(rankTier / 10)
  if (medal <= 3) return 'low'
  if (medal <= 5) return 'mid'
  if (medal <= 7) return 'high'
  return 'top'
}

export function rankLabel(rankTier?: number | null): string {
  if (!rankTier) return 'Uncalibrated'
  const medal = Math.floor(rankTier / 10)
  const star = rankTier % 10
  const names = [
    '',
    'Herald',
    'Guardian',
    'Crusader',
    'Archon',
    'Legend',
    'Ancient',
    'Divine',
    'Immortal',
  ]
  const name = names[medal]
  if (!name) return 'Unknown'
  if (medal === 8) return 'Immortal'
  return star > 0 ? `${name} ${star}` : name
}

export function rankBucketLabel(bucket: RankBucket): string {
  if (bucket === 'low') return 'Herald–Crusader'
  if (bucket === 'mid') return 'Archon–Legend'
  if (bucket === 'high') return 'Ancient–Divine'
  return 'Immortal'
}
