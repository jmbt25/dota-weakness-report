// Pro Comparison playstyle vector + similarity logic.
//
// This module:
//   1. defines the ProVector / ProCorpus types matching
//      `src/data/pro-vectors.json`
//   2. computes the user's playstyle vector from their /report data
//      (mirrors `scripts/build-pro-vectors.mjs`'s computeVector — keep in
//      sync, see comment in that file)
//   3. computes per-axis cosine similarity between user and pros
//   4. detects flex playstyle via role-distribution entropy and
//      suppresses the headline twin when entropy is too high
//
// User data flow: App.tsx already pulls /players/{id}/matches and
// /matches/{id} during the report run. We piggyback on that — the
// ProComparisonCard receives the same matches/details/accountId that
// the other analyses do, no extra OpenDota calls.
//
// Vector dimensions (must match the .mjs side):
//   role(5) + archetype(8) + tempo(4) + farm(4) + vision(3) +
//   death(3) + spending(2 nullable) + involvement(1) = 30 features.
//
// Null-bucket policy: spending.core_spike_min and support_spike_min
// can each be null when the player has fewer than 3 games of that
// hero-role in their detail subset. Cosine similarity drops null
// dimensions from BOTH vectors before computing — null is NOT
// substituted with 0 (which would falsely claim "spikes at minute 0").

import type { ODMatchDetail, ODMatchSummary, ODMatchPlayer } from '../types'
import { classifyHeroById, type HeroRole } from './heroRoles'
import { archetypeFor, ARCHETYPES, type HeroArchetype } from './heroArchetypes'

// ============================================================================
// Types — mirror src/data/pro-vectors.json
// ============================================================================

export interface VectorRaw {
  role_dist: { pos1: number; pos2: number; pos3: number; pos4: number; pos5: number }
  hero_archetype: {
    unique_hero_ratio: number
    top3_concentration: number
    melee_carry: number
    ranged_carry: number
    caster_nuker: number
    initiator: number
    support: number
    durable_core: number
  }
  tempo: {
    median_duration_min: number
    pct_under_30min: number
    pct_over_45min: number
    kda_per_min: number
  }
  farm: {
    lh_per_min: number
    gpm: number
    lh_at_10: number
    lane_efficiency_pct: number
  }
  vision: {
    obs_per_game: number
    sen_per_game: number
    dewards_per_game: number
  }
  death: {
    deaths_per_match: number
    deaths_per_min: number
    kda_ratio: number
  }
  spending: {
    core_spike_min: number | null
    core_spike_n: number
    support_spike_min: number | null
    support_spike_n: number
  }
  involvement: {
    kill_participation: number
  }
}

export interface ProVector {
  account_id: number
  name: string
  team: string
  country: string | null
  fantasy_role: number | null
  match_count: number
  detail_count: number
  raw: VectorRaw
}

export interface ProCorpus {
  last_updated: string
  source: string
  pro_count: number
  expected_count: number
  failed_count: number
  failed_pros: { name: string; account_id: number; kind: string }[]
  vectors: ProVector[]
}

// ============================================================================
// Vector computation — TS mirror of scripts/build-pro-vectors.mjs
// ============================================================================

const SUPPORT_TARGET_ITEMS = ['force_staff', 'glimmer_cape', 'aghanims_shard', 'ultimate_scepter', 'aether_lens']
const CORE_TARGET_ITEMS = ['black_king_bar', 'ultimate_scepter', 'aghanims_shard']

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function pctWhere<T>(arr: T[], pred: (x: T) => boolean): number {
  if (arr.length === 0) return 0
  return arr.filter(pred).length / arr.length
}

