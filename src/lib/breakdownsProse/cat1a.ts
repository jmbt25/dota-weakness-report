// Category 1A — cross-match per-player observations (corpus-backed).
//
// Per docs/breakdowns-feature-v1-spec.md §2.2, fires only when the player's
// account_id is in pro-baselines.json AND the relevant aggregate has
// enough sample (typically ≥ 5 games on whatever axis is being read).
// Falls back silently when the player is unknown or the sample is thin
// — Cat 1B carries the floor for everyone.
//
// Design rule: NARRATIVE not numbers. Each template should produce a
// two-clause sentence — corpus context + current-match payoff. Don't
// fire on small deltas. Cat 1A is where the breakdowns feature gets
// interesting; mediocre comparisons are noise.
//
// Reuses Phase 4 plumbing: PlayerContext / MatchContext / ProseFire
// from cat1b.ts, validateBreakdownsProse from bannedTokens.ts,
// resolveDisplayName from displayName.ts.

import type { MatchContext, PlayerContext, ProseFire } from './cat1b'
import { validateBreakdownsProse } from './bannedTokens'
import { resolveDisplayName, hasCuratedName } from './displayName'
import {
  getBaseline,
  overallRollingWr,
  type PlayerBaseline,
} from './corpus'
import { isSupportPosition } from './positionFromMatch'

// Re-export ProseFire from cat1b so the integration layer treats both
// categories uniformly.
export type { ProseFire } from './cat1b'

// ----- Helpers -----

function won(player: PlayerContext, ctx: MatchContext): boolean {
  const isRadiant = ((player.player.player_slot ?? 0) < 128)
  return isRadiant === ctx.detail.radiant_win
}

function fmtKda(player: PlayerContext): string {
  const k = player.player.kills ?? 0
  const d = player.player.deaths ?? 0
  const a = player.player.assists ?? 0
  return `${k}/${d}/${a}`
}

function kdaValue(player: PlayerContext): number {
  const k = player.player.kills ?? 0
  const d = player.player.deaths ?? 0
  const a = player.player.assists ?? 0
  return (k + a) / Math.max(d, 1)
}

function obsCount(p: PlayerContext): number {
  const player = p.player
  if (Array.isArray(player.obs_log)) return player.obs_log.length
  return typeof player.obs_placed === 'number' ? player.obs_placed : 0
}

function senCount(p: PlayerContext): number {
  const player = p.player
  if (Array.isArray(player.sen_log)) return player.sen_log.length
  return typeof player.sen_placed === 'number' ? player.sen_placed : 0
}

function laneEffWonInMatch(player: PlayerContext): boolean | null {
  const eff = player.player.lane_efficiency_pct
  if (typeof eff !== 'number') return null
  // Same threshold used elsewhere in /report's lane-outcome analysis
  // (CLAUDE.md "Lane outcome data isn't in OpenDota's free response right now"
  // section): ≥55% efficiency = won, <55% = lost.
  return eff >= 55
}

function meanFinite(values: (number | null | undefined)[]): number | null {
  let total = 0
  let count = 0
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      total += v
      count += 1
    }
  }
  return count === 0 ? null : total / count
}

// ----- Templates -----

export interface Cat1ATemplate {
  id: string
  priority: number
  produce: (
    player: PlayerContext,
    baseline: PlayerBaseline,
    curatedName: string,
    ctx: MatchContext
  ) => { text: string; facts: Record<string, string | number> } | null
}

