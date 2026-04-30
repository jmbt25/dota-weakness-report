// Category 1B — within-match per-player observations.
//
// Per docs/watch-feature-v1-spec.md §2.3, these fire for every player in
// every match. They compare a player against the other 9 in the match
// (or absolute floors). NO corpus reads — Cat 1A handles cross-match
// comparison in Phase 5.
//
// Each template:
//  - threshold: when it fires (rare on purpose; over-firing = noise)
//  - facts: the {stat} placeholders the prose interpolates
//  - priority: how loud the line is (Phase 7 lead-line synthesis ranks
//    leads by this — higher = more candidate for the top of the page)
//
// All output passes validateWatchProse before returning. Drift detection:
// a self-test at module load runs each template against a synthetic
// match and asserts validation passes. Console.error if any fails.
//
// ─── v1.1 hook-point: user-comparison layer ───
// The /watch feature ships v1 as pure observation prose (third-person,
// no viewer state). v1.1 may add an opt-in "Show my comparison" toggle
// that injects personal lines next to each Cat 1B fire ("Pos 4 placed
// 6 obs. You average 4."). Design intent (decided 2026-04-30, NOT
// being built):
//   - Toggle is off by default; persists in sessionStorage; query
//     param ?compare=me makes URLs bookmarkable.
//   - The personal layer ADDS lines to existing per-player cards; it
//     does NOT replace the Cat 1B observation lines.
//   - Each Cat 1B template would gain a parallel `compareToUser()`
//     method that returns an additional ProseFire when a user vector
//     is in scope. Same banned-token validator gate.
//   - Don't pre-build the parallel method now — design it once we
//     know which templates land + see post-launch user behavior.

import type { ODMatchDetail, ODMatchPlayer } from '../../types'
import { validateWatchProse } from './bannedTokens'
import {
  classifyPosition,
  isCorePosition,
  isSupportPosition,
  positionLabel,
  type Position,
} from './positionFromMatch'

// ----- Public types -----

export interface PlayerContext {
  player: ODMatchPlayer
  position: Position
  /** Hero localized name, already resolved by the caller. */
  heroName: string
  isRadiant: boolean
}

export interface MatchContext {
  detail: ODMatchDetail
  /** All 10 players, in the SAME order as detail.players. */
  players: PlayerContext[]
  durationMin: number
  /** Hero ID → localized name resolver. Cat 2 templates that name heroes
   *  by raw ID (picks_bans, building_kill.unit) use this rather than
   *  importing `getHeroName` directly — that singleton isn't populated
   *  outside the browser bootstrap, so Cat 2 prose would render
   *  "Hero 21" instead of "Windranger" in Node-side dumps. */
  heroName: (id: number) => string
}

export interface ProseFire {
  templateId: string
  text: string
  /** Used by Phase 7 lead-line synthesis. Higher = louder. */
  priority: number
  /** The raw stats the line interpolates — debug + Phase 7 reuse. */
  facts: Record<string, string | number>
  /** Per-player fires (Cat 1A, Cat 1B) carry the source player_slot.
   *  Cat 2 match-level fires leave this undefined. The lead-line
   *  selector dedups by this field — at most one fire per player in
   *  the picks — but exempts team-level Cat 2 fires from the rule. */
  sourcePlayerSlot?: number
}

// ----- Helpers -----