function classifyPos(detail: ODMatchDetail, player: ODMatchPlayer): number {
  const heroRole: HeroRole = classifyHeroById(player.hero_id)
  const lane = player.lane_role
  const roaming = player.is_roaming === true
  const lhPerMin = (player.last_hits ?? 0) / Math.max(detail.duration / 60, 1)

  if (lane === 2) return 2
  if (lane === 4 || roaming) return 4
  if (lane === 1) {
    if (heroRole === 'support') return 5
    if (heroRole === 'core') return 1
    return lhPerMin >= 4.5 ? 1 : 5
  }
  if (lane === 3) {
    if (heroRole === 'support') return 4
    if (heroRole === 'core') return 3
    return lhPerMin >= 4.0 ? 3 : 4
  }
  if (heroRole === 'support') return lhPerMin < 2 ? 5 : 4
  return lhPerMin >= 5 ? 1 : 3
}

function firstMajorItemSec(player: ODMatchPlayer, heroRole: HeroRole): number | null {
  const log = player.purchase_log ?? []
  const targets = heroRole === 'support' ? SUPPORT_TARGET_ITEMS : CORE_TARGET_ITEMS
  let earliest = Infinity
  for (const entry of log) {
    if (targets.includes(entry.key) && typeof entry.time === 'number' && entry.time < earliest) {
      earliest = entry.time
    }
  }
  return earliest === Infinity ? null : earliest
}

function killParticipation(detail: ODMatchDetail, player: ODMatchPlayer): number {
  const isRadiant = (player.player_slot ?? 0) < 128
  let teamKills = 0
  for (const p of detail.players ?? []) {
    const pIsRadiant = (p.player_slot ?? 0) < 128
    if (pIsRadiant === isRadiant) teamKills += p.kills ?? 0
  }
  if (teamKills === 0) return 0
  return ((player.kills ?? 0) + (player.assists ?? 0)) / teamKills
}

/**
 * Build the user's playstyle vector from their /report data.
 *
 * `details` is the same map App.tsx already populates (match_id → parsed
 * detail). We use any detail that has a valid gold_t for the player; matches
 * without parsed data contribute to the cheap features (tempo / KDA / hero
 * pool / archetype) but not the detail-derived ones.
 */
