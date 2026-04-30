import type { ODProMatch } from '../types'

/**
 * Tournament-tier filter for the /breakdowns listing.
 *
 * Why hand-curated: OpenDota's `/leagues.tier` field exposes premium /
 * professional / amateur / excluded, but the tag hasn't been refreshed
 * for top-tier modern events — DreamLeague Season 28+, BLAST Slam,
 * ESL One Birmingham 2026, PGL Wallachia, and even Dota 2 Space League
 * + WB CyberClub CUP all carry tier=professional. The field can't
 * separate "TI broadcast tier" from "Russian regional grind league."
 *
 * Approach:
 *  1. NAME pattern allow-list (regex against league_name) — catches
 *     organizer + series naming patterns. Survives season number bumps
 *     and qualifier splits automatically (e.g. "DreamLeague Season 30"
 *     matches once Season 29 ends; "BLAST Slam VII China Qualifier"
 *     matches via the parent name).
 *  2. ID allow-list (explicit league_id) — escape hatch for legitimate
 *     events that don't match a regex pattern. Empty for now; populate
 *     from /leagues when TI 2026 Open Qualifiers publish their league
 *     IDs and need ad-hoc inclusion.
 *  3. Duration floor — 18 minutes. Drops throws + forfeits below the
 *     "real game" threshold even from leagues we DO track. Applies
 *     regardless of the show-all toggle.
 *
 * Bias toward false-negative (filter out edge cases) — the show-all
 * toggle in the UI is the safety valve.
 */

const TOURNAMENT_NAME_PATTERNS: RegExp[] = [
  /dreamleague/i,
  /blast.*slam/i,
  /betboom.*dacha/i,
  /\besl\s+(one|challenger)\b/i,
  /pgl\s+(wallachia|arlington|major|bucharest|copenhagen|stockholm)/i,
  /riyadh\s+masters/i,
  /esports\s+world\s+cup/i,
  /\bthe\s+international\b/i,
  /road\s+to\s+ti/i,
  /res\s+unchained/i,
  /epic(enter|\s+league)/i,
  /elisa\s+masters/i,
  /gamersgalaxy/i,
  /bts\s+pro/i,
  /oga\s+dota\s+pit/i,
  /dpc\s+20\d\d/i,
  /dreamhack/i,
]

/**
 * Explicit league_id allow-list. Use when a legitimate event doesn't
 * match a regex pattern but should appear in the default /breakdowns view.
 *
 * Add entries with a one-line comment explaining why they're here so
 * future maintenance can re-evaluate.
 *
 * TODO (pre-2026-06-04 launch deploy): Populate with TI 2026 Open
 * Qualifier league_ids once they're announced (late May / early June,
 * around the 2026-06-01 roster lock). Sources:
 *   1. https://api.opendota.com/api/leagues — find new entries with
 *      tier=premium or tier=professional matching "Road to TI 2026"
 *      naming. The 2023 cycle used IDs 15689-15694 for regional quals.
 *   2. Liquipedia TI 2026 page — has the canonical IDs once Valve
 *      publishes the bracket.
 * Don't rely on regex alone for TI matches — league names can be
 * renamed mid-tournament (Valve has done this before), and IDs are
 * the stable canonical reference. Inclusion here is the safety net.
 */
const TOURNAMENT_ID_ALLOWLIST: number[] = [
  // (none yet — see TODO above)
]

const MIN_DURATION_SEC = 18 * 60 // 1080s — drops throws + forfeits

export function isLeagueTracked(leagueName: string, leagueId: number): boolean {
  if (TOURNAMENT_ID_ALLOWLIST.includes(leagueId)) return true
  const name = leagueName ?? ''
  return TOURNAMENT_NAME_PATTERNS.some((p) => p.test(name))
}

/**
 * Single eligibility check used by BreakdownsPage:
 *  - Always applied: duration floor (18 min)
 *  - Tracked-tournaments mode (default): also requires the league to
 *    pass `isLeagueTracked`
 *  - Show-all mode (toggle on): only the duration floor
 */
export function isMatchEligible(m: ODProMatch, showAll: boolean): boolean {
  if (!Number.isFinite(m.duration) || m.duration < MIN_DURATION_SEC) return false
  if (showAll) return true
  return isLeagueTracked(m.league_name ?? '', m.leagueid)
}

/**
 * Convenience for the toggle text — count how many of `matches` would
 * pass at each filter level. Single pass.
 */
export function countByFilter(matches: ODProMatch[]): {
  trackedAndLong: number
  allLong: number
  total: number
} {
  let trackedAndLong = 0
  let allLong = 0
  for (const m of matches) {
    if (!Number.isFinite(m.duration) || m.duration < MIN_DURATION_SEC) continue
    allLong += 1
    if (isLeagueTracked(m.league_name ?? '', m.leagueid)) trackedAndLong += 1
  }
  return { trackedAndLong, allLong, total: matches.length }
}
