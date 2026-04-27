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
}

export interface ODMatchPlayer {
  account_id?: number | null
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
  win?: number
  lose?: number
  isRadiant?: boolean
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
}

export type AnalysisId =
  | 'death-timing'
  | 'farm-efficiency'
  | 'item-timing'
  | 'lane-outcome'
  | 'hero-pool'
  | 'tilt'

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