export function computeUserVector(
  matches: ODMatchSummary[],
  details: Record<number, ODMatchDetail>,
  accountId: number
): VectorRaw | null {
  const summary = matches.filter((m) => typeof m.hero_id === 'number')
  if (summary.length === 0) return null

  const detailRecords: { summary: ODMatchSummary; detail: ODMatchDetail; player: ODMatchPlayer }[] = []
  for (const m of summary) {
    const detail = details[m.match_id]
    if (!detail) continue
    const player = (detail.players ?? []).find((p) => p.account_id === accountId)
    if (!player) continue
    if (!Array.isArray(player.gold_t) || player.gold_t.length === 0) continue
    detailRecords.push({ summary: m, detail, player })
  }

  // Hero archetype (from summary, N up to 50)
  const heroCounts: Record<number, number> = {}
  const archCounts: Record<HeroArchetype, number> = {
    melee_carry: 0, ranged_carry: 0, caster_nuker: 0,
    initiator: 0, support: 0, durable_core: 0,
  }
  for (const m of summary) {
    heroCounts[m.hero_id] = (heroCounts[m.hero_id] ?? 0) + 1
    archCounts[archetypeFor(m.hero_id)]++
  }
  const uniqueHeroes = Object.keys(heroCounts).length
  const sortedCounts = Object.values(heroCounts).sort((a, b) => b - a)
  const top3Sum = (sortedCounts[0] ?? 0) + (sortedCounts[1] ?? 0) + (sortedCounts[2] ?? 0)

  // Tempo
  const durations = summary.map((m) => m.duration)
  const medianDur = median(durations)
  const pctUnder30 = pctWhere(durations, (d) => d < 30 * 60)
  const pctOver45 = pctWhere(durations, (d) => d > 45 * 60)
  let kdaSum = 0
  let durMinSum = 0
  for (const m of summary) {
    kdaSum += (m.kills ?? 0) + (m.deaths ?? 0) + (m.assists ?? 0)
    durMinSum += m.duration / 60
  }
  const kdaPerMin = durMinSum > 0 ? kdaSum / durMinSum : 0

  // Death (from summary)
  let dSum = 0, kSum = 0, aSum = 0
  for (const m of summary) {
    dSum += m.deaths ?? 0
    kSum += m.kills ?? 0
    aSum += m.assists ?? 0
  }
  const deathsPerMatch = dSum / summary.length
  const deathsPerMin = durMinSum > 0 ? dSum / durMinSum : 0
  const kdaRatio = dSum > 0 ? (kSum + aSum) / dSum : kSum + aSum

  // Detail-dependent
  let roleDist = [0, 0, 0, 0, 0]
  let lhPerMin = 0, gpmAvg = 0, lhAt10Avg = 0, laneEffAvg = 0
  let obsPerGame = 0, senPerGame = 0, dewardsPerGame = 0
  let coreSpikeMin: number | null = null, supportSpikeMin: number | null = null
  let coreSpikeN = 0, supportSpikeN = 0
  let killParticipationAvg = 0

  if (detailRecords.length > 0) {
    const posCounts = [0, 0, 0, 0, 0]
    for (const r of detailRecords) {
      const pos = classifyPos(r.detail, r.player)
      if (pos >= 1 && pos <= 5) posCounts[pos - 1]++
    }
    const totalPos = posCounts.reduce((a, b) => a + b, 0)
    roleDist = posCounts.map((c) => (totalPos > 0 ? c / totalPos : 0))

    let lhSum = 0, gpmSum = 0, lhAt10Sum = 0, lhAt10N = 0
    let laneEffSum = 0, laneEffN = 0, detailDurMin = 0
    for (const r of detailRecords) {
      lhSum += r.player.last_hits ?? 0
      detailDurMin += r.detail.duration / 60
      gpmSum += r.player.gold_per_min ?? 0
      if (Array.isArray(r.player.lh_t) && r.player.lh_t.length > 10) {
        lhAt10Sum += r.player.lh_t[10]
        lhAt10N++
      }
      if (typeof r.player.lane_efficiency_pct === 'number') {
        laneEffSum += r.player.lane_efficiency_pct
        laneEffN++
      }
    }
    lhPerMin = detailDurMin > 0 ? lhSum / detailDurMin : 0
    gpmAvg = gpmSum / detailRecords.length
    lhAt10Avg = lhAt10N > 0 ? lhAt10Sum / lhAt10N : 0
    laneEffAvg = laneEffN > 0 ? laneEffSum / laneEffN : 0

    let obsSum = 0, senSum = 0, dewardSum = 0
    for (const r of detailRecords) {
      obsSum += r.player.obs_placed ?? 0
      senSum += r.player.sen_placed ?? 0
      dewardSum += (r.player.observer_kills ?? 0) + (r.player.sentry_kills ?? 0)
    }
    obsPerGame = obsSum / detailRecords.length
    senPerGame = senSum / detailRecords.length
    dewardsPerGame = dewardSum / detailRecords.length

    const coreSpikes: number[] = []
    const supportSpikes: number[] = []
    for (const r of detailRecords) {
      const heroRole = classifyHeroById(r.player.hero_id)
      const firstSec = firstMajorItemSec(r.player, heroRole)
      if (firstSec == null) continue
      if (heroRole === 'support') supportSpikes.push(firstSec)
      else coreSpikes.push(firstSec)
    }
    coreSpikeN = coreSpikes.length
    supportSpikeN = supportSpikes.length
    coreSpikeMin = coreSpikes.length >= 3 ? median(coreSpikes) / 60 : null
    supportSpikeMin = supportSpikes.length >= 3 ? median(supportSpikes) / 60 : null

    let kpSum = 0
    for (const r of detailRecords) kpSum += killParticipation(r.detail, r.player)
    killParticipationAvg = kpSum / detailRecords.length
  }

  return {
    role_dist: { pos1: roleDist[0], pos2: roleDist[1], pos3: roleDist[2], pos4: roleDist[3], pos5: roleDist[4] },
    hero_archetype: {
      unique_hero_ratio: uniqueHeroes / summary.length,
      top3_concentration: top3Sum / summary.length,
      melee_carry: archCounts.melee_carry / summary.length,
      ranged_carry: archCounts.ranged_carry / summary.length,
      caster_nuker: archCounts.caster_nuker / summary.length,
      initiator: archCounts.initiator / summary.length,
      support: archCounts.support / summary.length,
      durable_core: archCounts.durable_core / summary.length,
    },
    tempo: {
      median_duration_min: medianDur / 60,
      pct_under_30min: pctUnder30,
      pct_over_45min: pctOver45,
      kda_per_min: kdaPerMin,
    },
    farm: {
      lh_per_min: lhPerMin,
      gpm: gpmAvg,
      lh_at_10: lhAt10Avg,
      lane_efficiency_pct: laneEffAvg,
    },
    vision: {
      obs_per_game: obsPerGame,
      sen_per_game: senPerGame,
      dewards_per_game: dewardsPerGame,
    },
    death: {
      deaths_per_match: deathsPerMatch,
      deaths_per_min: deathsPerMin,
      kda_ratio: kdaRatio,
    },
    spending: {
      core_spike_min: coreSpikeMin,
      core_spike_n: coreSpikeN,
      support_spike_min: supportSpikeMin,
      support_spike_n: supportSpikeN,
    },
    involvement: {
      kill_participation: killParticipationAvg,
    },
  }
}

