// Phase 7: lead-line synthesis.
//
// Picks the 2-3 highest-emphasis ProseFires across Cat 1A, 1B, and 2.
// Renders at the top of /breakdowns/{match_id} as standalone pull-quote
// cards. The same prose lines also appear in their original sections
// below — this is a pull-out, not an extraction.
//
// Emphasis scoring is centralized HERE (not in individual templates) so
// Phase 8 calibration can tune scoring without touching template files.
// Each scoring branch reads fields from the ProseFire's `facts` map
// that the originating template already computed.
//
// Diversification rule (per spec §2.5): at most 1 lead per category in
// v1. Hard cap. Tiebreaker for category preference: Cat 1A > Cat 2 >
// Cat 1B. Phase 8 calibration may relax this if matches surface where
// the cap forces a weak Cat 2 lead despite a stronger Cat 1B option.

import type { ProseFire } from './cat1b'
import type { Cat2Output } from './cat2'

export type LeadCategory = 'A' | 'B' | '2'

export interface LeadFire {
  fire: ProseFire
  category: LeadCategory
  /** Computed emphasis score on the 0-5 scale. Phase 8 tuning lives here. */
  score: number
}

// ────────── Cat 2 — pre-tagged template weights ──────────

const CAT2_BASE_WEIGHTS: Record<string, number> = {
  decisive_fight: 5,
  first_roshan: 3,
  draft_archetype: 3,
  t1_timing_extreme: 3,
  longest_fight: 2,
  first_blood: 2,
  gold_lead_swing: 2,
  draft_last_pick: 2,
  fight_distribution: 2,
  lane_outcomes_aggregate: 2,
  teamfight_count_outcome: 1,
  ban_priority: 1,
  roshan_count: 1,
}

function cat2Emphasis(fire: ProseFire): number {
  const base = CAT2_BASE_WEIGHTS[fire.templateId] ?? 1
  // gold_lead_swing demotes when peak/trough difference is uninteresting
  if (fire.templateId === 'gold_lead_swing') {
    const peak = Number(fire.facts.peak_gold ?? 0)
    const trough = Number(fire.facts.trough_gold ?? 0)
    const finalGold = Number(fire.facts.final_gold ?? 0)
    const diff = Math.max(Math.abs(peak - trough), Math.abs(finalGold))
    if (diff < 15000) return Math.max(1, base - 1)
  }
  return base
}

// ────────── Cat 1A — corpus-backed cross-match ──────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function cat1aEmphasis(fire: ProseFire): number {
  switch (fire.templateId) {
    case 'lane_wr_streak': {
      const len = Number(fire.facts.streak_length ?? 0)
      return clamp(len, 0, 5)
    }
    case 'hero_wr_delta': {
      const deltaPp = Math.abs(Number(fire.facts.delta_pp ?? 0))
      return clamp(deltaPp / 5, 0, 5)
    }
    case 'kda_vs_rolling': {
      const matchKda = Number(fire.facts.match_kda ?? 0)
      const rolling = Number(fire.facts.rolling_kda ?? 1)
      const delta = Math.abs(matchKda - rolling)
      return clamp(delta / 2, 0, 5)
    }
    case 'gpm_vs_rolling': {
      const pct = Number(fire.facts.rel_delta_pct ?? 0)
      return clamp(pct / 5, 0, 5)
    }
    case 'vision_vs_rolling': {
      const myObs = Number(fire.facts.match_obs ?? 0)
      const mySen = Number(fire.facts.match_sen ?? 0)
      const rollObs = Number(fire.facts.rolling_obs ?? 0)
      const rollSen = Number(fire.facts.rolling_sen ?? 0)
      const denom = Math.max(rollObs + rollSen, 1)
      const ratio = (myObs + mySen) / denom
      return clamp((1 - ratio) * 5, 0, 5)
    }
    case 'role_distribution_shift': {
      const sharePct = Number(fire.facts.match_role_share_pct ?? 0)
      const dominantPct = Number(fire.facts.dominant_share_pct ?? 0)
      // Rare-role plays for clear-main players: share should be small,
      // dominant should be big. Both factors push emphasis up.
      return clamp(((100 - sharePct) / 100) * (dominantPct / 100) * 6, 0, 5)
    }
    case 'hero_kda_outlier': {
      const matchKda = Number(fire.facts.match_kda ?? 0)
      const rolling = Math.max(Number(fire.facts.rolling_hero_kda ?? 0.1), 0.1)
      // Use absolute log-ratio so high AND low outliers score symmetrically
      // on a multiplicative scale. 1.7× rolling = ~2.1; 0.4× = ~3.7.
      const ratio = matchKda / rolling
      return clamp(Math.abs(Math.log(Math.max(ratio, 0.01))) * 3, 0, 5)
    }
    default:
      return 2
  }
}

// ────────── Cat 1B — within-match per-player ──────────

