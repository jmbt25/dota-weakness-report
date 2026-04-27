// Hardcoded role/rank averages from publicly available Dota 2 stats.
// These are intentionally rough — they exist so the report can render plausible
// findings before live baselines are wired up.
//
// TODO: replace with dynamic baseline (e.g. fetch from OpenDota /heroStats,
// /benchmarks/{match_id}, or a self-hosted aggregate computed nightly).

import type { Role } from '../types'

export interface FarmBaseline {
  /** Expected GPM at 10:00 */
  gpm10: number
  /** Expected GPM at 20:00 */
  gpm20: number
  /** Expected XPM at 10:00 */
  xpm10: number
  /** Expected XPM at 20:00 */
  xpm20: number
}

export interface DeathBaseline {
  /** Average deaths per 5-minute bucket, indexed by bucket (0-4 min, 5-9, 10-14, ...) */
  perBucket: number[]
}

export interface RoleBaseline {
  farm: FarmBaseline
  deaths: DeathBaseline
  /** Lane win rate baseline (0-1) */
  laneWinRate: number
  /** Match win rate when winning lane (0-1) */
  winGivenLaneWon: number
}

// TODO: replace with dynamic baseline (per rank tier, per patch).
// Numbers below are deliberately rounded ballparks for ~Crusader/Archon (rank ~25-35).
const CORE_BASELINE: RoleBaseline = {
  farm: { gpm10: 380, gpm20: 480, xpm10: 420, xpm20: 540 },
  deaths: { perBucket: [0.3, 0.6, 0.9, 1.0, 1.0, 0.9, 0.7, 0.5, 0.3, 0.2] },
  laneWinRate: 0.5,
  winGivenLaneWon: 0.62,
}

const SUPPORT_BASELINE: RoleBaseline = {
  farm: { gpm10: 230, gpm20: 290, xpm10: 320, xpm20: 410 },
  deaths: { perBucket: [0.4, 0.8, 1.1, 1.2, 1.1, 1.0, 0.8, 0.6, 0.4, 0.3] },
  laneWinRate: 0.5,
  winGivenLaneWon: 0.60,
}

export function getRoleBaseline(role: Role): RoleBaseline {
  if (role === 'support') return SUPPORT_BASELINE
  // Treat 'unknown' as core — most pubs default to core-ish behavior.
  return CORE_BASELINE
}

// Item timing benchmarks — "good" timings (in seconds from match start) for
// commonly-built core items. Used by the item-timing analysis.
//
// TODO: replace with dynamic baseline (e.g. OpenDota /heroes/{id}/itemPopularity
// + percentile-based timing instead of hand-tuned guesses).
//
// Keys are OpenDota purchase_log item names (without "item_" prefix).
export const ITEM_GOOD_TIMING_SEC: Record<string, number> = {
  bfury: 22 * 60,           // Battlefury
  blink: 18 * 60,            // Blink Dagger
  ultimate_scepter: 25 * 60, // Aghs scepter
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

export interface RankBracket {
  /** Inclusive lower bound (rank_tier value, e.g. 31 = Archon 1) */
  min: number
  /** Inclusive upper bound */
  max: number
  label: string
}

// rank_tier in OpenDota is encoded as <medal_digit><star_digit>.
// 1x = Herald, 2x = Guardian, 3x = Crusader, 4x = Archon, 5x = Legend,
// 6x = Ancient, 7x = Divine, 8x = Immortal.
export const RANK_BRACKETS: RankBracket[] = [
  { min: 10, max: 19, label: 'Herald' },
  { min: 20, max: 29, label: 'Guardian' },
  { min: 30, max: 39, label: 'Crusader' },
  { min: 40, max: 49, label: 'Archon' },
  { min: 50, max: 59, label: 'Legend' },
  { min: 60, max: 69, label: 'Ancient' },
  { min: 70, max: 79, label: 'Divine' },
  { min: 80, max: 99, label: 'Immortal' },
]

export function rankLabel(rankTier?: number | null): string {
  if (!rankTier) return 'Uncalibrated'
  const bracket = RANK_BRACKETS.find((b) => rankTier >= b.min && rankTier <= b.max)
  return bracket?.label ?? 'Unknown'
}