// ============================================================================
// Vector flattening + per-axis grouping
// ============================================================================

export type AxisName =
  | 'role'
  | 'hero_archetype'
  | 'tempo'
  | 'farm'
  | 'vision'
  | 'death'
  | 'spending'
  | 'involvement'

export const AXIS_LABEL: Record<AxisName, string> = {
  role: 'role distribution',
  hero_archetype: 'hero archetype',
  tempo: 'tempo',
  farm: 'farm shape',
  vision: 'vision',
  death: 'death pattern',
  spending: 'spending tempo',
  involvement: 'fight involvement',
}

interface FeatureSpec {
  name: string
  axis: AxisName
  pick: (v: VectorRaw) => number | null
}

// Feature ordering and per-feature accessors. Indices in this list define
// the dimension layout of the flat vector. Spending features can be null
// (per-pro nullability handled at similarity time).
const FEATURES: FeatureSpec[] = [
  // role (5)
  { name: 'pos1', axis: 'role', pick: (v) => v.role_dist.pos1 },
  { name: 'pos2', axis: 'role', pick: (v) => v.role_dist.pos2 },
  { name: 'pos3', axis: 'role', pick: (v) => v.role_dist.pos3 },
  { name: 'pos4', axis: 'role', pick: (v) => v.role_dist.pos4 },
  { name: 'pos5', axis: 'role', pick: (v) => v.role_dist.pos5 },
  // hero archetype (8)
  { name: 'unique_hero_ratio', axis: 'hero_archetype', pick: (v) => v.hero_archetype.unique_hero_ratio },
  { name: 'top3_concentration', axis: 'hero_archetype', pick: (v) => v.hero_archetype.top3_concentration },
  ...ARCHETYPES.map<FeatureSpec>((a) => ({
    name: a,
    axis: 'hero_archetype' as AxisName,
    pick: (v) => v.hero_archetype[a],
  })),
  // tempo (4)
  { name: 'median_duration_min', axis: 'tempo', pick: (v) => v.tempo.median_duration_min },
  { name: 'pct_under_30min', axis: 'tempo', pick: (v) => v.tempo.pct_under_30min },
  { name: 'pct_over_45min', axis: 'tempo', pick: (v) => v.tempo.pct_over_45min },
  { name: 'kda_per_min', axis: 'tempo', pick: (v) => v.tempo.kda_per_min },
  // farm (4)
  { name: 'lh_per_min', axis: 'farm', pick: (v) => v.farm.lh_per_min },
  { name: 'gpm', axis: 'farm', pick: (v) => v.farm.gpm },
  { name: 'lh_at_10', axis: 'farm', pick: (v) => v.farm.lh_at_10 },
  { name: 'lane_efficiency_pct', axis: 'farm', pick: (v) => v.farm.lane_efficiency_pct },
  // vision (3)
  { name: 'obs_per_game', axis: 'vision', pick: (v) => v.vision.obs_per_game },
  { name: 'sen_per_game', axis: 'vision', pick: (v) => v.vision.sen_per_game },
  { name: 'dewards_per_game', axis: 'vision', pick: (v) => v.vision.dewards_per_game },
  // death (3)
  { name: 'deaths_per_match', axis: 'death', pick: (v) => v.death.deaths_per_match },
  { name: 'deaths_per_min', axis: 'death', pick: (v) => v.death.deaths_per_min },
  { name: 'kda_ratio', axis: 'death', pick: (v) => v.death.kda_ratio },
  // spending (2 — nullable)
  { name: 'core_spike_min', axis: 'spending', pick: (v) => v.spending.core_spike_min },
  { name: 'support_spike_min', axis: 'spending', pick: (v) => v.spending.support_spike_min },
  // involvement (1)
  { name: 'kill_participation', axis: 'involvement', pick: (v) => v.involvement.kill_participation },
]