function median(values: number[]): number {
  if (values.length === 0) return 0
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

function kda(p: ODMatchPlayer): number {
  const d = Math.max(p.deaths ?? 0, 1)
  return ((p.kills ?? 0) + (p.assists ?? 0)) / d
}

function teamPlayers(player: PlayerContext, ctx: MatchContext): PlayerContext[] {
  return ctx.players.filter((p) => p.isRadiant === player.isRadiant)
}

function fmtMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Approximate "5-slot timing" — the time at which the player has bought
 * 5 non-consumable items. Uses purchase_log so the small consumable
 * exclusion list is sufficient. Returns null when purchase_log is
 * unparsed or the player never reached 5.
 */
const CONSUMABLE_KEYS = new Set<string>([
  'tango', 'tango_single', 'branches', 'branches_2',
  'ward_observer', 'ward_sentry', 'ward_dispenser',
  'tpscroll', 'clarity', 'flask', 'enchanted_mango',
  'smoke_of_deceit', 'blood_grenade', 'faerie_fire',
  'dust', 'gem', 'bottle',
])

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

function peakNetWorth(p: ODMatchPlayer): number {
  const gt = p.gold_t
  if (!Array.isArray(gt) || gt.length === 0) return p.net_worth ?? 0
  let max = 0
  for (const v of gt) if (typeof v === 'number' && v > max) max = v
  return max
}

/**
 * Find the longest run of {N} deaths within a {windowSec} window in
 * the player's death log. Returns the start/end seconds + count, or
 * null if no such window exists.
 */
function densestDeathWindow(
  p: ODMatchPlayer,
  threshold: number,
  windowSec: number
): { count: number; startSec: number; endSec: number } | null {
  const log = p.kills_log
  if (!Array.isArray(log) || log.length < threshold) return null
  const times = log
    .map((e) => e.time)
    .filter((t): t is number => typeof t === 'number')
    .sort((a, b) => a - b)
  let bestCount = 0
  let bestStart = 0
  let bestEnd = 0
  for (let i = 0; i < times.length; i++) {
    let j = i
    while (j < times.length && times[j] - times[i] <= windowSec) j++
    const count = j - i
    if (count > bestCount) {
      bestCount = count
      bestStart = times[i]
      bestEnd = times[j - 1]
    }
  }
  if (bestCount < threshold) return null
  return { count: bestCount, startSec: bestStart, endSec: bestEnd }
}

// ----- Templates -----

export interface Cat1BTemplate {
  id: string
  priority: number
  produce: (
    player: PlayerContext,
    ctx: MatchContext
  ) => { text: string; facts: Record<string, string | number> } | null
}

/** 1. Vision output — pos 4/5 dramatically below match-wide support median. */
const visionOutputLow: Cat1BTemplate = {
  id: 'vision_output_low',
  priority: 6,
  produce: (player, ctx) => {
    if (!isSupportPosition(player.position)) return null
    if (ctx.durationMin < 25) return null

    const supports = ctx.players.filter((p) => isSupportPosition(p.position))
    if (supports.length < 2) return null

    const supportObsCounts = supports.map((p) => obsCount(p.player))
    const teamMedian = median(supportObsCounts)
    const myObs = obsCount(player.player)

    if (myObs >= teamMedian - 4) return null
    if (myObs > 3 && myObs >= teamMedian / 2) return null

    return {
      text: `${positionLabel(player.position)} (${player.heroName}) placed ${myObs} obs across ${Math.round(ctx.durationMin)} minutes. Median pos 4/5 in this match: ${teamMedian.toFixed(1)}.`,
      facts: {
        position: player.position,
        hero: player.heroName,
        obs_placed: myObs,
        duration_min: Math.round(ctx.durationMin),
        match_support_median_obs: teamMedian.toFixed(1),
      },
    }
  },
}

/** 2. 5-slot timing — core whose timing differs from match-core median by ≥ 4 min. */
const fiveSlotTimingOutlier: Cat1BTemplate = {
  id: 'five_slot_timing_outlier',
  priority: 7,
  produce: (player, ctx) => {
    if (!isCorePosition(player.position)) return null
    const mySec = fiveSlotSec(player.player)
    if (mySec == null) return null

    const cores = ctx.players.filter((p) => isCorePosition(p.position))
    const otherSecs = cores
      .filter((p) => p !== player)
      .map((p) => fiveSlotSec(p.player))
      .filter((s): s is number => s != null)
    if (otherSecs.length === 0) return null

    const matchMedian = median(otherSecs)
    const deltaSec = mySec - matchMedian
    const deltaMin = deltaSec / 60
    if (Math.abs(deltaMin) < 4) return null

    const direction = deltaMin > 0 ? 'after' : 'before'
    return {
      text: `${positionLabel(player.position)} (${player.heroName})'s 5-slot timing landed at ${fmtMmSs(mySec)} — ${Math.abs(Math.round(deltaMin))} min ${direction} the match-core median.`,
      facts: {
        position: player.position,
        hero: player.heroName,
        five_slot_time: fmtMmSs(mySec),
        match_core_median_time: fmtMmSs(matchMedian),
        delta_min: Math.round(deltaMin),
      },
    }
  },
}

/** 3. KDA extreme — highest or lowest in the match by ≥ 1.5× factor. */
const kdaExtreme: Cat1BTemplate = {
  id: 'kda_extreme',
  priority: 6,
  produce: (player, ctx) => {
    if (ctx.durationMin < 20) return null
    const all = ctx.players.map((p) => ({ ctx: p, k: kda(p.player) }))
    const myKda = kda(player.player)
    const sorted = [...all].sort((a, b) => b.k - a.k)
    const top = sorted[0]
    const second = sorted[1]
    const bottom = sorted[sorted.length - 1]
    const secondLast = sorted[sorted.length - 2]

    if (top.ctx === player && top.k >= second.k * 1.5 && top.k >= 5) {
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) finished ${player.player.kills}/${player.player.deaths}/${player.player.assists}, KDA ${myKda.toFixed(1)} — highest in the match.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          kills: player.player.kills,
          deaths: player.player.deaths,
          assists: player.player.assists,
          kda: myKda.toFixed(1),
          rank: 'highest',
        },
      }
    }
    if (
      bottom.ctx === player &&
      bottom.k <= secondLast.k * 0.5 &&
      bottom.k <= 1.5
    ) {
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) finished ${player.player.kills}/${player.player.deaths}/${player.player.assists}, KDA ${myKda.toFixed(1)} — lowest in the match.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          kills: player.player.kills,
          deaths: player.player.deaths,
          assists: player.player.assists,
          kda: myKda.toFixed(1),
          rank: 'lowest',
        },
      }
    }
    return null
  },
}

