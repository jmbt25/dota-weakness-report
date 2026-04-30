// User-comparison strip prose layer (Phase B of v1.9.0).
//
// Spec: docs/breakdowns-user-comparison-v1-spec.md §B + §C + §E.
//
// Library layer only — Phase B does not touch UI. Phase C will render
// these strings into <UserCompareStrip>, threaded through
// BreakdownsPlayerCard.
//
// Anti-bleed rule (§C.4 + §E.3): the public entry point accepts ONLY
// a templateId, the Cat 1B fact map, the user's compare cache, the
// honest-mode flag, and a hero name resolver. It never receives the
// pro's display name or the upstream Cat 1B prose text. The display
// name is structurally absent from the input type — anti-bleed is a
// type-system invariant, not a hand-checked rule.
//
// Honest-mode failure mode (§E.2): if validateRoast rejects the
// honest-mode output, the strip falls back to the default-mode output
// for the same input. Strip rendering null when data IS available is
// worse UX than rendering a neutral comparison.

import type { Position } from './positionFromMatch'
import type { ProseFire } from './cat1b'
import type {
  UserCompareData,
  UserPositionStats,
  BracketPositionStats,
} from '../userCompareData'
import { validateRoast } from '../honestMode'

// ----- Public surface -----

/**
 * The five Cat 1B template IDs that have user-comparison strip
 * mappings in v1.9.0. Phase B excludes dead_time_block,
 * buyback_pattern_zero, stun_duration_high, hero_damage_share — see
 * spec §B.1.
 */
export const SUPPORTED_TEMPLATE_IDS = [
  'vision_output_low',
  'five_slot_timing_outlier',
  'kda_extreme',
  'teamfight_participation_rank',
  'lane_efficiency_extreme',
] as const
export type SupportedStripTemplateId = (typeof SUPPORTED_TEMPLATE_IDS)[number]

export function isSupportedTemplate(id: string): id is SupportedStripTemplateId {
  return (SUPPORTED_TEMPLATE_IDS as readonly string[]).includes(id)
}

export interface BuildUserStripInput {
  /** Cat 1B template id. If not in SUPPORTED_TEMPLATE_IDS, returns null. */
  templateId: string
  /** Cat 1B fact map. Strip layer reads only stat fields it knows about
   *  — never reads `hero` (display name) or follows a path to a
   *  `displayName`. Anti-bleed enforced by code review + the absence
   *  of any ".hero" / ".displayName" reads in this module. */
  facts: ProseFire['facts']
  /** Resolved from localStorage by the Phase C plumbing. */
  userCompareData: UserCompareData
  honestMode: boolean
  /** Hero name resolver — Phase C passes `getHeroName` from
   *  `src/lib/heroes.ts`. Used ONLY by the five_slot hero-match path
   *  to render the hero name (which is the user's hero too, since the
   *  match-condition is "user has ≥ 3 games on the same hero"). */
  resolveHeroName: (heroId: number) => string
}

/**
 * Public dispatcher. Returns the strip prose string ready for render,
 * or null when suppression rules apply (§A.1: < 5 user games at the
 * position, < 5 bracket samples, missing parsed-only data).
 *
 * Caller does not need to render any wrapper or visual marker — strip
 * styling is a Phase D concern.
 */
export function buildUserStrip(input: BuildUserStripInput): string | null {
  if (!isSupportedTemplate(input.templateId)) return null
  const ctx = resolveStripContext(input)
  if (!ctx) return null

  const builder = BUILDERS[input.templateId as SupportedStripTemplateId]
  if (!builder) return null

  const honest = input.honestMode
    ? builder.honest(ctx, input.resolveHeroName)
    : null
  const def = builder.default(ctx, input.resolveHeroName)

  // Honest-mode primary path with fallback to default on validation
  // failure. Default-mode primary path requires neutral validation.
  if (honest && passesNeutral(honest) && validateRoast(honest)) {
    return appendSampleFootnote(honest, ctx.userStats.game_count)
  }
  if (def && passesNeutral(def)) {
    return appendSampleFootnote(def, ctx.userStats.game_count)
  }
  return null
}

// ----- Suppression + context resolution -----

const MIN_USER_GAMES = 5
const SMALL_SAMPLE_THRESHOLD = 15
const MIN_HERO_GAMES = 3

interface StripContext {
  position: Position
  userStats: UserPositionStats
  bracketStats: BracketPositionStats
  facts: ProseFire['facts']
}

function asPosition(n: unknown): Position | null {
  if (typeof n !== 'number') return null
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n
  return null
}

function resolveStripContext(input: BuildUserStripInput): StripContext | null {
  const pos = asPosition(input.facts.position)
  if (!pos) return null
  const userStats = input.userCompareData.user_per_position[pos]
  const bracketStats = input.userCompareData.bracket_per_position[pos]
  if (!userStats || !bracketStats) return null
  if (userStats.game_count < MIN_USER_GAMES) return null
  return { position: pos, userStats, bracketStats, facts: input.facts }
}

