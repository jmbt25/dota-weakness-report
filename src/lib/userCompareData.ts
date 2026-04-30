// User-comparison data aggregator (Phase A of v1.9.0 user-comparison feature).
//
// Pure post-pipeline aggregation. Hooks into /report's analyze flow at
// stream-done; consumes the same (matches, details, profile) tuple the
// report cards do; produces a per-position bracket-median snapshot
// keyed off the user's lobby-mate stats.
//
// Spec: docs/breakdowns-user-comparison-v1-spec.md §D.
//
// No new API calls. No mutation of inputs. Sync. Typical 50-match
// aggregation runs in well under 50 ms (measured ~5-15 ms in dev
// against the magsasaka test account).

import type { ODMatchDetail, ODMatchPlayer, ODPlayerProfile } from '../types'
import { classifyPosition, type Position } from './breakdownsProse/positionFromMatch'
import { findPlayerInMatch, isParsed } from './matchHelpers'
import { rankLabel } from './baselines'

const SCHEMA_VERSION = 1

// ----- Public types (mirror docs/breakdowns-user-comparison-v1-spec.md §D.2) -----

export type UserRoleLabel = 'core' | 'support' | 'flex'

export interface UserPositionStats {
  game_count: number
  obs_per_game: number | null
  five_slot_min: number | null
  /** Per-hero 5-slot timing — only populated for heroes the user has ≥3
   *  parsed games on at this position. Empty record when no hero
   *  qualifies. Phase B uses this for hero-matched 5-slot strips. */
  hero_5slot: Record<number, { games: number; median_min: number }>
  kda: number | null
  tf_pct: number | null
  lane_eff_pct: number | null
}

export interface BracketPositionStats {
  sample_count: number
  obs_per_game: number | null
  five_slot_min: number | null
  kda: number | null
  tf_pct: number | null
  lane_eff_pct: number | null
}

export interface UserCompareData {
  version: typeof SCHEMA_VERSION
  account_id: number
  rank_tier: number | null
  rank_label: string
  built_at: number
  user_role_label: UserRoleLabel
  user_top_position: Position
  match_window: {
    total_matches: number
    parsed_matches: number
  }
  user_per_position: Record<Position, UserPositionStats>
  bracket_per_position: Record<Position, BracketPositionStats>
}

// ----- Constants -----

/** Below this, the per-hero 5-slot bucket isn't meaningful. */
const HERO_5SLOT_MIN_GAMES = 3

/** Below this many lobby-mate observations per (position, stat), the
 *  bracket median is too noisy to expose. */
const BRACKET_MIN_SAMPLE = 5

/** Items excluded from the 5-slot timing count — same set used by
 *  src/lib/breakdownsProse/cat1b.ts so cross-side numbers agree. */
const CONSUMABLE_KEYS = new Set<string>([
  'tango', 'tango_single', 'branches', 'branches_2',
  'ward_observer', 'ward_sentry', 'ward_dispenser',
  'tpscroll', 'clarity', 'flask', 'enchanted_mango',
  'smoke_of_deceit', 'blood_grenade', 'faerie_fire',
  'dust', 'gem', 'bottle',
])

const ALL_POSITIONS: readonly Position[] = [1, 2, 3, 4, 5]

// ----- Helpers -----

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function obsCount(p: ODMatchPlayer): number {
  if (Array.isArray(p.obs_log)) return p.obs_log.length
  return typeof p.obs_placed === 'number' ? p.obs_placed : 0
}

function kdaValue(p: ODMatchPlayer): number {
  const d = Math.max(p.deaths ?? 0, 1)
  return ((p.kills ?? 0) + (p.assists ?? 0)) / d
}

/** Time (seconds) at which the player bought their 5th non-consumable
 *  item. Null when unparsed or never reached 5. Mirrors the helper in
 *  cat1b.ts so user-side and pro-side timings are computed identically. */
function fiveSlotSec(p: ODMatchPlayer): number | null {
  const log = p.purchase_log
  if (!Array.isArray(log) || log.length === 0) return null
  let majors = 0
  for (const entry of log) {
    if (CONSUMABLE_KEYS.has(entry.key)) continue
    if (typeof entry.time !== 'number') continue
    majors += 1
    if (majors === 5) return entry.time
  }
  return null
}

function emptyUserStats(): UserPositionStats {
  return {
    game_count: 0,
    obs_per_game: null,
    five_slot_min: null,
    hero_5slot: {},
    kda: null,
    tf_pct: null,
    lane_eff_pct: null,
  }
}