function cat1bEmphasis(fire: ProseFire): number {
  switch (fire.templateId) {
    case 'vision_output_low': {
      const myObs = Number(fire.facts.obs_placed ?? 0)
      const median = Number(fire.facts.match_support_median_obs ?? 0)
      const gap = Math.max(0, median - myObs)
      return clamp(gap / 2, 0, 5)
    }
    case 'five_slot_timing_outlier': {
      const delta = Math.abs(Number(fire.facts.delta_min ?? 0))
      return clamp(delta / 2, 0, 5)
    }
    case 'kda_extreme': {
      const kda = Number(fire.facts.kda ?? 0)
      const rank = String(fire.facts.rank ?? '')
      return rank === 'highest' ? clamp((kda - 5) / 3, 0, 5) : clamp((2 - kda) * 2, 0, 5)
    }
    case 'teamfight_participation_rank': {
      const pct = Number(fire.facts.teamfight_pct ?? 0)
      const rank = String(fire.facts.rank ?? '')
      return rank === 'highest' ? clamp((pct - 70) / 6, 0, 5) : clamp((40 - pct) / 8, 0, 5)
    }
    case 'dead_time_block': {
      const deaths = Number(fire.facts.deaths_in_window ?? 0)
      return clamp(deaths - 2, 0, 5)
    }
    case 'buyback_pattern_zero': {
      // Absolute floor — fixed boost (0 buybacks on losing core in 35+ min game)
      return 3
    }
    case 'lane_efficiency_extreme': {
      // Fires only when gap > 15pp. Rough fixed score.
      return 3
    }
    case 'stun_duration_high': {
      const myPerMin = Number(fire.facts.stuns_per_min ?? 0)
      // Fires when > sum of others. 1.0+/min is meaningful, 3.0+/min is huge.
      return clamp(myPerMin - 1, 0, 5)
    }
    case 'hero_damage_share': {
      const sharePct = Number(fire.facts.damage_share_pct ?? 0)
      return clamp((sharePct - 35) / 4, 0, 5)
    }
    default:
      return 2
  }
}

// ────────── Public API ──────────

export function emphasisScore(fire: ProseFire, category: LeadCategory): number {
  if (category === 'A') return cat1aEmphasis(fire)
  if (category === 'B') return cat1bEmphasis(fire)
  return cat2Emphasis(fire)
}

function categoryRank(c: LeadCategory): number {
  // Tiebreaker: Cat 1A wins over Cat 2 wins over Cat 1B
  if (c === 'A') return 0
  if (c === '2') return 1
  return 2
}

/**
 * Pick up to 3 lead lines across all categories with both per-player
 * dedup AND category diversification applied at pick-time.
 *
 * Walking the sorted candidates, skip a fire when EITHER:
 *   1. its source player has already contributed a lead (per-player
 *      dedup; team-level Cat 2 fires with no sourcePlayerSlot are
 *      exempt — they can co-exist in leads alongside player-level fires)
 *   2. its category has already been used (max one lead per category)
 *
 * Phase 7 calibration: the per-player dedup was added after the BetBoom
 * vs Aurora dump produced two leads about the same player (gpk~'s 31
 * KDA from both Cat 1A and Cat 1B). Pull-quotes can't repeat the same
 * actor or they stop reading as headlines.
 */
export function selectLeadLines(
  cat1aMap: Map<number, ProseFire[]>,
  cat1bMap: Map<number, ProseFire[]>,
  cat2: Cat2Output
): LeadFire[] {
  const all: LeadFire[] = []
  for (const fires of cat1aMap.values()) {
    for (const f of fires) all.push({ fire: f, category: 'A', score: emphasisScore(f, 'A') })
  }
  for (const fires of cat1bMap.values()) {
    for (const f of fires) all.push({ fire: f, category: 'B', score: emphasisScore(f, 'B') })
  }
  for (const list of [cat2.draft, cat2.lane, cat2.midgame, cat2.teamfights]) {
    for (const f of list) all.push({ fire: f, category: '2', score: emphasisScore(f, '2') })
  }

  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return categoryRank(a.category) - categoryRank(b.category)
  })

  const usedCategories = new Set<LeadCategory>()
  const usedPlayers = new Set<number>()
  const picks: LeadFire[] = []
  for (const item of all) {
    const slot = item.fire.sourcePlayerSlot
    // Per-player dedup (player-level fires only)
    if (slot != null && usedPlayers.has(slot)) continue
    // Category diversification cap
    if (usedCategories.has(item.category)) continue
    picks.push(item)
    usedCategories.add(item.category)
    if (slot != null) usedPlayers.add(slot)
    if (picks.length === 3) break
  }
  return picks
}

/**
 * Diagnostic helper for the Phase 7 dump — returns ALL fires with their
 * computed scores so we can review why certain leads were picked or
 * dropped. Sorted by score desc.
 */
export function rankAllFires(
  cat1aMap: Map<number, ProseFire[]>,
  cat1bMap: Map<number, ProseFire[]>,
  cat2: Cat2Output
): LeadFire[] {
  const all: LeadFire[] = []
  for (const fires of cat1aMap.values()) {
    for (const f of fires) all.push({ fire: f, category: 'A', score: emphasisScore(f, 'A') })
  }
  for (const fires of cat1bMap.values()) {
    for (const f of fires) all.push({ fire: f, category: 'B', score: emphasisScore(f, 'B') })
  }
  for (const list of [cat2.draft, cat2.lane, cat2.midgame, cat2.teamfights]) {
    for (const f of list) all.push({ fire: f, category: '2', score: emphasisScore(f, '2') })
  }
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return categoryRank(a.category) - categoryRank(b.category)
  })
  return all
}