/** 1. Lane WR streak — ≥3 in a row in the corpus, current match continues or breaks it. */
const laneWrStreak: Cat1ATemplate = {
  id: 'lane_wr_streak',
  priority: 8,
  produce: (player, baseline, name) => {
    const outcomes = baseline.recent_lane_outcomes
    if (!outcomes || outcomes.length < 5) return null
    // Outcomes are ordered newest-first per the refresh script's
    // sort. Walk forward to find the current streak.
    const firstWon = outcomes[0].won
    let streak = 0
    for (const o of outcomes) {
      if (o.won === firstWon) streak += 1
      else break
    }
    if (streak < 3) return null

    const myWon = laneEffWonInMatch(player)
    if (myWon == null) return null
    const myEff = player.player.lane_efficiency_pct as number

    // Phase 5 calibration: continued streaks need ≥ 5 to count as "story."
    // Breaks fire at any streak ≥ 3 (any reversal is narrative). Drops the
    // status-quo "won 4, won today" lines that fired for 10/10 players in
    // the BetBoom vs Aurora dump.
    const isContinue = firstWon === myWon
    if (isContinue && streak < 5) return null

    const rollingEff = meanFinite(outcomes.map((o) => o.lane_efficiency_pct))
    const effDelta = rollingEff != null ? Math.round(myEff - rollingEff) : null
    const deltaStr = effDelta != null ? `${effDelta >= 0 ? '+' : ''}${effDelta}pp vs rolling` : null

    let text: string
    if (firstWon && myWon) {
      // Streak continues (winning)
      text = `${name} (${player.heroName}) has won lane in his last ${streak} corpus games — won this one at ${myEff}% efficiency${deltaStr ? `, ${deltaStr}` : ''}.`
    } else if (firstWon && !myWon) {
      // Streak broken — was winning, lost this one
      text = `${name} (${player.heroName}) had won lane in his last ${streak} corpus games — lost this one at ${myEff}% efficiency${deltaStr ? `, ${deltaStr}` : ''}.`
    } else if (!firstWon && myWon) {
      // Streak broken — was losing, won this one
      text = `${name} (${player.heroName}) hadn't won a lane in his last ${streak} corpus games — won this one at ${myEff}% efficiency${deltaStr ? `, ${deltaStr}` : ''}.`
    } else {
      // Streak continues (losing)
      text = `${name} (${player.heroName}) has lost lane in his last ${streak} corpus games — and lost this one at ${myEff}% efficiency.`
    }

    return {
      text,
      facts: {
        hero: player.heroName,
        streak_length: streak,
        streak_kind: firstWon ? 'winning' : 'losing',
        match_won: String(myWon),
        match_lane_eff: myEff,
        rolling_lane_eff: rollingEff != null ? Math.round(rollingEff) : 'n/a',
      },
    }
  },
}

/** 2. Hero WR delta — record on this hero, with WR delta vs overall rolling WR. */
const heroWrDelta: Cat1ATemplate = {
  id: 'hero_wr_delta',
  priority: 7,
  produce: (player, baseline, name, ctx) => {
    const heroId = player.player.hero_id
    const entry = baseline.recent_hero_pool[String(heroId)]
    if (!entry || entry.games < 5) return null
    const heroWr = entry.wins / entry.games
    const overallWr = overallRollingWr(baseline)
    if (overallWr == null) return null
    const deltaPp = (heroWr - overallWr) * 100
    if (Math.abs(deltaPp) < 15) return null

    const losses = entry.games - entry.wins
    const matchWon = won(player, ctx)

    const heroLine = `${name} (${player.heroName}) is ${entry.wins}-${losses} on this hero in the corpus window`
    const matchLine = matchWon
      ? `Won this one. Went ${fmtKda(player)}, KDA ${kdaValue(player).toFixed(2)}.`
      : `Lost this one. Went ${fmtKda(player)}, KDA ${kdaValue(player).toFixed(2)}.`
    const text = `${heroLine}. ${matchLine}`

    return {
      text,
      facts: {
        hero: player.heroName,
        hero_record: `${entry.wins}-${losses}`,
        hero_wr: heroWr.toFixed(2),
        overall_wr: overallWr.toFixed(2),
        delta_pp: deltaPp.toFixed(0),
        match_won: String(matchWon),
      },
    }
  },
}

/** 3. KDA vs rolling — current match KDA vs corpus rolling_kda.
 *
 *  Phase 5 calibration: 2.0 → 3.0 KDA threshold so this fires only on
 *  dramatic swings. Plus the runner suppresses kda_vs_rolling when
 *  hero_kda_outlier already fired for the same player — the
 *  hero-specific line is more informative when the corpus has ≥ 5
 *  games on the hero in question. */
