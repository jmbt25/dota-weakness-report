// OpenDota response types — only the fields we use.
// Reference: https://docs.opendota.com/

export type Severity = 'good' | 'ok' | 'concerning' | 'unmeasured'

export interface ODMatchSummary {
  match_id: number
  player_slot: number
  radiant_win: boolean
  duration: number
  hero_id: number
  start_time: number
  kills: number
  deaths: number
  assists: number
  game_mode?: number
  lobby_type?: number
  average_rank?: number | null
  leaver_status?: number
  // Present on the matches list; null until parsed.
  version?: number | null
}

export interface ODPurchaseLogEntry {
  key: string
  time: number
  charges?: number
}

export interface ODObjective {
  type: string
  time: number
  slot?: number
  player_slot?: number
  key?: string | number
  value?: number
  /** Some parsed event types (deaths, tower kills, etc.) carry coordinates. */
  x?: number | null
  y?: number | null
}

export interface ODMatchPlayer {
  account_id?: number | null
  personaname?: string | null
  player_slot: number
  hero_id: number
  kills: number
  deaths: number
  assists: number
  gold_per_min: number
  xp_per_min: number
  last_hits: number
  denies: number
  net_worth?: number
  level?: number
  lane?: number | null
  lane_role?: number | null
  is_roaming?: boolean | null
  lane_efficiency?: number | null
  lane_efficiency_pct?: number | null
  /** Party detection (parsed-only on most matches). Same `party_id` = same stack. */
  party_id?: number | null
  party_size?: number | null
  /**
   * OpenDota lane outcome (parsed-only). 1 = won, 2 = tied, 3 = lost.
   * Encodings vary slightly by lane (safe/mid/off) but lower is always better.
   * Null when the match isn't parsed or the lane couldn't be classified.
   */
  lane_outcome?: number | null
  // Per-minute time series (parsed matches only)
  gold_t?: number[]
  xp_t?: number[]
  lh_t?: number[]
  times?: number[]
  purchase_log?: ODPurchaseLogEntry[]
  // Ward / vision fields (parsed-only). Counts are post-game and survive
  // even when the per-event logs don't; the logs power timing + region
  // analysis.
  obs_placed?: number | null
  sen_placed?: number | null
  observer_kills?: number | null
  sentry_kills?: number | null
  obs_log?: ODWardEvent[]
  sen_log?: ODWardEvent[]
  obs_left_log?: ODWardEvent[]
  sen_left_log?: ODWardEvent[]
  // Per-event death log for vision-death-mismatch analysis. Each entry is
  // a death the player suffered, with coordinates + time when parsed.
  kills_log?: ODKillEvent[]
  win?: number
  lose?: number
  isRadiant?: boolean
}

/**
 * One observer/sentry placement (or expiry) event from a parsed match.
 * Coordinates are the OpenDota grid (~64–192 on each axis).
 */
export interface ODWardEvent {
  time: number
  x?: number | null
  y?: number | null
  /** Internal item key, e.g. "ward_observer" / "ward_sentry". */
  key?: string
  /** Some events also carry the placer's slot. */
  player_slot?: number
  /** True when the ward was killed by the enemy (`obs_left_log`). */
  ehandle?: number
}

/** Death event with coordinates. */
export interface ODKillEvent {
  time: number
  x?: number | null
  y?: number | null
  key?: string
}

export interface ODMatchDetail {
  match_id: number
  duration: number
  start_time: number
  radiant_win: boolean
  game_mode: number
  lobby_type: number
  players: ODMatchPlayer[]
  objectives?: ODObjective[]
  // The match has been parsed (replay analyzed) when this is set
  version?: number | null
}

export interface ODPlayerProfile {
  profile?: {
    account_id: number
    personaname: string | null
    avatarfull: string | null
    name: string | null
  }
  rank_tier?: number | null
  leaderboard_rank?: number | null
}

export interface ODHero {
  id: number
  name: string // e.g. "npc_dota_hero_antimage"
  localized_name: string // display name, e.g. "Anti-Mage"
  primary_attr: string
  attack_type: string
  roles: string[]
}

// Domain types

export type Role = 'core' | 'support' | 'flex' | 'unknown'

/** Bucket of rank tiers used by baselines. */
export type RankBucket = 'low' | 'mid' | 'high' | 'top'

export interface AnalysisResult {
  id: AnalysisId
  title: string
  /** Hidden when severity is 'unmeasured'. */
  metric: number
  metricLabel: string
  baseline: number
  /** Short label after the baseline value. Should NOT contain the word "baseline". */
  baselineLabel: string
  severity: Severity
  /** Optional label override for the severity pill (e.g. "Strong" instead of "Healthy"). */
  severityLabel?: string
  finding: string
  suggestion: string
  /** Optional payload for the chart on this card. */
  chart?: ChartPayload
  /** Optional disclaimer shown below the prose (e.g. "approximated, no parsed data"). */
  note?: string
  /** Stack synergy needs an anonymization toggle, so it ships raw partner data. */
  stackSynergy?: StackSynergyData
  /** Vision card renders a custom SVG overlay on the minimap, so it ships raw placement data. */
  vision?: VisionData
  /**
   * Honest-mode roast templates pull placeholder values from this map.
   * Keys are template-defined strings (e.g. "deaths_per_game"); values
   * are pre-formatted (already rounded / unit-suffixed) for direct
   * substitution. Optional — analyses opt in when they have data to roast.
   */
  roastFacts?: Record<string, string | number>
}