function emptyBracketStats(): BracketPositionStats {
  return {
    sample_count: 0,
    obs_per_game: null,
    five_slot_min: null,
    kda: null,
    tf_pct: null,
    lane_eff_pct: null,
  }
}

interface UserBucket {
  count: number
  obsPerGame: number[]
  fiveSlotMin: number[]
  kda: number[]
  tfPct: number[]
  laneEffPct: number[]
  perHeroFiveSlot: Map<number, number[]>
}

interface BracketBucket {
  obsPerGame: number[]
  fiveSlotMin: number[]
  kda: number[]
  tfPct: number[]
  laneEffPct: number[]
}

function makeUserBucket(): UserBucket {
  return {
    count: 0,
    obsPerGame: [],
    fiveSlotMin: [],
    kda: [],
    tfPct: [],
    laneEffPct: [],
    perHeroFiveSlot: new Map(),
  }
}

function makeBracketBucket(): BracketBucket {
  return {
    obsPerGame: [],
    fiveSlotMin: [],
    kda: [],
    tfPct: [],
    laneEffPct: [],
  }
}

function deriveRoleLabel(
  userBuckets: Record<Position, UserBucket>
): { label: UserRoleLabel; topPosition: Position } {
  let topPos: Position = 1
  let topCount = userBuckets[1].count
  let total = 0
  for (const pos of ALL_POSITIONS) {
    total += userBuckets[pos].count
    if (userBuckets[pos].count > topCount) {
      topCount = userBuckets[pos].count
      topPos = pos
    }
  }
  if (total === 0) return { label: 'flex', topPosition: 1 }
  const topShare = topCount / total
  if (topShare < 0.5) return { label: 'flex', topPosition: topPos }
  if (topPos === 4 || topPos === 5) return { label: 'support', topPosition: topPos }
  return { label: 'core', topPosition: topPos }
}

function summarizeUser(bucket: UserBucket): UserPositionStats {
  const out = emptyUserStats()
  out.game_count = bucket.count
  out.obs_per_game = median(bucket.obsPerGame)
  out.five_slot_min = median(bucket.fiveSlotMin)
  out.kda = median(bucket.kda)
  out.tf_pct = median(bucket.tfPct)
  out.lane_eff_pct = median(bucket.laneEffPct)
  for (const [heroId, timings] of bucket.perHeroFiveSlot.entries()) {
    if (timings.length < HERO_5SLOT_MIN_GAMES) continue
    const m = median(timings)
    if (m == null) continue
    out.hero_5slot[heroId] = { games: timings.length, median_min: m }
  }
  return out
}

function summarizeBracket(bucket: BracketBucket): BracketPositionStats {
  const out = emptyBracketStats()
  // sample_count is the max across populated stat buckets — different
  // stats have different parsed-only requirements, so a single
  // "sample_count" doesn't meaningfully represent every stat. Use the
  // obs bucket (always-populated for any lobby-mate) as the floor.
  out.sample_count = bucket.obsPerGame.length
  out.obs_per_game = bucket.obsPerGame.length >= BRACKET_MIN_SAMPLE
    ? median(bucket.obsPerGame) : null
  out.five_slot_min = bucket.fiveSlotMin.length >= BRACKET_MIN_SAMPLE
    ? median(bucket.fiveSlotMin) : null
  out.kda = bucket.kda.length >= BRACKET_MIN_SAMPLE
    ? median(bucket.kda) : null
  out.tf_pct = bucket.tfPct.length >= BRACKET_MIN_SAMPLE
    ? median(bucket.tfPct) : null
  out.lane_eff_pct = bucket.laneEffPct.length >= BRACKET_MIN_SAMPLE
    ? median(bucket.laneEffPct) : null
  return out
}

// ----- Public entry point -----

export interface BuildUserCompareInput {
  accountId: number
  profile: ODPlayerProfile | null
  details: Record<number, ODMatchDetail>
}

/**
 * Aggregate the user's match details into a per-position user stat
 * snapshot + per-position lobby-mate bracket median snapshot.
 *
 * Pure: no mutation of inputs, no I/O.
 *
 * Edge cases:
 *  - Missing user player in a detail (account_id mismatch / private):
 *    skip the match entirely. Don't attempt to bucket lobby-mates from
 *    that match either — without the user we can't reason about lane
 *    overlap.
 *  - Unparsed details: still contribute KDA + obs_count when populated.
 *    Skip 5-slot / TF / lane-eff buckets per stat null-check.
 */