const kdaVsRolling: Cat1ATemplate = {
  id: 'kda_vs_rolling',
  priority: 6,
  produce: (player, baseline, name) => {
    const rolling = baseline.rolling_kda
    if (typeof rolling !== 'number' || rolling <= 0) return null
    const my = kdaValue(player)
    const delta = my - rolling
    if (Math.abs(delta) < 3.0) return null

    const direction = delta > 0 ? 'well above' : 'well below'
    const text = `${name} (${player.heroName}) finished ${fmtKda(player)}, KDA ${my.toFixed(2)} — ${direction} his rolling ${rolling.toFixed(2)} across the corpus window.`

    return {
      text,
      facts: {
        hero: player.heroName,
        match_kda: my.toFixed(2),
        rolling_kda: rolling.toFixed(2),
        delta: delta.toFixed(2),
      },
    }
  },
}

/** 4. GPM vs rolling — relative ≥ 15% (Phase 5 calibration: 8% → 15%
 *  catches stories, not Tuesdays). 21% over rolling is a story; 10%
 *  is just a pacing variation. */
const gpmVsRolling: Cat1ATemplate = {
  id: 'gpm_vs_rolling',
  priority: 5,
  produce: (player, baseline, name) => {
    const rolling = baseline.rolling_gpm
    if (typeof rolling !== 'number' || rolling <= 0) return null
    const my = player.player.gold_per_min ?? 0
    if (my === 0) return null
    const relDelta = (my - rolling) / rolling
    if (Math.abs(relDelta) < 0.15) return null

    const pct = Math.round(Math.abs(relDelta) * 100)
    const direction = relDelta > 0 ? 'over' : 'under'
    const verb = relDelta > 0 ? 'farmed above' : 'farmed under'
    const text = `${name} (${player.heroName}) ${verb} his usual: ${my} GPM today, ${pct}% ${direction} his rolling ${rolling}.`

    return {
      text,
      facts: {
        hero: player.heroName,
        match_gpm: my,
        rolling_gpm: rolling,
        rel_delta_pct: pct,
        direction,
      },
    }
  },
}

/** 5. Vision vs rolling — supports only, current obs+sen ≤ 50% of rolling, game ≥ 25 min. */
const visionVsRolling: Cat1ATemplate = {
  id: 'vision_vs_rolling',
  priority: 6,
  produce: (player, baseline, name, ctx) => {
    if (!isSupportPosition(player.position)) return null
    if (ctx.durationMin < 25) return null
    const rollingObs = baseline.rolling_obs_per_game
    const rollingSen = baseline.rolling_sen_per_game
    if (typeof rollingObs !== 'number' || typeof rollingSen !== 'number') return null
    const rollingTotal = rollingObs + rollingSen
    if (rollingTotal < 5) return null  // sample too thin to compare against

    const myObs = obsCount(player)
    const mySen = senCount(player)
    const myTotal = myObs + mySen
    if (myTotal >= rollingTotal * 0.5) return null

    const text = `${name} (${player.heroName}) went ${myObs} obs / ${mySen} sen across ${Math.round(ctx.durationMin)} minutes — well below his rolling ${rollingObs.toFixed(1)} obs / ${rollingSen.toFixed(1)} sen.`

    return {
      text,
      facts: {
        hero: player.heroName,
        match_obs: myObs,
        match_sen: mySen,
        rolling_obs: rollingObs.toFixed(1),
        rolling_sen: rollingSen.toFixed(1),
        duration_min: Math.round(ctx.durationMin),
      },
    }
  },
}

/** 6. Role distribution shift — playing a role with ≤15% season share. */
const roleDistributionShift: Cat1ATemplate = {
  id: 'role_distribution_shift',
  priority: 8,
  produce: (player, baseline, name) => {
    const dist = baseline.season_role_distribution
    if (!Array.isArray(dist) || dist.length !== 5) return null
    const idx = player.position - 1
    const myShare = dist[idx]
    if (typeof myShare !== 'number') return null
    if (myShare > 0.15) return null

    const dominantIdx = dist.indexOf(Math.max(...dist))
    const dominantShare = dist[dominantIdx]
    if (dominantShare < 0.5) return null  // genuinely flex player; not a "shift"

    const dominantPos = dominantIdx + 1
    const sharePct = Math.round(myShare * 100)
    const dominantPct = Math.round(dominantShare * 100)
    const text = `${name} played pos ${player.position} (${player.heroName}) today — pos ${player.position} is ${sharePct}% of his corpus games (he's a pos ${dominantPos} main, ${dominantPct}%).`

    return {
      text,
      facts: {
        hero: player.heroName,
        match_position: player.position,
        match_role_share_pct: sharePct,
        dominant_position: dominantPos,
        dominant_share_pct: dominantPct,
      },
    }
  },
}