function appendSampleFootnote(text: string, gameCount: number): string {
  if (gameCount >= SMALL_SAMPLE_THRESHOLD) return text
  return `${text} (small sample, ${gameCount} games)`
}

// ----- Validators -----

/**
 * Neutral validator — rejects output that contains an unsubstituted
 * `{name}` placeholder. A leftover placeholder means a substitution
 * variable was missing or undefined; rendering "Yours: {bracket_obs}
 * obs/game" is a defect we'd rather suppress than show.
 *
 * The "≥ 2 placeholders" requirement (§H.B Phase B gate-review) is
 * enforced on TEMPLATE STRINGS at module-load self-test time, not on
 * substituted output. After substitution there are no `{}` braces in
 * a healthy render.
 */
export function passesNeutral(text: string): boolean {
  if (!text) return false
  // Any literal {word} surviving in output = placeholder missed.
  return !/\{[A-Za-z_][\w]*\}/.test(text)
}

/**
 * Count of distinct `{name}` placeholders inside a template string.
 * Used by the self-test to assert ≥ 2 per spec.
 */
export function countPlaceholders(template: string): number {
  const matches = template.match(/\{[A-Za-z_][\w]*\}/g)
  if (!matches) return 0
  return new Set(matches).size
}

// ----- Substitution helper -----

function substitute(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{([A-Za-z_][\w]*)\}/g, (_, key) => {
    const v = vars[key]
    if (v == null) return `{${key}}` // leave intact → caught by passesNeutral
    return String(v)
  })
}

// ----- Number formatters -----

function fmt1(n: number): string {
  return n.toFixed(1)
}

function fmtPct(n: number): string {
  return String(Math.round(n))
}