/** 4. Teamfight participation — top or bottom on their team. */
const teamfightParticipationRank: Cat1BTemplate = {
  id: 'teamfight_participation_rank',
  priority: 5,
  produce: (player, ctx) => {
    const part = player.player.teamfight_participation
    if (typeof part !== 'number') return null
    const team = teamPlayers(player, ctx)
    const sorted = [...team].sort(
      (a, b) =>
        (b.player.teamfight_participation ?? 0) -
        (a.player.teamfight_participation ?? 0)
    )
    const pct = Math.round(part * 100)

    if (sorted[0] === player && part >= 0.7 && sorted[1]) {
      const gap =
        part - (sorted[1].player.teamfight_participation ?? 0)
      if (gap < 0.05) return null
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) had ${pct}% teamfight participation, highest on the team.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          teamfight_pct: pct,
          rank: 'highest',
        },
      }
    }
    if (sorted[sorted.length - 1] === player && part <= 0.4 && sorted.length > 1) {
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) had ${pct}% teamfight participation, lowest on the team.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          teamfight_pct: pct,
          rank: 'lowest',
        },
      }
    }
    return null
  },
}

/** 5. Dead-time block — 3+ deaths inside a 4-minute window.
 *
 * Multi-unit heroes are EXCLUDED because their kills_log can record a
 * single mechanical "death event" as multiple entries. Phase 4 dump on
 * Nigma vs 1w showed Meepo dying 3 times in 14 seconds — that's all
 * his clones dying together in one teamfight, not three separate
 * pickoffs. The exclusion is preferred over a "minimum window span"
 * rule because legitimate triple-pickoffs on supports can land inside
 * 60 seconds and we want those to surface. */
const MULTI_UNIT_HERO_IDS = new Set<number>([
  78,  // Brewmaster — Primal Split spawns 3 spirit units
  80,  // Lone Druid — Spirit Bear is a separate unit with its own deaths
  82,  // Meepo — clones share death events
  92,  // Visage — familiars are summoned units
  113, // Arc Warden — Tempest Double dies as a separate event
])