export type HonestLanguage = 'english' | 'taglish'

export type AnalysisId =
  | 'death-timing'
  | 'farm-efficiency'
  | 'item-timing'
  | 'situational-items'
  | 'lane-outcome'
  | 'hero-pool'
  | 'stack-synergy'
  | 'tilt'
  | 'vision'

export interface StackSynergyPartner {
  /** Stable per-session key. Account ID when known; otherwise a synthetic id. */
  id: number
  personaName: string
  gamesTogether: number
  winsTogether: number
  /** 0..1 */
  wrTogether: number
  /** 0..1 — user's WR in matches WITHOUT this partner. Null if no such matches exist. Diagnostic-only; not used for delta. */
  userWrWithoutPartner: number | null
  /** Percentage points: (wrTogether - userOverallWr) * 100. Always defined. */
  deltaPp: number | null
  /** 95% CI bounds for wrTogether (0..1). */
  ciLow: number
  ciHigh: number
  /** True if userOverallWr lies outside the CI for wrTogether (i.e. the partner makes a detectable difference). */
  isSignificant: boolean
  /** Number of user matches in this window WITHOUT this partner. Diagnostic-only. */
  withoutGames: number
}

export interface StackSynergyData {
  partners: StackSynergyPartner[]
  /** 0..1 */
  userOverallWr: number
  /** 'high' if party_id-based; 'low' if heuristic fallback. */
  detectionConfidence: 'high' | 'low'
  partyMatchCount: number
  totalMatches: number
}

export type WardKind = 'observer' | 'sentry'
export type WardOutcome = 'dewarded' | 'expired' | 'still_alive_at_match_end'

export interface WardPlacement {
  kind: WardKind
  /** OpenDota grid coordinates (~64..192). Top-left origin AFTER y-flip. */
  x: number
  y: number
  outcome: WardOutcome
  /** Lifetime in seconds (placement → deward / expiry / match end). */
  lifetimeSec: number
}

export interface VisionData {
  placements: WardPlacement[]
  obsPerGame: number
  senPerGame: number
  dewardsPerGame: number
  /** Average lifetime across observers + sentries. Seconds. */
  avgLifetimeSec: number
  avgObsLifetimeSec: number
  avgSenLifetimeSec: number
  obsBaseline: number
  senBaseline: number
  dewardsBaseline: number
  lifetimeBaselineSec: number
  /** Null when we couldn't compute (no death coordinates available in OpenDota response). */
  mismatchPct: number | null
  /** Total deaths sampled — surfaced for the footnote so users can see the denominator. */
  deathSamples: number
  eligibleMatches: number
  totalMatches: number
  /** Renders the role-specific framing in the headline. */
  inferredRole: 'core' | 'support' | 'flex' | 'unknown'
}

export interface ChartBars {
  kind: 'bars'
  data: { label: string; value: number; baseline?: number }[]
  valueName?: string
  baselineName?: string
  /** Force a y-axis maximum (e.g. 100 for percentage charts). */
  yMax?: number
  /** Render bars horizontally. Useful for hero lists where labels need room. */
  horizontal?: boolean
  /** X-axis tick rotation in degrees, e.g. -30. Adds bottom padding when set. */
  xTickAngle?: number
  /** Replace each tick label with up to 2 lines, useful for "Item · Hero" labels. */
  xMultilineSplit?: string
}

export interface ChartSeries {
  kind: 'series'
  data: { x: number | string; you: number; baseline?: number }[]
  valueName?: string
  baselineName?: string
  yMax?: number
}

/** Two large stat blocks side by side — used when a chart would be overkill. */
export interface ChartStatBlocks {
  kind: 'stat-blocks'
  blocks: { label: string; value: string; sub?: string }[]
}

export type ChartPayload = ChartBars | ChartSeries | ChartStatBlocks

export interface RoleDistribution {
  /** Fractions in [0, 1], summing to ~1. */
  core: number
  support: number
  flex: number
}

export interface ReportInput {
  accountId: number
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  rankTier?: number | null
  inferredRole: Role
  /** Resolved bucket for baseline lookup. */
  rankBucket: RankBucket
  /** Game-share by classified hero role. Used for flex baseline blending. */
  roleDistribution: RoleDistribution
  /** Hero ID → localized name. Falls back to "Hero N" if missing. */
  heroName: (id: number) => string
}