const TEMPO_DOWNWEIGHT_MEDIAN_DUR = 0.25 // see comment in cosineSimilarity()

// ============================================================================
// Min-max normalization helpers
// ============================================================================

interface FeatureStats {
  min: number
  max: number
}

/**
 * Per-feature corpus stats. We min-max normalize against the corpus + the
 * user's own values combined — not just the corpus — so a user well outside
 * the pro range (e.g. a Crusader with 320 GPM vs corpus min 480) still
 * normalizes to a valid [0,1] coordinate.
 */
function buildStats(corpus: ProVector[], user: VectorRaw | null): FeatureStats[] {
  return FEATURES.map((spec) => {
    let min = Infinity
    let max = -Infinity
    for (const p of corpus) {
      const v = spec.pick(p.raw)
      if (v == null) continue
      if (v < min) min = v
      if (v > max) max = v
    }
    if (user) {
      const v = spec.pick(user)
      if (v != null) {
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    if (min === Infinity || max === -Infinity) return { min: 0, max: 1 }
    return { min, max }
  })
}

function normalize(value: number | null, stats: FeatureStats): number | null {
  if (value == null) return null
  const range = stats.max - stats.min
  if (range === 0) return 0
  return (value - stats.min) / range
}

// ============================================================================
// Cosine similarity with null-bucket dropping
// ============================================================================

/**
 * Cosine similarity over feature dimensions.
 *
 * Null handling: any dimension where EITHER vector is null gets dropped from
 * BOTH before computing dot/magnitude. Substituting 0 would falsely claim
 * "spikes at minute 0," so we drop the dimension entirely. If the active
 * dimension count drops below `minDim`, returns null (insufficient overlap).
 *
 * Median-duration downweight: per Phase 2 direction, median_duration's
 * 4-min spread among pros means even after min-max normalization it
 * occupies a [0,1] range that competes equally with role distribution's
 * [0,1] range. Manual factor of 0.25 attenuates its contribution so it
 * acts as a tiebreaker, not a driver.
 */
function cosineSimilarity(
  user: (number | null)[],
  pro: (number | null)[],
  indices: number[],
  minDim = 1
): number | null {
  // Collect the active dim values (dropping null on either side).
  const uVals: number[] = []
  const pVals: number[] = []
  const weights: number[] = []
  for (const i of indices) {
    const u = user[i]
    const p = pro[i]
    if (u == null || p == null) continue
    let weight = 1
    if (FEATURES[i].name === 'median_duration_min') weight = TEMPO_DOWNWEIGHT_MEDIAN_DUR
    uVals.push(u)
    pVals.push(p)
    weights.push(weight)
  }
  if (uVals.length < minDim) return null

  // ─────────────────────────────────────────────────────────────────
  // Single-feature-axis fallback — DO NOT REMOVE without re-deriving
  // ─────────────────────────────────────────────────────────────────
  // Cosine similarity between two 1-D vectors is mathematically
  // useless: cos(u, p) = (u·p)/(|u||p|) = sign(u)·sign(p). For any
  // two same-sign positive scalars (which all min-max-normalized
  // values [0,1] are), cos always equals exactly 1. So with cosine,
  // every pro ties at sim=1.0 on a 1-D axis and the "closest" pro is
  // whoever happens to be first in iteration order — silently
  // arbitrary, not a real similarity.
  //
  // This bites two axes in our setup:
  //   (a) `involvement` — only one feature, kill_participation. Always 1-D.
  //   (b) `spending`     — when EITHER core_spike_min or
  //                        support_spike_min is null in either user OR
  //                        pro, the axis collapses from 2-D to 1-D.
  //                        Pure-pos-1 carries usually have null
  //                        support_spike (no support games); pure
  //                        supports usually have null core_spike.
  //
  // Caught during the magsasaka 4-pro stand-in demo on 2026-04-29 —
  // Larl was winning involvement at sim=1.000 just because he was
  // listed first. Fall back to closeness in [0,1] normalized space
  // (1 - absolute distance) for 1-D axes — preserves the "closer is
  // better" semantics that cosine has on multi-D.
  if (uVals.length === 1) {
    return 1 - Math.abs(uVals[0] - pVals[0])
  }

  let dot = 0
  let nU = 0
  let nP = 0
  for (let k = 0; k < uVals.length; k++) {
    const uw = uVals[k] * weights[k]
    const pw = pVals[k] * weights[k]
    dot += uw * pw
    nU += uw * uw
    nP += pw * pw
  }
  if (nU === 0 || nP === 0) return null
  return dot / (Math.sqrt(nU) * Math.sqrt(nP))
}

// ============================================================================
// Top-level: find closest pros (overall + per axis)
// ============================================================================

export interface AxisMatch {
  axis: AxisName
  axisLabel: string
  pro: ProVector
  similarity: number
  /** True when the axis was dropped entirely (e.g., user has no spending data). */
  unavailable?: boolean
  unavailableReason?: string
}

export interface ProComparison {
  user: VectorRaw
  /** Closest pro overall — null when role distribution is too flex (entropy threshold). */
  closestOverall: ProVector | null
  closestOverallSimilarity: number | null
  /** Set when closestOverall was suppressed for entropy reasons. */
  flexSuppression: { entropy: number; threshold: number } | null
  perAxis: AxisMatch[]
}

/**
 * Role-distribution Shannon entropy. Higher = more spread across roles.
 *  - Pure pos 1 main: entropy = 0.0
 *  - 50/50 between two roles: entropy = 0.69 (ln 2)
 *  - 33/33/33 across three roles: entropy = 1.10 (ln 3)
 *  - Uniform across all 5 roles: entropy ≈ 1.61 (ln 5)
 *
 * Threshold of 0.95 catches genuine 3+ role flex players (entropy > ln 2.6)
 * without flagging a 70/20/10 player as flex. Below that, the closest pro
 * twin is meaningful; above it, the headline gets suppressed and we lead
 * with per-axis breakdown.
 */
const FLEX_ENTROPY_THRESHOLD = 0.95

export function roleDistributionEntropy(v: VectorRaw): number {
  const dist = [v.role_dist.pos1, v.role_dist.pos2, v.role_dist.pos3, v.role_dist.pos4, v.role_dist.pos5]
  let h = 0
  for (const p of dist) {
    if (p > 0) h -= p * Math.log(p)
  }
  return h
}

export function compareUserToPros(user: VectorRaw, corpus: ProVector[]): ProComparison {
  const stats = buildStats(corpus, user)
  const userFlat = FEATURES.map((spec, i) => normalize(spec.pick(user), stats[i]))
  const proFlats = corpus.map((p) => FEATURES.map((spec, i) => normalize(spec.pick(p.raw), stats[i])))

  const allIndices = FEATURES.map((_, i) => i)

  // Overall closest
  let bestOverall: ProVector | null = null
  let bestOverallSim = -Infinity
  for (let pi = 0; pi < corpus.length; pi++) {
    const sim = cosineSimilarity(userFlat, proFlats[pi], allIndices, 5)
    if (sim != null && sim > bestOverallSim) {
      bestOverallSim = sim
      bestOverall = corpus[pi]
    }
  }

  // Flex suppression
  const entropy = roleDistributionEntropy(user)
  const flexSuppression = entropy > FLEX_ENTROPY_THRESHOLD
    ? { entropy, threshold: FLEX_ENTROPY_THRESHOLD }
    : null

  // Per-axis closest
  const perAxis: AxisMatch[] = []
  const axes: AxisName[] = ['role', 'hero_archetype', 'tempo', 'farm', 'vision', 'death', 'spending', 'involvement']
  for (const axis of axes) {
    const idx = allIndices.filter((i) => FEATURES[i].axis === axis)

    // For users with no detail data, role/farm/vision/spending/involvement
    // are all 0 — suppress those axes entirely with an explicit reason.
    const userHasAny = idx.some((i) => userFlat[i] != null && (FEATURES[i].pick(user) ?? 0) !== 0)
    if (!userHasAny && (axis === 'spending' || axis === 'farm' || axis === 'vision' || axis === 'involvement' || axis === 'role')) {
      perAxis.push({
        axis,
        axisLabel: AXIS_LABEL[axis],
        pro: corpus[0]!, // placeholder; consumer should check unavailable
        similarity: 0,
        unavailable: true,
        unavailableReason:
          axis === 'spending' ? 'No major-item purchases parsed in your sample.' : 'No parsed-match data for this axis.',
      })
      continue
    }

    let bestPro: ProVector | null = null
    let bestSim = -Infinity
    for (let pi = 0; pi < corpus.length; pi++) {
      const sim = cosineSimilarity(userFlat, proFlats[pi], idx, 1)
      if (sim != null && sim > bestSim) {
        bestSim = sim
        bestPro = corpus[pi]
      }
    }
    if (bestPro && bestSim > -Infinity) {
      perAxis.push({ axis, axisLabel: AXIS_LABEL[axis], pro: bestPro, similarity: bestSim })
    }
  }

  return {
    user,
    closestOverall: flexSuppression ? null : bestOverall,
    closestOverallSimilarity: flexSuppression ? null : bestOverallSim,
    flexSuppression,
    perAxis,
  }
}

// ============================================================================
// Staleness canary
// ============================================================================

export interface CorpusStaleness {
  ageDays: number
  lastUpdated: Date
  isStale: boolean
}

const STALENESS_THRESHOLD_DAYS = 14

export function computeStaleness(lastUpdatedIso: string, now = new Date()): CorpusStaleness {
  const lastUpdated = new Date(lastUpdatedIso)
  const ageMs = now.getTime() - lastUpdated.getTime()
  const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000))
  return {
    ageDays,
    lastUpdated,
    isStale: ageDays > STALENESS_THRESHOLD_DAYS,
  }
}