const deadTimeBlock: Cat1BTemplate = {
  id: 'dead_time_block',
  priority: 5,
  produce: (player) => {
    if (MULTI_UNIT_HERO_IDS.has(player.player.hero_id)) return null
    const window = densestDeathWindow(player.player, 3, 240)
    if (!window) return null
    return {
      text: `${positionLabel(player.position)} (${player.heroName}) died ${window.count} times between ${fmtMmSs(window.startSec)} and ${fmtMmSs(window.endSec)}.`,
      facts: {
        position: player.position,
        hero: player.heroName,
        deaths_in_window: window.count,
        window_start: fmtMmSs(window.startSec),
        window_end: fmtMmSs(window.endSec),
      },
    }
  },
}

/** 6. Buyback pattern — 0 buybacks in a long game by a core, but only
 *     when buyback was actually relevant. Two qualifying paths:
 *       (a) Player on the LOSING team — buyback might have flipped the game.
 *       (b) Peak net worth never crossed COULDNT_AFFORD_FLOOR (5000 gold)
 *           — they couldn't have afforded one even if they wanted to.
 *
 *     Without these gates the template fired for nearly every winning
 *     core in long games (5/6 cores in the Phase 4 dump on Nigma vs 1w
 *     Team), which reads as criticism of normal late-game discipline.
 *     The Phase 4 review spec sketched a duration-scaled threshold
 *     (200 + duration_min × 9) × 1000 — read literally that's ~524k
 *     gold, always above peak NW, so the OR collapses to "always fire."
 *     5000 is a fixed "structurally couldn't afford" floor that's
 *     robust across game length: real end-game buyback cost is roughly
 *     200 + (NW × 0.05) + (level × 1.5) which lands in the 1000-2000
 *     range for level-25 cores at 20k NW; never reaching 5000 means the
 *     player never had practical access to a buyback decision. */
const COULDNT_AFFORD_BUYBACK_FLOOR = 5000
const buybackPatternZero: Cat1BTemplate = {
  id: 'buyback_pattern_zero',
  priority: 4,
  produce: (player, ctx) => {
    if (!isCorePosition(player.position)) return null
    if (ctx.durationMin < 35) return null
    const count = player.player.buyback_count
    if (typeof count !== 'number' || count !== 0) return null
    const peak = peakNetWorth(player.player)
    if (peak === 0) return null

    const slot = player.player.player_slot ?? 0
    const isRadiant = slot < 128
    const isLosingTeam = isRadiant !== ctx.detail.radiant_win
    const couldntAfford = peak < COULDNT_AFFORD_BUYBACK_FLOOR
    if (!isLosingTeam && !couldntAfford) return null

    return {
      text: `${positionLabel(player.position)} (${player.heroName}) had 0 buybacks across the ${Math.round(ctx.durationMin)}-min game. Peak net worth: ${peak.toLocaleString()}.`,
      facts: {
        position: player.position,
        hero: player.heroName,
        duration_min: Math.round(ctx.durationMin),
        peak_net_worth: peak,
        losing_team: String(isLosingTeam),
      },
    }
  },
}