export function buildUserCompareData(input: BuildUserCompareInput): UserCompareData {
  const { accountId, profile, details } = input

  const userBuckets: Record<Position, UserBucket> = {
    1: makeUserBucket(),
    2: makeUserBucket(),
    3: makeUserBucket(),
    4: makeUserBucket(),
    5: makeUserBucket(),
  }
  const bracketBuckets: Record<Position, BracketBucket> = {
    1: makeBracketBucket(),
    2: makeBracketBucket(),
    3: makeBracketBucket(),
    4: makeBracketBucket(),
    5: makeBracketBucket(),
  }

  let totalMatches = 0
  let parsedMatches = 0

  for (const detail of Object.values(details)) {
    if (!detail || !Array.isArray(detail.players)) continue
    const userPlayer = findPlayerInMatch(detail, accountId)
    if (!userPlayer) continue
    totalMatches += 1
    const parsed = isParsed(detail)
    if (parsed) parsedMatches += 1

    const userPosition = classifyPosition(userPlayer, detail)

    // Bucket the user's own match.
    {
      const bucket = userBuckets[userPosition]
      bucket.count += 1
      bucket.obsPerGame.push(obsCount(userPlayer))
      bucket.kda.push(kdaValue(userPlayer))
      const fs = fiveSlotSec(userPlayer)
      if (fs != null) {
        const fsMin = fs / 60
        bucket.fiveSlotMin.push(fsMin)
        const arr = bucket.perHeroFiveSlot.get(userPlayer.hero_id) ?? []
        arr.push(fsMin)
        bucket.perHeroFiveSlot.set(userPlayer.hero_id, arr)
      }
      if (typeof userPlayer.teamfight_participation === 'number') {
        bucket.tfPct.push(userPlayer.teamfight_participation * 100)
      }
      if (typeof userPlayer.lane_efficiency_pct === 'number') {
        bucket.laneEffPct.push(userPlayer.lane_efficiency_pct)
      }
    }

    // Bucket the 9 lobby-mates.
    for (const mate of detail.players) {
      if (mate === userPlayer) continue
      // Tolerate missing account_id on lobby-mates — the position
      // classifier doesn't need it.
      const matePosition = classifyPosition(mate, detail)
      const bucket = bracketBuckets[matePosition]
      bucket.obsPerGame.push(obsCount(mate))
      bucket.kda.push(kdaValue(mate))
      const fs = fiveSlotSec(mate)
      if (fs != null) bucket.fiveSlotMin.push(fs / 60)
      if (typeof mate.teamfight_participation === 'number') {
        bucket.tfPct.push(mate.teamfight_participation * 100)
      }
      if (typeof mate.lane_efficiency_pct === 'number') {
        bucket.laneEffPct.push(mate.lane_efficiency_pct)
      }
    }
  }

  const { label, topPosition } = deriveRoleLabel(userBuckets)
  const rankTier = profile?.rank_tier ?? null

  const user_per_position: Record<Position, UserPositionStats> = {
    1: summarizeUser(userBuckets[1]),
    2: summarizeUser(userBuckets[2]),
    3: summarizeUser(userBuckets[3]),
    4: summarizeUser(userBuckets[4]),
    5: summarizeUser(userBuckets[5]),
  }
  const bracket_per_position: Record<Position, BracketPositionStats> = {
    1: summarizeBracket(bracketBuckets[1]),
    2: summarizeBracket(bracketBuckets[2]),
    3: summarizeBracket(bracketBuckets[3]),
    4: summarizeBracket(bracketBuckets[4]),
    5: summarizeBracket(bracketBuckets[5]),
  }

  return {
    version: SCHEMA_VERSION,
    account_id: accountId,
    rank_tier: rankTier,
    rank_label: rankLabel(rankTier),
    built_at: Date.now(),
    user_role_label: label,
    user_top_position: topPosition,
    match_window: {
      total_matches: totalMatches,
      parsed_matches: parsedMatches,
    },
    user_per_position,
    bracket_per_position,
  }
}

// ----- Module-load self-test -----

/**
 * Build a synthetic 50-match set where:
 *   - The user is consistently pos 5 in 30 games and pos 4 in 20 games
 *     → role_label should resolve to 'support' (top pos = 5, 60% share)
 *   - Each match has 9 lobby-mates spanning positions 1-5
 *   - Stats vary enough that medians are stable
 *
 * Run buildUserCompareData against it; assert the result shape and the
 * deterministic medians. Console.error on drift.
 */