// ============================================================================
// Helper: shape "Why" + "Where you diverge" lines
// ============================================================================

/**
 * Minimum normalized-space gap to count as a real divergence. Below this,
 * the divergence line is suppressed (a near-perfect match doesn't need
 * to manufacture a gap). 0.1 = 10% of the corpus's full range for the
 * feature in question.
 */
const MIN_DIVERGENCE_GAP = 0.1

/**
 * Compute the "Why" line for the closest twin — surface the 3 features where
 * user and pro most overlap. Used in the default-mode card body.
 *
 * IMPORTANT: must normalize against the FULL corpus, not just (user, pro).
 * Two-vector normalization collapses every feature's range to exactly the
 * user-pro gap, making every dimension look equally diverged at gap=1.0.
 */
export function topOverlapFeatures(user: VectorRaw, pro: ProVector, corpus: ProVector[]): { name: string; userVal: number | null; proVal: number | null }[] {
  const stats = buildStats(corpus, user)
  const userFlat = FEATURES.map((spec, i) => normalize(spec.pick(user), stats[i]))
  const proFlat = FEATURES.map((spec, i) => normalize(spec.pick(pro.raw), stats[i]))
  const ranked: { idx: number; gap: number }[] = []
  for (let i = 0; i < FEATURES.length; i++) {
    if (userFlat[i] == null || proFlat[i] == null) continue
    ranked.push({ idx: i, gap: Math.abs((userFlat[i] ?? 0) - (proFlat[i] ?? 0)) })
  }
  ranked.sort((a, b) => a.gap - b.gap)
  return ranked.slice(0, 3).map((r) => ({
    name: FEATURES[r.idx].name,
    userVal: FEATURES[r.idx].pick(user),
    proVal: FEATURES[r.idx].pick(pro.raw),
  }))
}