/** 7. Lane efficiency — best or worst among cores in the match. */
const laneEfficiencyExtreme: Cat1BTemplate = {
  id: 'lane_efficiency_extreme',
  priority: 6,
  produce: (player, ctx) => {
    // Per CLAUDE.md, supports' lane_efficiency_pct is structurally low
    // (carry/offlaner aggregate is what counts for support lanes). Only
    // compare cores against cores here.
    if (!isCorePosition(player.position)) return null
    const mine = player.player.lane_efficiency_pct
    if (typeof mine !== 'number') return null

    const cores = ctx.players.filter(
      (p) =>
        isCorePosition(p.position) &&
        typeof p.player.lane_efficiency_pct === 'number'
    )
    if (cores.length < 4) return null

    const sorted = [...cores].sort(
      (a, b) =>
        (b.player.lane_efficiency_pct ?? 0) -
        (a.player.lane_efficiency_pct ?? 0)
    )
    const top = sorted[0]
    const bottom = sorted[sorted.length - 1]

    if (top === player && sorted[1]) {
      const gap = mine - (sorted[1].player.lane_efficiency_pct ?? 0)
      if (gap < 15) return null
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) won lane phase at ${mine}% efficiency, highest among the ${sorted.length} cores.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          lane_eff_pct: mine,
          core_count: sorted.length,
          rank: 'highest',
        },
      }
    }
    if (bottom === player && sorted[sorted.length - 2]) {
      const gap = (sorted[sorted.length - 2].player.lane_efficiency_pct ?? 0) - mine
      if (gap < 15) return null
      return {
        text: `${positionLabel(player.position)} (${player.heroName}) finished lane phase at ${mine}% efficiency, lowest among the ${sorted.length} cores.`,
        facts: {
          position: player.position,
          hero: player.heroName,
          lane_eff_pct: mine,
          core_count: sorted.length,
          rank: 'lowest',
        },
      }
    }
    return null
  },
}

/** 8. Stun duration — top stuns/min over the rest of the field combined. */
const stunDurationHigh: Cat1BTemplate = {
  id: 'stun_duration_high',
  priority: 5,
  produce: (player, ctx) => {
    const myStuns = player.player.stuns
    if (typeof myStuns !== 'number' || myStuns <= 0) return null
    const myPerMin = myStuns / Math.max(ctx.durationMin, 1)

    const others = ctx.players.filter((p) => p !== player)
    const othersTotal = others.reduce(
      (s, p) => s + (typeof p.player.stuns === 'number' ? p.player.stuns : 0),
      0
    )
    const othersPerMin = othersTotal / Math.max(ctx.durationMin, 1)

    if (myPerMin <= othersPerMin) return null
    if (myPerMin < 1.0) return null

    return {
      text: `${positionLabel(player.position)} (${player.heroName}) finished with ${myPerMin.toFixed(1)} stuns/min — more than the other 9 players combined (${othersPerMin.toFixed(1)}/min).`,
      facts: {
        position: player.position,
        hero: player.heroName,
        stuns_per_min: myPerMin.toFixed(1),
        others_per_min_combined: othersPerMin.toFixed(1),
      },
    }
  },
}

/** 9. Hero damage share — > 35% of team's hero damage. */
const heroDamageShare: Cat1BTemplate = {
  id: 'hero_damage_share',
  priority: 5,
  produce: (player, ctx) => {
    const mine = player.player.hero_damage
    if (typeof mine !== 'number' || mine <= 0) return null

    const team = teamPlayers(player, ctx)
    const teamTotal = team.reduce(
      (s, p) => s + (typeof p.player.hero_damage === 'number' ? p.player.hero_damage : 0),
      0
    )
    if (teamTotal === 0) return null
    const share = mine / teamTotal
    if (share < 0.35) return null
    const pct = Math.round(share * 100)
    return {
      text: `${positionLabel(player.position)} (${player.heroName}) contributed ${pct}% of the team's hero damage.`,
      facts: {
        position: player.position,
        hero: player.heroName,
        damage_share_pct: pct,
        team_hero_damage: teamTotal,
      },
    }
  },
}

export const CAT_1B_TEMPLATES: Cat1BTemplate[] = [
  visionOutputLow,
  fiveSlotTimingOutlier,
  kdaExtreme,
  teamfightParticipationRank,
  deadTimeBlock,
  buybackPatternZero,
  laneEfficiencyExtreme,
  stunDurationHigh,
  heroDamageShare,
]

// ----- Runner -----

/**
 * Build a MatchContext from raw OpenDota data + a hero-name resolver.
 * Caller (WatchPlayerGrid) typically constructs this once per match.
 */
export function buildMatchContext(
  detail: ODMatchDetail,
  heroName: (id: number) => string
): MatchContext {
  const players: PlayerContext[] = (detail.players ?? []).map((p) => ({
    player: p,
    position: classifyPosition(p, detail),
    heroName: heroName(p.hero_id),
    isRadiant: (p.player_slot ?? 0) < 128,
  }))
  return {
    detail,
    players,
    durationMin: detail.duration / 60,
    heroName,
  }
}