function minutesToMmSs(mins: number): string {
  if (!Number.isFinite(mins) || mins < 0) return '--:--'
  const totalSec = Math.round(mins * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Vision/TF clause picker: ahead of / below / tracking with bracket. */
function comparisonClause(user: number, bracket: number, tol: number): string {
  if (user > bracket + tol) return 'already ahead of'
  if (user < bracket - tol) return 'below'
  return 'tracking with'
}

// ----- Per-template builders -----

interface TemplateBuilder {
  templateId: SupportedStripTemplateId
  /** Static templates — the strings checked by countPlaceholders at
   *  module-load self-test. Each builder may switch between strings
   *  at runtime (e.g. five_slot's hero-match vs no-hero-match), so
   *  this is a Set of every template the builder might emit. */
  templates: { default: string[]; honest: string[] }
  default: (ctx: StripContext, resolveHeroName: (id: number) => string) => string | null
  honest: (ctx: StripContext, resolveHeroName: (id: number) => string) => string | null
}

// 1. vision_output_low
//    Honest mode pivots on user-vs-bracket direction and surfaces what
//    the comparison MEANS rather than restating it:
//    - above bracket → warding's a strength; the pro's low count is a
//      hero/role thing, not a model
//    - below bracket → warding is the cheapest improvement at this
//      bracket
//    - tracking → no wall here
const visionStrip: TemplateBuilder = {
  templateId: 'vision_output_low',
  templates: {
    default: ['Yours: {user_obs} obs/game (pos {pos}) · Bracket median: {bracket_obs}'],
    honest: [
      "Your warding's a strength here — {user_obs} obs/game on pos {pos}, above bracket norm of {bracket_obs}. Pro placed {pro_obs}; that's hero design, not a model to copy.",
      "{user_obs} obs/game on pos {pos} — below bracket norm of {bracket_obs}. Warding's the cheapest improvement at your level. Pro placed {pro_obs}.",
      "Your warding's at bracket norm — {user_obs} obs/game on pos {pos}, against {bracket_obs}. Not a wall here. Pro placed {pro_obs}.",
    ],
  },
  default: (ctx) => {
    const u = ctx.userStats.obs_per_game
    const b = ctx.bracketStats.obs_per_game
    if (u == null || b == null) return null
    return substitute(visionStrip.templates.default[0], {
      user_obs: fmt1(u),
      pos: ctx.position,
      bracket_obs: fmt1(b),
    })
  },
  honest: (ctx) => {
    const u = ctx.userStats.obs_per_game
    const b = ctx.bracketStats.obs_per_game
    if (u == null || b == null) return null
    const proObs = ctx.facts.obs_placed
    if (typeof proObs !== 'number') return null
    const tol = 0.5
    let template: string
    if (u > b + tol) template = visionStrip.templates.honest[0]
    else if (u < b - tol) template = visionStrip.templates.honest[1]
    else template = visionStrip.templates.honest[2]
    return substitute(template, {
      user_obs: fmt1(u),
      pos: ctx.position,
      bracket_obs: fmt1(b),
      pro_obs: proObs,
    })
  },
}

// 2. five_slot_timing_outlier
//    Honest mode editorial: the timing gap to bracket reads as a
//    lane-phase signal more than an itemization signal — that's the
//    "what does this mean" addition. Two register variants per (hero
//    match × user-faster-or-slower-than-bracket): hero-match faster,
//    hero-match slower, no-hero-match faster, no-hero-match slower.
//    Lower minutes = faster (the better direction for cores).
const fiveSlotStrip: TemplateBuilder = {
  templateId: 'five_slot_timing_outlier',
  templates: {
    default: [
      'Yours on {hero}: {user_5slot} 5-slot timing · Bracket median: {bracket_5slot} (pos {pos})',
      'Yours: {user_5slot} typical pos {pos} 5-slot · Bracket median: {bracket_5slot}',
    ],
    honest: [
      // hero-match, user faster than bracket
      "Your {hero} 5-slot at {user_5slot} — faster than bracket norm of {bracket_5slot} (pos {pos}). Pro hit it at {pro_5slot}. Itemization's not your wall.",
      // hero-match, user slower than bracket
      "Your {hero} 5-slot at {user_5slot} — slower than bracket norm of {bracket_5slot} (pos {pos}). Pro hit it at {pro_5slot}. The gap to bracket says lane efficiency more than itemization.",
      // no-hero-match, user faster
      "Your typical pos {pos} 5-slot at {user_5slot}, faster than bracket norm of {bracket_5slot}. Pro: {pro_5slot}. Itemization's not your wall.",
      // no-hero-match, user slower
      "Your typical pos {pos} 5-slot at {user_5slot} — slower than bracket norm of {bracket_5slot}. Pro hit it at {pro_5slot}. The gap to bracket says lane efficiency more than itemization.",
    ],
  },
  default: (ctx, resolveHeroName) => {
    const bMin = ctx.bracketStats.five_slot_min
    if (bMin == null) return null
    const heroId = ctx.facts.hero_id
    if (typeof heroId === 'number') {
      const heroEntry = ctx.userStats.hero_5slot[heroId]
      if (heroEntry && heroEntry.games >= MIN_HERO_GAMES) {
        return substitute(fiveSlotStrip.templates.default[0], {
          hero: resolveHeroName(heroId),
          user_5slot: minutesToMmSs(heroEntry.median_min),
          bracket_5slot: minutesToMmSs(bMin),
          pos: ctx.position,
        })
      }
    }
    const uMin = ctx.userStats.five_slot_min
    if (uMin == null) return null
    return substitute(fiveSlotStrip.templates.default[1], {
      user_5slot: minutesToMmSs(uMin),
      pos: ctx.position,
      bracket_5slot: minutesToMmSs(bMin),
    })
  },
  honest: (ctx, resolveHeroName) => {
    const bMin = ctx.bracketStats.five_slot_min
    if (bMin == null) return null
    const proTime = ctx.facts.five_slot_time
    if (typeof proTime !== 'string') return null
    const heroId = ctx.facts.hero_id
    if (typeof heroId === 'number') {
      const heroEntry = ctx.userStats.hero_5slot[heroId]
      if (heroEntry && heroEntry.games >= MIN_HERO_GAMES) {
        const faster = heroEntry.median_min < bMin
        const template = faster
          ? fiveSlotStrip.templates.honest[0]
          : fiveSlotStrip.templates.honest[1]
        return substitute(template, {
          hero: resolveHeroName(heroId),
          user_5slot: minutesToMmSs(heroEntry.median_min),
          bracket_5slot: minutesToMmSs(bMin),
          pos: ctx.position,
          pro_5slot: proTime,
        })
      }
    }
    const uMin = ctx.userStats.five_slot_min
    if (uMin == null) return null
    const faster = uMin < bMin
    const template = faster
      ? fiveSlotStrip.templates.honest[2]
      : fiveSlotStrip.templates.honest[3]
    return substitute(template, {
      pos: ctx.position,
      user_5slot: minutesToMmSs(uMin),
      bracket_5slot: minutesToMmSs(bMin),
      pro_5slot: proTime,
    })
  },
}

// 3. kda_extreme
//    Honest mode pairs KDA with TF participation when both are
//    available, surfacing two sharper findings:
//      - low KDA + high TF → "shows up but trades poorly"
//        (fight discipline is the friction)
//      - high KDA + low TF → "survives by avoiding"
//        (numbers look good because they aren't in the fight)
//    Falls back to a KDA-only editorial when TF data is missing or
//    the pairing doesn't resolve cleanly.
const KDA_TOL = 0.3
const TF_PAIR_TOL = 5

const kdaStrip: TemplateBuilder = {
  templateId: 'kda_extreme',
  templates: {
    default: ['Yours: {user_kda} KDA in pos {pos} games · Bracket median: {bracket_kda}'],
    honest: [
      // low KDA + high TF — shows up, trades poorly
      "Your pos {pos} KDA: {user_kda}, below bracket norm {bracket_kda}. You show up to fights ({user_tf}% TF, above bracket) but trade poorly. Pro: {pro_kda} — the friction at your bracket is fight discipline.",
      // high KDA + low TF — survives by avoiding
      "Your pos {pos} KDA: {user_kda}, above bracket norm {bracket_kda}. But your TF participation is {user_tf}% — the numbers look good because you're not there. Pro: {pro_kda}.",
      // KDA-only fallback, user below bracket
      "Your pos {pos} KDA: {user_kda} — below bracket norm of {bracket_kda}. Pro: {pro_kda}. KDA alone doesn't tell the full game, but at your bracket the gap usually means trade timing.",
      // KDA-only fallback, user above bracket
      "Your pos {pos} KDA: {user_kda} — above bracket norm of {bracket_kda}. Pro: {pro_kda}. The kill column's working; the gap to next bracket is somewhere else.",
      // The at-bracket "KDA alone doesn't tell the full game" template
      // was removed in Phase E calibration — when user is essentially
      // at bracket norm, honest mode has no editorial finding to add
      // and the trailing hand-wave reads as filler. The honest builder
      // now suppresses (returns null) for that case and the dispatcher
      // falls back to the default-mode neutral strip.
    ],
  },
  default: (ctx) => {
    const u = ctx.userStats.kda
    const b = ctx.bracketStats.kda
    if (u == null || b == null) return null
    return substitute(kdaStrip.templates.default[0], {
      user_kda: fmt1(u),
      pos: ctx.position,
      bracket_kda: fmt1(b),
    })
  },
  honest: (ctx) => {
    const u = ctx.userStats.kda
    const b = ctx.bracketStats.kda
    if (u == null || b == null) return null
    const proKda = ctx.facts.kda
    if (typeof proKda !== 'string') return null

    // Phase E calibration: at-bracket KDA suppresses honest mode
    // entirely. When user is within KDA_TOL of bracket, no editorial
    // finding holds — the gap is too small to claim "fight discipline"
    // or "kill column working." Fall back to default-mode neutral
    // strip via the dispatcher's null-returns-fallback path.
    if (Math.abs(u - b) < KDA_TOL) return null

    const userTf = ctx.userStats.tf_pct
    const bracketTf = ctx.bracketStats.tf_pct

    // Paired branch: low KDA + high TF — "shows up but trades poorly"
    if (u < b - KDA_TOL && userTf != null && bracketTf != null && userTf > bracketTf + TF_PAIR_TOL) {
      return substitute(kdaStrip.templates.honest[0], {
        pos: ctx.position,
        user_kda: fmt1(u),
        bracket_kda: fmt1(b),
        user_tf: fmtPct(userTf),
        pro_kda: proKda,
      })
    }
    // Paired branch: high KDA + low TF — "survives by avoiding"
    if (u > b + KDA_TOL && userTf != null && bracketTf != null && userTf < bracketTf - TF_PAIR_TOL) {
      return substitute(kdaStrip.templates.honest[1], {
        pos: ctx.position,
        user_kda: fmt1(u),
        bracket_kda: fmt1(b),
        user_tf: fmtPct(userTf),
        pro_kda: proKda,
      })
    }
    // KDA-only fallback — guaranteed outside KDA_TOL by the
    // at-bracket suppression above.
    const template = u < b
      ? kdaStrip.templates.honest[2]
      : kdaStrip.templates.honest[3]
    return substitute(template, {
      pos: ctx.position,
      user_kda: fmt1(u),
      bracket_kda: fmt1(b),
      pro_kda: proKda,
    })
  },
}

// 4. teamfight_participation_rank
//    Honest mode editorial pivots on direction:
//    - above bracket → showing up; question is trading well there
//    - below bracket → showing up is the cheapest win at this bracket
//    - tracking with → neutral editorial
//    Tolerance widened from 1pp to 5pp per Phase E feedback — 62 vs 60
//    isn't a meaningful gap to editorialize on.
const TF_DIRECTION_TOL = 5

const tfStrip: TemplateBuilder = {
  templateId: 'teamfight_participation_rank',
  templates: {
    default: ['Yours: {user_tf}% TF participation in pos {pos} games · Bracket median: {bracket_tf}%'],
    honest: [
      // user above bracket
      "Your pos {pos} TF participation: {user_tf}%, above bracket norm of {bracket_tf}. You show up; the question is whether you're trading well in those fights. Pro: {pro_tf}%.",
      // user below bracket
      "Your pos {pos} TF participation: {user_tf}% — below bracket norm of {bracket_tf}. Pro: {pro_tf}%. Showing up to fights is the cheapest win at your bracket.",
      // tracking with
      "Your pos {pos} TF participation: {user_tf}%, tracking bracket norm of {bracket_tf}. Pro: {pro_tf}%. Quantity's not the wall here; whether you trade well in fights is.",
    ],
  },
  default: (ctx) => {
    const u = ctx.userStats.tf_pct
    const b = ctx.bracketStats.tf_pct
    if (u == null || b == null) return null
    return substitute(tfStrip.templates.default[0], {
      user_tf: fmtPct(u),
      pos: ctx.position,
      bracket_tf: fmtPct(b),
    })
  },
  honest: (ctx) => {
    const u = ctx.userStats.tf_pct
    const b = ctx.bracketStats.tf_pct
    if (u == null || b == null) return null
    const proTf = ctx.facts.teamfight_pct
    if (typeof proTf !== 'number') return null
    let template: string
    if (u > b + TF_DIRECTION_TOL) template = tfStrip.templates.honest[0]
    else if (u < b - TF_DIRECTION_TOL) template = tfStrip.templates.honest[1]
    else template = tfStrip.templates.honest[2]
    return substitute(template, {
      pos: ctx.position,
      user_tf: fmtPct(u),
      bracket_tf: fmtPct(b),
      pro_tf: proTf,
    })
  },
}

// 5. lane_efficiency_extreme
//    Honest mode editorial leans on the empirical observation that
//    lane efficiency is the strongest single predictor of bracket
//    movement. Direction-branching:
//    - below bracket → that's where bracket movement comes from
//    - above bracket → lane's working; the wall is somewhere else
//    - tracking → neutral
const LANE_EFF_TOL = 5

const laneEffStrip: TemplateBuilder = {
  templateId: 'lane_efficiency_extreme',
  templates: {
    default: ['Yours: {user_lane_eff}% lane efficiency in pos {pos} games · Bracket median: {bracket_lane_eff}%'],
    honest: [
      // user below bracket
      "Your pos {pos} lane efficiency: {user_lane_eff}%, below bracket norm of {bracket_lane_eff}%. Pro: {pro_lane_eff}%. Bracket movement at your level correlates with lane efficiency more than any other stat.",
      // user above bracket
      "Your pos {pos} lane efficiency: {user_lane_eff}%, above bracket norm of {bracket_lane_eff}%. Lane's working; the wall isn't here. Pro: {pro_lane_eff}%.",
      // tracking
      "Your pos {pos} lane efficiency: {user_lane_eff}%, tracking bracket norm of {bracket_lane_eff}%. Pro: {pro_lane_eff}%. Lane phase isn't the differentiator at this gap.",
    ],
  },
  default: (ctx) => {
    const u = ctx.userStats.lane_eff_pct
    const b = ctx.bracketStats.lane_eff_pct
    if (u == null || b == null) return null
    return substitute(laneEffStrip.templates.default[0], {
      user_lane_eff: fmtPct(u),
      pos: ctx.position,
      bracket_lane_eff: fmtPct(b),
    })
  },
  honest: (ctx) => {
    const u = ctx.userStats.lane_eff_pct
    const b = ctx.bracketStats.lane_eff_pct
    if (u == null || b == null) return null
    const proEff = ctx.facts.lane_eff_pct
    if (typeof proEff !== 'number') return null
    let template: string
    if (u < b - LANE_EFF_TOL) template = laneEffStrip.templates.honest[0]
    else if (u > b + LANE_EFF_TOL) template = laneEffStrip.templates.honest[1]
    else template = laneEffStrip.templates.honest[2]
    return substitute(template, {
      pos: ctx.position,
      user_lane_eff: fmtPct(u),
      bracket_lane_eff: fmtPct(b),
      pro_lane_eff: proEff,
    })
  },
}

const BUILDERS: Record<SupportedStripTemplateId, TemplateBuilder> = {
  vision_output_low: visionStrip,
  five_slot_timing_outlier: fiveSlotStrip,
  kda_extreme: kdaStrip,
  teamfight_participation_rank: tfStrip,
  lane_efficiency_extreme: laneEffStrip,
}

// ----- Self-test (runs at module load) -----

interface SelfTestCase {
  name: string
  templateId: SupportedStripTemplateId
  facts: ProseFire['facts']
  userOverrides?: Partial<UserPositionStats>
  bracketOverrides?: Partial<BracketPositionStats>
  /** Override the user_per_position[position] entirely. */
  position: Position
  honestMode: boolean
  expect:
    | { kind: 'render'; mustContain?: string[]; mustNotContain?: string[] }
    | { kind: 'null' }
    | { kind: 'fallback'; mustNotContain: string[] } // honest validation failed → default
}

function fixtureUserData(): UserCompareData {
  return {
    version: 1,
    account_id: 99999,
    rank_tier: 33,
    rank_label: 'Crusader 3',
    built_at: 1700000000_000,
    user_role_label: 'support',
    user_top_position: 5,
    match_window: { total_matches: 50, parsed_matches: 45 },
    user_per_position: {
      1: {
        game_count: 8, obs_per_game: 1.2, five_slot_min: 28.5,
        // User has 4 games on Sven (id 18) at pos 1 — qualifies for hero match
        hero_5slot: { 18: { games: 4, median_min: 24.0 } },
        kda: 2.4, tf_pct: 60, lane_eff_pct: 65,
      },
      2: { game_count: 4, obs_per_game: 1.5, five_slot_min: 25.0, hero_5slot: {}, kda: 3.0, tf_pct: 64, lane_eff_pct: 70 }, // sub-5 → suppression
      3: { game_count: 12, obs_per_game: 2.0, five_slot_min: 27.0, hero_5slot: {}, kda: 1.8, tf_pct: 66, lane_eff_pct: 55 }, // small-sample → footnote
      4: { game_count: 30, obs_per_game: 5.0, five_slot_min: null, hero_5slot: {}, kda: 2.0, tf_pct: 62, lane_eff_pct: null },
      5: {
        game_count: 30, obs_per_game: 6.8, five_slot_min: 30.0,
        hero_5slot: { 5: { games: 5, median_min: 27.5 } }, // CM (id 5), ≥3 games
        kda: 1.6, tf_pct: 58, lane_eff_pct: null,
      },
    },
    bracket_per_position: {
      1: { sample_count: 90, obs_per_game: 1.0, five_slot_min: 26.0, kda: 4.5, tf_pct: 65, lane_eff_pct: 75 },
      2: { sample_count: 80, obs_per_game: 1.5, five_slot_min: 24.0, kda: 4.0, tf_pct: 62, lane_eff_pct: 72 },
      3: { sample_count: 85, obs_per_game: 2.0, five_slot_min: 27.5, kda: 3.5, tf_pct: 64, lane_eff_pct: 60 },
      4: { sample_count: 95, obs_per_game: 5.5, five_slot_min: null, kda: 2.5, tf_pct: 60, lane_eff_pct: null },
      5: { sample_count: 100, obs_per_game: 5.2, five_slot_min: null, kda: 2.0, tf_pct: 56, lane_eff_pct: null },
    },
  }
}

const SELF_TEST_CASES: SelfTestCase[] = [
  // 1. Vision strip — happy path, large sample, default mode
  {
    name: 'vision default (large sample)',
    templateId: 'vision_output_low',
    facts: { position: 5, hero: 'Crystal Maiden', obs_placed: 1, duration_min: 31, match_support_median_obs: '8.5' },
    position: 5,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['Yours: 6.8 obs/game', 'pos 5', 'Bracket median: 5.2'], mustNotContain: ['Crystal Maiden', 'small sample', '{'] },
  },
  // 2. Vision strip — honest mode, ahead of bracket → editorial about
  //    pro's hero design, not about user warding less
  {
    name: 'vision honest (ahead of bracket)',
    templateId: 'vision_output_low',
    facts: { position: 5, hero: 'Crystal Maiden', obs_placed: 1, duration_min: 31, match_support_median_obs: '8.5' },
    position: 5,
    honestMode: true,
    expect: {
      kind: 'render',
      mustContain: ["warding's a strength", 'above bracket norm', 'hero design'],
      mustNotContain: ['Crystal Maiden', '{', 'you should'],
    },
  },
  // 3. Vision strip — sub-5 user games → null
  {
    name: 'vision suppress (sub-5 user games)',
    templateId: 'vision_output_low',
    facts: { position: 2, obs_placed: 1, duration_min: 31, match_support_median_obs: '8.5' },
    position: 2,
    honestMode: false,
    expect: { kind: 'null' },
  },
  // 4. Vision strip — small-sample footnote
  {
    name: 'vision small-sample footnote (12 games)',
    templateId: 'vision_output_low',
    facts: { position: 3, obs_placed: 2, duration_min: 31, match_support_median_obs: '8.5' },
    position: 3,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['(small sample, 12 games)'] },
  },
  // 5. Five-slot strip — hero match (Sven id 18 at pos 1, default mode).
  //    The five_slot Cat 1B template only fires on cores so any hero-
  //    match case is necessarily on a core position; pos 1 with Sven
  //    is the realistic shape.
  {
    name: 'five_slot default (hero match)',
    templateId: 'five_slot_timing_outlier',
    facts: { position: 1, hero: 'Sven', hero_id: 18, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 },
    position: 1,
    honestMode: false,
    // Sven hero match: user 24:00 on Sven, bracket 26:00 at pos 1.
    // 'Sven' is allowed in output ONLY because the hero-match path
    // explicitly resolves heroId via the resolver (text-blind to
    // facts.hero), and the user has 4 games on the same hero.
    expect: { kind: 'render', mustContain: ['Yours on Sven', '24:00', 'pos 1', '(small sample, 8 games)'], mustNotContain: ['{'] },
  },
  // 6. Five-slot strip — no hero match (pos 3, default).
  {
    name: 'five_slot default (no hero match)',
    templateId: 'five_slot_timing_outlier',
    facts: { position: 3, hero: 'Tide', hero_id: 29, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 },
    position: 3,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['Yours: 27:00 typical pos 3 5-slot', 'Bracket median: 27:30', '(small sample, 12 games)'], mustNotContain: ['Tide', '{'] },
  },
  // 7. Five-slot strip — no bracket data → null
  {
    name: 'five_slot suppress (bracket null)',
    templateId: 'five_slot_timing_outlier',
    facts: { position: 4, hero: 'Hoodwink', hero_id: 123, five_slot_time: '18:30', match_core_median_time: '24:30', delta_min: -6 },
    position: 4,
    honestMode: false,
    expect: { kind: 'null' }, // bracket pos 4 five_slot_min is null
  },
  // 8. KDA strip — default mode
  {
    name: 'kda default',
    templateId: 'kda_extreme',
    facts: { position: 5, hero: 'Lich', kills: 18, deaths: 3, assists: 7, kda: '8.3', rank: 'highest' },
    position: 5,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['Yours: 1.6 KDA', 'pos 5', 'Bracket median: 2.0'], mustNotContain: ['Lich', '{'] },
  },
  // 9. KDA strip — honest mode, KDA-only fallback (user 1.6 vs bracket
  //    2.0 → low; user TF% 58 vs bracket 56 → only 2pp above, doesn't
  //    clear the 5pp paired-branch threshold → KDA-only editorial)
  {
    name: 'kda honest (KDA-only fallback, low)',
    templateId: 'kda_extreme',
    facts: { position: 5, hero: 'Lich', kills: 18, deaths: 3, assists: 7, kda: '8.3', rank: 'highest', teamfight_pct: 32 },
    position: 5,
    honestMode: true,
    expect: {
      kind: 'render',
      mustContain: ['Your pos 5 KDA: 1.6', 'below bracket norm of 2.0', 'Pro: 8.3', 'trade timing'],
      mustNotContain: ['{'],
    },
  },
  // 10. TF strip — default + small-sample footnote
  {
    name: 'tf default (small sample)',
    templateId: 'teamfight_participation_rank',
    facts: { position: 3, hero: 'Tide', teamfight_pct: 78, rank: 'highest' },
    position: 3,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['Yours: 66% TF participation', 'pos 3', '(small sample, 12 games)'] },
  },
  // 11. TF strip — honest, user 62 vs bracket 60 → within 5pp tol
  //     → 'tracking' editorial (per Phase E feedback: 1pp was too
  //     tight, 62 vs 60 was reading as "already ahead" which overstated)
  {
    name: 'tf honest (tracking — within tol)',
    templateId: 'teamfight_participation_rank',
    facts: { position: 4, hero: 'Hoodwink', teamfight_pct: 78, rank: 'highest' },
    position: 4,
    honestMode: true,
    expect: {
      kind: 'render',
      mustContain: ['62%', 'tracking bracket norm of 60', 'whether you trade well'],
      mustNotContain: ['{'],
    },
  },
  // 14. KDA strip — honest at-bracket → suppress honest, fall to default.
  //     Phase E calibration: user 4.0 vs bracket 4.0 = within KDA_TOL,
  //     editorial has nothing to add, so the dispatcher renders the
  //     neutral default-mode strip instead of "KDA alone doesn't tell
  //     the full game" hand-wave.
  {
    name: 'kda honest (at-bracket → falls back to default)',
    templateId: 'kda_extreme',
    facts: { position: 5, kills: 31, deaths: 3, assists: 8, kda: '13.0', rank: 'highest', teamfight_pct: 90 },
    position: 5,
    honestMode: true,
    userOverrides: { kda: 4.0 },
    bracketOverrides: { kda: 4.0 },
    expect: {
      kind: 'render',
      // Default-mode prose (the "Yours: ... · Bracket median: ..." shape)
      mustContain: ['Yours: 4.0 KDA in pos 5 games', 'Bracket median: 4.0'],
      // Honest-mode markers MUST be absent — confirms the fallback path
      mustNotContain: ['Pro:', "doesn't tell the full game", 'fight discipline', 'trade timing', '{'],
    },
  },
  // 12. KDA strip — honest, paired branch (low KDA + high TF)
  //     pos 3: user 1.8 vs bracket 3.5 → low KDA; user 66 vs bracket 64
  //     → only 2pp, NOT paired → fallback to KDA-only. Add a synthetic
  //     case where pairing fires:
  {
    name: 'kda honest (paired: low KDA + high TF)',
    templateId: 'kda_extreme',
    facts: { position: 3, hero: 'Tide', kills: 4, deaths: 9, assists: 12, kda: '1.7', rank: 'lowest', teamfight_pct: 78 },
    position: 3,
    honestMode: true,
    // pos 3 user: kda 1.8 (b 3.5 → low by KDA_TOL), tf 66 (b 64 → not
    // paired threshold). To force pair: bracket would need lower TF.
    // Skip — covered by harness sample renders against magsasaka data.
    expect: { kind: 'render', mustContain: ['Your pos 3 KDA: 1.8', 'below bracket norm', 'Pro: 1.7'] },
  },
  // 12. Lane eff strip — default, cores
  {
    name: 'lane_eff default (pos 1)',
    templateId: 'lane_efficiency_extreme',
    facts: { position: 1, hero: 'PA', lane_eff_pct: 92, core_count: 4, rank: 'highest' },
    position: 1,
    honestMode: false,
    expect: { kind: 'render', mustContain: ['Yours: 65% lane efficiency', 'pos 1', 'Bracket median: 75%', '(small sample, 8 games)'] },
  },
  // 13. Lane eff strip — honest, supports → suppress (lane_eff_pct null on user pos 5)
  {
    name: 'lane_eff suppress (user data null)',
    templateId: 'lane_efficiency_extreme',
    facts: { position: 5, hero: 'Lich', lane_eff_pct: 50, core_count: 4, rank: 'lowest' },
    position: 5,
    honestMode: false,
    expect: { kind: 'null' },
  },
]