function runSelfTest(): void {
  try {
    const result = buildUserCompareData(buildSyntheticInput())

    const errors: string[] = []
    const eq = (label: string, actual: unknown, expected: unknown) => {
      if (actual !== expected) {
        errors.push(`${label}: expected ${expected}, got ${actual}`)
      }
    }
    const close = (label: string, actual: number | null, expected: number, tol = 0.001) => {
      if (actual == null || Math.abs(actual - expected) > tol) {
        errors.push(`${label}: expected ~${expected}, got ${actual}`)
      }
    }

    // Schema basics
    eq('version', result.version, SCHEMA_VERSION)
    eq('account_id', result.account_id, 12345)
    eq('match_window.total_matches', result.match_window.total_matches, 50)
    eq('user_role_label', result.user_role_label, 'support')
    eq('user_top_position', result.user_top_position, 5)

    // User pos 5 obs/game: synthetic gives 6 obs every game → median = 6
    close('user pos5 obs', result.user_per_position[5].obs_per_game, 6)
    // User pos 5 game count: 30
    eq('user pos5 game_count', result.user_per_position[5].game_count, 30)
    // User pos 4 game count: 20
    eq('user pos4 game_count', result.user_per_position[4].game_count, 20)
    // User pos 1 game count: 0 (never played)
    eq('user pos1 game_count', result.user_per_position[1].game_count, 0)
    // pos5 obs/game when user never played pos1 → null
    eq('user pos1 obs', result.user_per_position[1].obs_per_game, null)

    // Bracket pos 1 obs/game: synthetic lobby-mate pos1 always places
    // 1 obs → median = 1
    close('bracket pos1 obs', result.bracket_per_position[1].obs_per_game, 1)

    // Bracket pos 5 obs/game: synthetic lobby-mate pos5 places 8 obs
    close('bracket pos5 obs', result.bracket_per_position[5].obs_per_game, 8)

    // Bracket KDA pos 1: synthetic lobby-mate pos1 has K=8 D=2 A=4 → KDA = 6
    close('bracket pos1 kda', result.bracket_per_position[1].kda, 6)

    // Each match has 9 lobby-mates; over 50 matches that's 450 mates,
    // distributed across positions. Each position should have plenty
    // of samples.
    const totalSamples = ALL_POSITIONS.reduce(
      (s, p) => s + result.bracket_per_position[p].sample_count,
      0
    )
    eq('total bracket samples', totalSamples, 50 * 9)

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        '[userCompareData] self-test FAILED:\n  ' + errors.join('\n  ')
      )
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[userCompareData] self-test threw:', err)
  }
}

function buildSyntheticInput(): BuildUserCompareInput {
  const USER_ID = 12345
  const details: Record<number, ODMatchDetail> = {}

  // 30 games as pos 5, 20 games as pos 4 — 50 total.
  for (let i = 0; i < 50; i++) {
    const userIsPos5 = i < 30
    const matchId = 1000 + i
    details[matchId] = buildSyntheticMatch(matchId, USER_ID, userIsPos5)
  }

  return {
    accountId: USER_ID,
    profile: { rank_tier: 33 } as ODPlayerProfile, // Crusader 3
    details,
  }
}