/**
 * Run all Cat 1B templates against every player in the match. Returns
 * a Map keyed by `player_slot` (stable per match) → fired prose lines.
 *
 * Ordering: each template either fires or doesn't; for a given player
 * we list fires in template-array order. Phase 7 lead-line synthesis
 * will re-rank by priority across players + categories.
 */
export function runCat1B(ctx: MatchContext): Map<number, ProseFire[]> {
  const out = new Map<number, ProseFire[]>()
  for (const player of ctx.players) {
    const fires: ProseFire[] = []
    for (const tpl of CAT_1B_TEMPLATES) {
      let result: { text: string; facts: Record<string, string | number> } | null
      try {
        result = tpl.produce(player, ctx)
      } catch {
        result = null
      }
      if (!result) continue
      if (!validateWatchProse(result.text)) {
        // Drop silently. Don't poison the player's card with an invalid
        // line; the module-load self-test should have caught this.
        // eslint-disable-next-line no-console
        console.warn('[watch-prose] Cat 1B template rejected by validator:', tpl.id, result.text)
        continue
      }
      fires.push({
        templateId: tpl.id,
        text: result.text,
        priority: tpl.priority,
        facts: result.facts,
        sourcePlayerSlot: player.player.player_slot,
      })
    }
    out.set(player.player.player_slot, fires)
  }
  return out
}

// ----- Module-load self-test -----

/**
 * Synthesize a 10-player match where every Cat 1B template should fire
 * for at least one player. Run each template through the runner and
 * assert validation passes. Surfaces drift the moment a template gains
 * a banned word.
 */
function selfTest(): void {
  const synthetic = buildSyntheticMatch()
  const fires = runCat1B(synthetic)
  // Don't assert that ALL templates fire — synthetic data is best-effort.
  // Just confirm no validator rejections leaked through.
  let total = 0
  for (const list of fires.values()) total += list.length
  if (total === 0) {
    // eslint-disable-next-line no-console
    console.warn('[watch-prose] Cat 1B self-test produced 0 fires — synthetic data may be too tame.')
  }
  // Re-run the validator explicitly on each template's first non-null
  // synthetic produce to be sure.
  for (const tpl of CAT_1B_TEMPLATES) {
    for (const player of synthetic.players) {
      let r: { text: string; facts: Record<string, string | number> } | null = null
      try {
        r = tpl.produce(player, synthetic)
      } catch {
        r = null
      }
      if (r && !validateWatchProse(r.text)) {
        // eslint-disable-next-line no-console
        console.error(
          `[watch-prose] FAIL: template ${tpl.id} produced banned text: "${r.text}"`
        )
      }
    }
  }
}