/** 7. Hero KDA outlier — current KDA vs rolling kda_avg on this hero (≥5 games). */
const heroKdaOutlier: Cat1ATemplate = {
  id: 'hero_kda_outlier',
  priority: 7,
  produce: (player, baseline, name) => {
    const heroId = player.player.hero_id
    const entry = baseline.recent_hero_pool[String(heroId)]
    if (!entry || entry.games < 5) return null
    const rollingHeroKda = entry.kda_avg
    if (typeof rollingHeroKda !== 'number' || rollingHeroKda <= 0) return null
    const my = kdaValue(player)

    // Asymmetric multiplicative thresholds — KDA's lower bound is 0,
    // upper is unbounded. 1.7× rolling for "well above" / 0.4× for
    // "well below" calibrates to ~3× std-dev for typical pro KDA shapes.
    const isHigh = my >= rollingHeroKda * 1.7
    const isLow = my <= rollingHeroKda * 0.4
    if (!isHigh && !isLow) return null

    const variant = isHigh ? 'well above' : 'well below'
    const text = `${name} (${player.heroName}) finished ${fmtKda(player)}, KDA ${my.toFixed(2)} — ${variant} his rolling ${rollingHeroKda.toFixed(1)} on this hero across ${entry.games} corpus games.`

    return {
      text,
      facts: {
        hero: player.heroName,
        match_kda: my.toFixed(2),
        rolling_hero_kda: rollingHeroKda.toFixed(1),
        hero_games_in_corpus: entry.games,
        variant: isHigh ? 'high' : 'low',
      },
    }
  },
}

export const CAT_1A_TEMPLATES: Cat1ATemplate[] = [
  laneWrStreak,
  heroWrDelta,
  kdaVsRolling,
  gpmVsRolling,
  visionVsRolling,
  roleDistributionShift,
  heroKdaOutlier,
]

// ----- Runner -----

/**
 * Run all Cat 1A templates against every player in the match. Returns
 * a Map keyed by `player_slot` → fired prose lines. Players not in the
 * corpus produce empty arrays (silent fallback per spec).
 *
 * Gates: account_id must be in the corpus AND `hasCuratedName` must
 * return true (defends against orphan corpus entries — corpus has it
 * but curated list doesn't, so display-name fallback would surface
 * "Pos N" inside Cat 1A prose, violating the "no pos labels in Cat 1A"
 * rule).
 */
export function runCat1A(ctx: MatchContext): Map<number, ProseFire[]> {
  const out = new Map<number, ProseFire[]>()
  for (const player of ctx.players) {
    const fires: ProseFire[] = []
    const accountId = player.player.account_id ?? null
    const baseline = getBaseline(accountId)
    if (!baseline || !hasCuratedName(accountId)) {
      out.set(player.player.player_slot, fires)
      continue
    }
    const curatedName = resolveDisplayName(accountId, player.position)
    for (const tpl of CAT_1A_TEMPLATES) {
      let result: { text: string; facts: Record<string, string | number> } | null
      try {
        result = tpl.produce(player, baseline, curatedName, ctx)
      } catch {
        result = null
      }
      if (!result) continue
      if (!validateBreakdownsProse(result.text)) {
        // eslint-disable-next-line no-console
        console.warn('[breakdowns-prose] Cat 1A template rejected by validator:', tpl.id, result.text)
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
    // Cross-template dedup: hero_kda_outlier subsumes kda_vs_rolling when
    // both fire for the same player (the hero-specific line is more
    // informative; firing both is redundant). Phase 5 calibration.
    const hasHeroOutlier = fires.some((f) => f.templateId === 'hero_kda_outlier')
    const deduped = hasHeroOutlier
      ? fires.filter((f) => f.templateId !== 'kda_vs_rolling')
      : fires
    out.set(player.player.player_slot, deduped)
  }
  return out
}
