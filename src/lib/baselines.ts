// Rank-aware baselines. Numbers are rounded ballparks pulled from publicly
// available Dota 2 stat aggregations (Stratz/Dotabuff bracket averages).
//
// TODO: replace with dynamic baseline (e.g. nightly aggregate from OpenDota
// /heroStats + /benchmarks/{match_id}, or a self-hosted JSON file we
// regenerate per patch).

import type { RankBucket, Role, RoleDistribution } from '../types'

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

export interface VisionBaseline {
  /** Observers placed per game (typical for this role+rank). */
  obsPerGame: number
  /** Sentries placed per game. */
  senPerGame: number
  /** Enemy wards killed per game (dewards). */
  dewardsPerGame: number
  /** Average ward lifetime in seconds (combined obs + sen). */
  avgWardLifetimeSec: number
}

export interface RoleBaseline {
  farm: FarmBaseline
  deaths: DeathBaseline
  /** Lane win rate baseline (0-1). Lane is roughly zero-sum, so this stays near 0.5. */
  laneWinRate: number
  /** Match win rate when winning lane (0-1). Higher ranks convert better. */
  winGivenLaneWon: number
  vision: VisionBaseline
}

// Death distribution shape. Total ≈ perGame; weighted toward mid-game.
const DEATH_SHAPE = [0.06, 0.10, 0.14, 0.16, 0.16, 0.13, 0.10, 0.08, 0.04, 0.02, 0.01]
function deathDist(perGame: number): DeathBaseline {
  return {
    perGame,
    perBucket: DEATH_SHAPE.map((w) => Number((perGame * w).toFixed(2))),
  }
}

// Vision baselines: ballparks based on community stat aggregations.
// Cores ward less and deward more; supports invert that pattern. Ward
// lifetime is closer to 4 minutes at low ranks (placed in obvious spots)
// and 5+ minutes at high ranks where placement reads dewards better.
// TODO: replace with dynamic baseline once we aggregate /heroStats vision data.
const visionCore = (rank: RankBucket): VisionBaseline => ({
  obsPerGame: rank === 'low' ? 1.0 : rank === 'mid' ? 1.2 : rank === 'high' ? 1.5 : 1.8,
  senPerGame: rank === 'low' ? 1.5 : rank === 'mid' ? 2.0 : rank === 'high' ? 2.5 : 3.0,
  dewardsPerGame: rank === 'low' ? 1.0 : rank === 'mid' ? 1.5 : rank === 'high' ? 2.5 : 3.5,
  avgWardLifetimeSec: rank === 'low' ? 240 : rank === 'mid' ? 270 : rank === 'high' ? 300 : 320,
})
const visionSupport = (rank: RankBucket): VisionBaseline => ({
  obsPerGame: rank === 'low' ? 6 : rank === 'mid' ? 8 : rank === 'high' ? 10 : 12,
  senPerGame: rank === 'low' ? 5 : rank === 'mid' ? 7 : rank === 'high' ? 9 : 11,
  dewardsPerGame: rank === 'low' ? 1.5 : rank === 'mid' ? 2.5 : rank === 'high' ? 3.5 : 4.5,
  avgWardLifetimeSec: rank === 'low' ? 240 : rank === 'mid' ? 280 : rank === 'high' ? 320 : 340,
})

