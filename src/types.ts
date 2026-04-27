// OpenDota response types — only the fields we use.
// Reference: https://docs.opendota.com/

export type Severity = 'good' | 'ok' | 'concerning'

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

// Domain types

export type Role = 'core' | 'support' | 'unknown'

export interface AnalysisResult {
  id: AnalysisId
  title: string
  metric: number
  metricLabel: string
  baseline: number
  baselineLabel: string
  severity: Severity
  finding: string
  suggestion: string
  // Optional payload for the chart on this card
  chart?: ChartPayload
}

export type AnalysisId =
  | 'death-timing'
  | 'farm-efficiency'
  | 'item-timing'
  | 'lane-outcome'
  | 'hero-pool'
  | 'tilt'

export type ChartPayload =
  | { kind: 'bars'; data: { label: string; value: number; baseline?: number }[]; valueName?: string; baselineName?: string }
  | { kind: 'series'; data: { x: number | string; you: number; baseline?: number }[]; valueName?: string; baselineName?: string }
  | { kind: 'pie'; data: { label: string; value: number }[] }

export interface ReportInput {
  accountId: number
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  // Optional baseline overrides resolved from rank/role
  rankTier?: number | null
  inferredRole: Role
}