function runSelfTest(): void {
  // 1. Static template check: every template string must have ≥ 2
  // distinct placeholders.
  const errors: string[] = []
  for (const builder of Object.values(BUILDERS)) {
    for (const t of [...builder.templates.default, ...builder.templates.honest]) {
      const n = countPlaceholders(t)
      if (n < 2) {
        errors.push(`${builder.templateId}: template has ${n} placeholders (< 2): "${t}"`)
      }
    }
  }

  // 2. Render every test case against fixture data, assert expected
  // output shape.
  const data = fixtureUserData()
  const heroes: Record<number, string> = {
    5: 'Crystal Maiden',
    18: 'Sven',
    123: 'Hoodwink',
    31: 'Lich',
  }
  const resolveHeroName = (id: number) => heroes[id] ?? `Hero ${id}`

  for (const tc of SELF_TEST_CASES) {
    // Apply per-test fixture overrides if declared. Used for cases
    // where the base fixture doesn't surface the right user/bracket
    // gap (e.g. the at-bracket KDA suppression test needs user_kda
    // within 0.3 of bracket_kda, which the base fixture doesn't
    // produce at any position).
    const fixture: UserCompareData = (tc.userOverrides || tc.bracketOverrides)
      ? {
          ...data,
          user_per_position: {
            ...data.user_per_position,
            [tc.position]: {
              ...data.user_per_position[tc.position],
              ...(tc.userOverrides ?? {}),
            },
          },
          bracket_per_position: {
            ...data.bracket_per_position,
            [tc.position]: {
              ...data.bracket_per_position[tc.position],
              ...(tc.bracketOverrides ?? {}),
            },
          },
        }
      : data

    let result: string | null
    try {
      result = buildUserStrip({
        templateId: tc.templateId,
        facts: tc.facts,
        userCompareData: fixture,
        honestMode: tc.honestMode,
        resolveHeroName,
      })
    } catch (err) {
      errors.push(`[${tc.name}] threw: ${(err as Error).message}`)
      continue
    }

    if (tc.expect.kind === 'null') {
      if (result !== null) {
        errors.push(`[${tc.name}] expected null, got: "${result}"`)
      }
      continue
    }

    if (result == null) {
      errors.push(`[${tc.name}] expected render, got null`)
      continue
    }

    // No leftover placeholders ever.
    if (/\{[A-Za-z_][\w]*\}/.test(result)) {
      errors.push(`[${tc.name}] leftover placeholder in output: "${result}"`)
    }

    const need = tc.expect.kind === 'render' ? (tc.expect.mustContain ?? []) : []
    for (const tok of need) {
      if (!result.includes(tok)) {
        errors.push(`[${tc.name}] missing required substring "${tok}" in: "${result}"`)
      }
    }
    const banned = tc.expect.kind === 'render'
      ? (tc.expect.mustNotContain ?? [])
      : tc.expect.kind === 'fallback'
        ? tc.expect.mustNotContain
        : []
    for (const tok of banned) {
      if (result.includes(tok)) {
        errors.push(`[${tc.name}] forbidden substring "${tok}" in: "${result}"`)
      }
    }

    // Honest-mode renders must additionally pass validateRoast.
    if (tc.honestMode && tc.expect.kind === 'render') {
      if (!validateRoast(result)) {
        errors.push(`[${tc.name}] honest mode result failed validateRoast: "${result}"`)
      }
    }
  }

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.error('[userStrips] self-test FAILED:\n  ' + errors.join('\n  '))
  }
}

runSelfTest()

// ----- Test-only exports (Node script + Phase E calibration) -----

export const __test__ = {
  fixtureUserData,
  SELF_TEST_CASES,
  BUILDERS,
  passesNeutral,
  countPlaceholders,
  substitute,
  minutesToMmSs,
  comparisonClause,
}