/**
 * Compute the "Where you diverge" line — the feature where user and pro
 * differ most. Surfaces the actionable gap.
 *
 * Returns null when the largest gap is below MIN_DIVERGENCE_GAP — for very
 * tight matches the divergence line should be suppressed rather than
 * manufacturing a gap from noise.
 *
 * MUST normalize against the full corpus. Normalizing against just
 * (user, pro) collapses every feature's range to the user-pro gap; every
 * feature ends up at gap=1.0 in normalized space and the iteration order
 * arbitrarily picks the first feature (role/pos1) every time. Bug caught
 * during the v1.3.0 walkthrough — Crystallis match's 96% vs 100% pos 1
 * was being surfaced as the divergence even though that 4pp gap was the
 * smallest in the vector. Fixed by passing the full corpus through.
 */
export function biggestDivergence(user: VectorRaw, pro: ProVector, corpus: ProVector[]): { name: string; userVal: number; proVal: number; ratio: number } | null {
  const stats = buildStats(corpus, user)
  const userFlat = FEATURES.map((spec, i) => normalize(spec.pick(user), stats[i]))
  const proFlat = FEATURES.map((spec, i) => normalize(spec.pick(pro.raw), stats[i]))
  let bestIdx = -1
  let bestGap = -Infinity
  for (let i = 0; i < FEATURES.length; i++) {
    // Skip hero_archetype features — they capture playstyle taste, not
    // actionable behavior. ProComparisonCard's per-axis breakdown shows the
    // archetype overlap separately ("hero pool overlaps with the heroes
    // drafted onto X"); the divergence line is meant to surface a concrete
    // habit to steal (vision, farm shape, death pattern, spending tempo).
    // Picking "you play 22% melee carry vs his 40%" doesn't translate to
    // an actionable change.
    if (FEATURES[i].axis === 'hero_archetype') continue
    if (userFlat[i] == null || proFlat[i] == null) continue
    const gap = Math.abs((userFlat[i] ?? 0) - (proFlat[i] ?? 0))
    if (gap > bestGap) {
      bestGap = gap
      bestIdx = i
    }
  }
  if (bestIdx < 0) return null
  if (bestGap < MIN_DIVERGENCE_GAP) return null // Suppress: match is tight enough that no feature is meaningfully diverged.
  const userVal = FEATURES[bestIdx].pick(user) ?? 0
  const proVal = FEATURES[bestIdx].pick(pro.raw) ?? 0
  const ratio = userVal === 0 ? proVal : proVal / userVal
  return { name: FEATURES[bestIdx].name, userVal, proVal, ratio }
}

export const PRO_COMPARISON_MIN_MATCHES = 25