function buildSyntheticMatch(
  matchId: number,
  userId: number,
  userIsPos5: boolean
): ODMatchDetail {
  // Lane assignments by position-intent:
  //   pos 1: lane=1 (safe), core hero (Sven id 18)
  //   pos 2: lane=2 (mid),  core hero (Tiny id 19)
  //   pos 3: lane=3 (off),  core hero (Tidehunter id 29)
  //   pos 4: lane=3 (off),  support hero (CM id 5)
  //   pos 5: lane=1 (safe), support hero (Lich id 31)

  function mk(
    slot: number,
    heroId: number,
    laneRole: number,
    overrides: Partial<ODMatchPlayer> = {}
  ): ODMatchPlayer {
    return {
      account_id: undefined,
      player_slot: slot,
      hero_id: heroId,
      kills: 5, deaths: 5, assists: 10,
      gold_per_min: 500, xp_per_min: 600,
      last_hits: 200, denies: 10,
      lane_role: laneRole, is_roaming: false,
      lane_efficiency_pct: 70,
      teamfight_participation: 0.6,
      stuns: 0,
      obs_log: [], sen_log: [],
      kills_log: [], purchase_log: [],
      buyback_count: 1,
      gold_t: [0, 1000, 3000, 6000, 10000, 14000, 17000, 19000, 21000, 22000],
      ...overrides,
    }
  }

  // Lobby-mate template with stable per-position stats so medians are
  // deterministic.
  // pos 1 lobby-mate: 1 obs/game, KDA=4, lane_eff=80
  // pos 2 lobby-mate: 2 obs/game, KDA=3, lane_eff=75
  // pos 3 lobby-mate: 3 obs/game, KDA=2.5, lane_eff=60
  // pos 4 lobby-mate: 5 obs/game, KDA=2, lane_eff=55
  // pos 5 lobby-mate: 8 obs/game, KDA=1.5, lane_eff=50

  const radiantPos1 = mk(0, 18, 1, {
    kills: 8, deaths: 2, assists: 4, last_hits: 350, gold_per_min: 800,
    lane_efficiency_pct: 80, teamfight_participation: 0.7,
    obs_log: [{ time: 60 }], // 1 obs
  })
  const radiantPos2 = mk(1, 19, 2, {
    kills: 9, deaths: 3, assists: 6, lane_efficiency_pct: 75,
    teamfight_participation: 0.65,
    obs_log: [{ time: 60 }, { time: 600 }], // 2 obs
  })
  const radiantPos3 = mk(2, 29, 3, {
    kills: 4, deaths: 4, assists: 6, lane_efficiency_pct: 60,
    teamfight_participation: 0.6,
    obs_log: [{ time: 60 }, { time: 400 }, { time: 900 }], // 3 obs
  })
  const radiantPos4 = mk(3, 5, 3, {
    kills: 3, deaths: 6, assists: 9, last_hits: 80,
    lane_efficiency_pct: 55, teamfight_participation: 0.55,
    obs_log: Array.from({ length: 5 }, (_, i) => ({ time: i * 200 })),
  })
  const radiantPos5 = mk(4, 31, 1, {
    kills: 2, deaths: 8, assists: 10, last_hits: 50,
    lane_efficiency_pct: 50, teamfight_participation: 0.5,
    obs_log: Array.from({ length: 8 }, (_, i) => ({ time: i * 200 })),
  })

  // Dire side mirrors radiant for stable medians; also where the user
  // sits.
  const direPos1 = mk(128, 18, 1, {
    kills: 8, deaths: 2, assists: 4, last_hits: 350, gold_per_min: 800,
    lane_efficiency_pct: 80, teamfight_participation: 0.7,
    obs_log: [{ time: 60 }],
  })
  const direPos2 = mk(129, 19, 2, {
    lane_efficiency_pct: 75, teamfight_participation: 0.65,
    obs_log: [{ time: 60 }, { time: 600 }],
  })
  const direPos3 = mk(130, 29, 3, {
    lane_efficiency_pct: 60, teamfight_participation: 0.6,
    obs_log: [{ time: 60 }, { time: 400 }, { time: 900 }],
  })
  // The user takes one of the support slots:
  const directorPos4OrUser = userIsPos5
    ? mk(131, 5, 3, {
        lane_efficiency_pct: 55, teamfight_participation: 0.55,
        obs_log: Array.from({ length: 5 }, (_, i) => ({ time: i * 200 })),
      })
    : mk(131, 5, 3, {
        account_id: userId,
        kills: 5, deaths: 5, assists: 12, last_hits: 90,
        lane_efficiency_pct: 60, teamfight_participation: 0.62,
        obs_log: Array.from({ length: 6 }, (_, i) => ({ time: i * 200 })),
      })
  const directorPos5OrUser = userIsPos5
    ? mk(132, 31, 1, {
        account_id: userId,
        kills: 3, deaths: 7, assists: 14, last_hits: 60,
        lane_efficiency_pct: 52, teamfight_participation: 0.58,
        obs_log: Array.from({ length: 6 }, (_, i) => ({ time: i * 200 })),
      })
    : mk(132, 31, 1, {
        lane_efficiency_pct: 50, teamfight_participation: 0.5,
        obs_log: Array.from({ length: 8 }, (_, i) => ({ time: i * 200 })),
      })

  return {
    match_id: matchId,
    duration: 36 * 60,
    start_time: 1700000000 + matchId * 1800,
    radiant_win: matchId % 2 === 0,
    game_mode: 22,
    lobby_type: 7,
    players: [
      radiantPos1, radiantPos2, radiantPos3, radiantPos4, radiantPos5,
      direPos1, direPos2, direPos3, directorPos4OrUser, directorPos5OrUser,
    ],
    version: 1,
  } as ODMatchDetail
}

// Run on module load — fail-loud against drift.
runSelfTest()

// Export internals only for tests / Phase B sanity-checks. Don't import
// these from production code.
export const __test__ = {
  buildSyntheticInput,
  median,
  fiveSlotSec,
  obsCount,
  kdaValue,
  deriveRoleLabel,
  HERO_5SLOT_MIN_GAMES,
  BRACKET_MIN_SAMPLE,
}