const CORE: Record<RankBucket, RoleBaseline> = {
  low: {
    farm: { gpm10: 350, gpm20: 440, xpm10: 400, xpm20: 510 },
    deaths: deathDist(8.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.58,
    vision: visionCore('low'),
  },
  mid: {
    farm: { gpm10: 400, gpm20: 500, xpm10: 440, xpm20: 560 },
    deaths: deathDist(7.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.62,
    vision: visionCore('mid'),
  },
  high: {
    farm: { gpm10: 460, gpm20: 580, xpm10: 490, xpm20: 620 },
    deaths: deathDist(6.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.66,
    vision: visionCore('high'),
  },
  top: {
    farm: { gpm10: 520, gpm20: 660, xpm10: 540, xpm20: 700 },
    deaths: deathDist(5.0),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.70,
    vision: visionCore('top'),
  },
}

const SUPPORT: Record<RankBucket, RoleBaseline> = {
  low: {
    farm: { gpm10: 220, gpm20: 280, xpm10: 320, xpm20: 410 },
    deaths: deathDist(9.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.56,
    vision: visionSupport('low'),
  },
  mid: {
    farm: { gpm10: 250, gpm20: 320, xpm10: 350, xpm20: 450 },
    deaths: deathDist(8.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.60,
    vision: visionSupport('mid'),
  },
  high: {
    farm: { gpm10: 290, gpm20: 380, xpm10: 390, xpm20: 510 },
    deaths: deathDist(7.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.64,
    vision: visionSupport('high'),
  },
  top: {
    farm: { gpm10: 330, gpm20: 430, xpm10: 430, xpm20: 570 },
    deaths: deathDist(6.5),
    laneWinRate: 0.5,
    winGivenLaneWon: 0.68,
    vision: visionSupport('top'),
  },
}

export function getBaseline(
  role: Role,
  bucket: RankBucket,
  dist?: RoleDistribution
): RoleBaseline {
  if (role === 'support') return SUPPORT[bucket]
  if (role === 'core') return CORE[bucket]
  // 'flex' or 'unknown' → distribution-weighted blend.
  return blendFlex(bucket, dist)
}

/**
 * Weighted average of core + support baselines for flex players, where
 * flex games are split 50/50 across both sides. Falls back to a 50/50
 * blend if no distribution was supplied.
 */
function blendFlex(bucket: RankBucket, dist?: RoleDistribution): RoleBaseline {
  const c = CORE[bucket]
  const s = SUPPORT[bucket]
  let supportWeight = 0.5
  let coreWeight = 0.5
  if (dist) {
    const supW = dist.support + 0.5 * dist.flex
    const corW = dist.core + 0.5 * dist.flex
    const total = supW + corW
    if (total > 0) {
      supportWeight = supW / total
      coreWeight = corW / total
    }
  }
  const lerp = (cVal: number, sVal: number) => coreWeight * cVal + supportWeight * sVal
  return {
    farm: {
      gpm10: Math.round(lerp(c.farm.gpm10, s.farm.gpm10)),
      gpm20: Math.round(lerp(c.farm.gpm20, s.farm.gpm20)),
      xpm10: Math.round(lerp(c.farm.xpm10, s.farm.xpm10)),
      xpm20: Math.round(lerp(c.farm.xpm20, s.farm.xpm20)),
    },
    deaths: {
      perGame: Number(lerp(c.deaths.perGame, s.deaths.perGame).toFixed(2)),
      perBucket: c.deaths.perBucket.map((cv, i) =>
        Number(lerp(cv, s.deaths.perBucket[i] ?? cv).toFixed(2))
      ),
    },
    laneWinRate: Number(lerp(c.laneWinRate, s.laneWinRate).toFixed(2)),
    winGivenLaneWon: Number(lerp(c.winGivenLaneWon, s.winGivenLaneWon).toFixed(2)),
    vision: {
      obsPerGame: Number(lerp(c.vision.obsPerGame, s.vision.obsPerGame).toFixed(2)),
      senPerGame: Number(lerp(c.vision.senPerGame, s.vision.senPerGame).toFixed(2)),
      dewardsPerGame: Number(lerp(c.vision.dewardsPerGame, s.vision.dewardsPerGame).toFixed(2)),
      avgWardLifetimeSec: Math.round(lerp(c.vision.avgWardLifetimeSec, s.vision.avgWardLifetimeSec)),
    },
  }
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

/**
 * Recommended max hero pool size by rank. Lower ranks get a wider
 * recommendation because role experimentation is part of climbing; high
 * ranks reward specialization.
 */
export function heroPoolTarget(bucket: RankBucket): number {
  if (bucket === 'low') return 8
  if (bucket === 'mid') return 7
  return 5
}

export function rankBucketLabel(bucket: RankBucket): string {
  if (bucket === 'low') return 'Herald–Crusader'
  if (bucket === 'mid') return 'Archon–Legend'
  if (bucket === 'high') return 'Ancient–Divine'
  return 'Immortal'
}