function buildSyntheticMatch(): MatchContext {
  // Five Radiant + five Dire, varying enough to trigger every threshold.
  const detail = {
    match_id: 999,
    duration: 38 * 60,
    start_time: 1700000000,
    radiant_win: true,
    game_mode: 22,
    lobby_type: 0,
    players: [],
  } as unknown as ODMatchDetail

  function mkPlayer(
    slot: number,
    heroId: number,
    laneRole: number,
    overrides: Partial<ODMatchPlayer> = {}
  ): ODMatchPlayer {
    const base: ODMatchPlayer = {
      player_slot: slot,
      hero_id: heroId,
      kills: 5,
      deaths: 5,
      assists: 10,
      gold_per_min: 500,
      xp_per_min: 600,
      last_hits: 200,
      denies: 10,
      lane_role: laneRole,
      is_roaming: false,
      lane_efficiency_pct: 70,
      teamfight_participation: 0.6,
      stuns: 0,
      obs_log: [],
      sen_log: [],
      kills_log: [],
      purchase_log: [],
      buyback_count: 1,
      gold_t: [0, 1000, 3000, 6000, 10000, 14000, 17000, 19000, 21000, 22000, 22500],
      ...overrides,
    }
    return base
  }

  // pos1 carry (Sven id 18) — high KDA, high hero damage, peak net worth
  const radiant1 = mkPlayer(0, 18, 1, {
    kills: 18, deaths: 3, assists: 7,
    last_hits: 350, gold_per_min: 800, lane_efficiency_pct: 92,
    teamfight_participation: 0.85, stuns: 0,
    hero_damage: 35000,
    buyback_count: 0,
    purchase_log: [
      { time: 60, key: 'boots' },
      { time: 600, key: 'power_treads' },
      { time: 1200, key: 'mask_of_madness' },
      { time: 1800, key: 'echo_sabre' },
      { time: 2400, key: 'black_king_bar' },
    ],
  })
  // pos2 mid (Tiny id 19) — high stuns
  const radiant2 = mkPlayer(1, 19, 2, {
    kills: 8, deaths: 6, assists: 10,
    stuns: 80,
    purchase_log: [
      { time: 60, key: 'boots' },
      { time: 700, key: 'arcane_boots' },
      { time: 1300, key: 'blink' },
      { time: 1900, key: 'aghanims_scepter' },
      { time: 2700, key: 'black_king_bar' },
    ],
  })
  // pos3 offlane (Tidehunter id 29) — lots of deaths in a window
  const radiant3 = mkPlayer(2, 29, 3, {
    kills: 4, deaths: 9, assists: 12,
    lane_efficiency_pct: 58,
    kills_log: [
      { time: 1100 },
      { time: 1180 },
      { time: 1300 },
      { time: 1900 },
    ],
  })
  // pos4 (Pudge id 14, flex but treated as 4 here)
  const radiant4 = mkPlayer(3, 14, 3, {
    is_roaming: true,
    obs_log: [{ time: 100 }, { time: 800 }, { time: 1600 }],
    sen_log: [{ time: 200 }, { time: 1000 }],
  })
  // pos5 (CM id 5) — placed only 1 obs
  const radiant5 = mkPlayer(4, 5, 1, {
    is_roaming: false,
    obs_log: [{ time: 60 }],
    sen_log: [{ time: 120 }],
    teamfight_participation: 0.32,
  })

  // Dire — generic average match
  const dire1 = mkPlayer(128, 8, 1, {
    last_hits: 280, gold_per_min: 600, lane_efficiency_pct: 75,
    purchase_log: [
      { time: 60, key: 'boots' },
      { time: 800, key: 'power_treads' },
      { time: 1500, key: 'maelstrom' },
      { time: 2200, key: 'mjollnir' },
      { time: 2900, key: 'butterfly' },
    ],
  })
  const dire2 = mkPlayer(129, 11, 2, {
    purchase_log: [
      { time: 60, key: 'boots' },
      { time: 900, key: 'arcane_boots' },
      { time: 1500, key: 'shadow_blade' },
      { time: 2100, key: 'silver_edge' },
      { time: 2700, key: 'black_king_bar' },
    ],
  })
  const dire3 = mkPlayer(130, 99, 3, {
    purchase_log: [
      { time: 60, key: 'boots' },
      { time: 850, key: 'tranquil_boots' },
      { time: 1400, key: 'crimson_guard' },
      { time: 2000, key: 'pipe' },
      { time: 2600, key: 'shivas_guard' },
    ],
  })
  const dire4 = mkPlayer(131, 75, 1, {
    obs_log: [{ time: 100 }, { time: 800 }, { time: 1600 }, { time: 2200 }],
    sen_log: [{ time: 200 }, { time: 1000 }],
  })
  const dire5 = mkPlayer(132, 26, 1, {
    obs_log: Array.from({ length: 12 }, (_, i) => ({ time: i * 200 })),
    sen_log: Array.from({ length: 8 }, (_, i) => ({ time: i * 250 })),
    teamfight_participation: 0.78,
  })

  ;(detail.players as ODMatchPlayer[]) = [
    radiant1, radiant2, radiant3, radiant4, radiant5,
    dire1, dire2, dire3, dire4, dire5,
  ]

  return buildMatchContext(detail, (id) => `Hero${id}`)
}

selfTest()
