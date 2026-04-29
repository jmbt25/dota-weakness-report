// Dev-only test page — DO NOT IMPORT FROM PRODUCTION CODE.
//
// Renders three instances of ProComparisonCard side-by-side with mocked
// inputs so the three required states (flex-suppressed, headline twin,
// hidden-under-25) can be visually verified without waiting on real
// /report runs. Reachable only at `/_dev/pro-comparison` in dev builds
// (App.tsx gates the route by `import.meta.env.DEV`).
//
// Mocks here are constructed to mirror real data shape — they pull from
// `src/data/pro-vectors.json` for the corpus, then synthesize matches +
// details inputs that produce vectors landing in each target state.

import proVectorsRaw from '../data/pro-vectors.json'
import type { ProCorpus } from '../lib/proComparison'
import type { ODMatchDetail, ODMatchSummary } from '../types'
import { ProComparisonCard } from './ProComparisonCard'

const PRO_CORPUS = proVectorsRaw as ProCorpus

/** One match's worth of input — gives full control of role classification. */
interface SyntheticMatch {
  heroId: number
  /** 1=safe, 2=mid, 3=off, 4=jungle. Drives classifyPos. */
  laneRole: number
  isRoaming?: boolean
}

/**
 * Make N synthetic match summaries + matching parsed details, using a fixed
 * recipe so the resulting user vector lands in a known shape. Each match
 * carries the bare minimum fields the analyses + Pro Comparison pipeline
 * touch.
 */
function buildSyntheticData(opts: {
  /** Per-match hero + lane setup. Cycled if shorter than count. */
  matches: SyntheticMatch[]
  count: number
  /** GPM mean used for the parsed-detail player record. */
  gpm: number
  /** Last-hits-per-min mean used for the player record. */
  lhPerMin: number
  obsPerGame: number
  senPerGame: number
  dewardsPerGame: number
  /** Mean deaths per match. */
  deathsPerMatch: number
  /** Median match duration in seconds. */
  durationSec: number
  /** Mean kills + assists used to back into kill participation. */
  killsPlusAssists: number
  /** Optional: time (sec) of first BKB or support spike in purchase log. */
  firstMajorSec: number | null
}): { matches: ODMatchSummary[]; details: Record<number, ODMatchDetail> } {
  const matches: ODMatchSummary[] = []
  const details: Record<number, ODMatchDetail> = {}
  const userAccountId = 999_999_999
  for (let i = 0; i < opts.count; i++) {
    const matchId = 100_000_000_000 + i
    const recipe = opts.matches[i % opts.matches.length]
    const heroId = recipe.heroId
    const isRoaming = recipe.isRoaming === true
    const laneRole = recipe.laneRole
    const lhCount = Math.round(opts.lhPerMin * (opts.durationSec / 60))
    const summary: ODMatchSummary = {
      match_id: matchId,
      player_slot: 0,
      radiant_win: i % 2 === 0,
      duration: opts.durationSec,
      hero_id: heroId,
      start_time: 1_700_000_000 - i * 3600,
      kills: Math.round(opts.killsPlusAssists / 2),
      deaths: opts.deathsPerMatch,
      assists: Math.round(opts.killsPlusAssists / 2),
      version: 22,
    }
    matches.push(summary)
    // Build matching parsed detail with all the fields the user vector
    // computation reads off the player record.
    const purchaseLog: { key: string; time: number }[] = []
    if (opts.firstMajorSec != null) {
      purchaseLog.push({ key: 'black_king_bar', time: opts.firstMajorSec })
    }
    const player = {
      account_id: userAccountId,
      player_slot: 0,
      hero_id: heroId,
      kills: summary.kills,
      deaths: summary.deaths,
      assists: summary.assists,
      gold_per_min: opts.gpm,
      xp_per_min: 600,
      last_hits: lhCount,
      denies: 5,
      lane_role: laneRole,
      is_roaming: isRoaming,
      lane_efficiency_pct: opts.gpm > 500 ? 80 : 40,
      gold_t: Array.from({ length: Math.ceil(opts.durationSec / 60) }, (_, m) => Math.round((opts.gpm * m) / 60 * 60)),
      xp_t: Array.from({ length: Math.ceil(opts.durationSec / 60) }, (_, m) => 600 * m),
      lh_t: Array.from({ length: Math.ceil(opts.durationSec / 60) }, (_, m) => Math.round(opts.lhPerMin * m)),
      purchase_log: purchaseLog,
      obs_placed: opts.obsPerGame,
      sen_placed: opts.senPerGame,
      observer_kills: Math.round(opts.dewardsPerGame * 0.6),
      sentry_kills: Math.round(opts.dewardsPerGame * 0.4),
    }
    // 9 enemy/ally placeholder players. Fill team kills so KP can compute.
    const dummyMate = (slot: number, kills: number) => ({
      account_id: 1000 + slot,
      player_slot: slot,
      hero_id: 1,
      kills,
      deaths: 0,
      assists: 0,
      gold_per_min: 400,
      xp_per_min: 500,
      last_hits: 100,
      denies: 0,
      gold_t: [],
      xp_t: [],
      lh_t: [],
    })
    const detail: ODMatchDetail = {
      match_id: matchId,
      duration: opts.durationSec,
      start_time: summary.start_time,
      radiant_win: summary.radiant_win,
      game_mode: 22,
      lobby_type: 7,
      players: [
        player as never,
        dummyMate(1, 5) as never,
        dummyMate(2, 3) as never,
        dummyMate(3, 2) as never,
        dummyMate(4, 1) as never,
        dummyMate(128, 4) as never,
        dummyMate(129, 3) as never,
        dummyMate(130, 2) as never,
        dummyMate(131, 1) as never,
        dummyMate(132, 1) as never,
      ],
      version: 22,
    }
    details[matchId] = detail
  }
  return { matches, details }
}

// Helper: build a SyntheticMatch[] with explicit per-match lane roles.
// (laneRole=1 with core hero → pos 1; laneRole=2 → pos 2; laneRole=1 with
// support hero → pos 5; etc. classifyPos in proComparison.ts is the canonical.)
const POS1: SyntheticMatch[] = [1, 8, 70, 44, 42, 67, 41, 18, 95].map((h) => ({ heroId: h, laneRole: 1 })) // cores in safe lane
const POS2: SyntheticMatch[] = [11, 25, 17, 13, 39, 22, 74, 46, 76].map((h) => ({ heroId: h, laneRole: 2 })) // mids
const POS5: SyntheticMatch[] = [5, 26, 30, 27, 31, 50, 79, 86, 87].map((h) => ({ heroId: h, laneRole: 1 })) // supports in safe lane

// FLEX user: roughly 1/3 each across pos 1 / pos 2 / pos 5. Entropy ~ ln 3 ≈ 1.10 > 0.95 threshold.
const FLEX_USER = buildSyntheticData({
  count: 50,
  matches: [
    ...POS1.slice(0, 8), ...POS1.slice(0, 8),  // 16 pos 1
    ...POS2.slice(0, 9), ...POS2.slice(0, 9),  // 18 pos 2
    ...POS5.slice(0, 8), ...POS5.slice(0, 8),  // 16 pos 5
  ],
  gpm: 450,
  lhPerMin: 4.5,
  obsPerGame: 5,
  senPerGame: 9,
  dewardsPerGame: 4,
  deathsPerMatch: 8,
  durationSec: 44 * 60,
  killsPlusAssists: 16,
  firstMajorSec: 25 * 60,
})

// CONCENTRATED user: ~95% pos 1 carry. Entropy near 0 → headline twin renders.
const CONCENTRATED_USER = buildSyntheticData({
  count: 50,
  matches: [
    ...Array.from({ length: 5 }, () => POS1).flat(),
    // A few off-role mid games to give some realistic noise without flipping flex
    { heroId: 11, laneRole: 2 }, { heroId: 25, laneRole: 2 },
  ],
  gpm: 580,
  lhPerMin: 7.5,
  obsPerGame: 0.3,
  senPerGame: 0.5,
  dewardsPerGame: 1.2,
  deathsPerMatch: 5,
  durationSec: 42 * 60,
  killsPlusAssists: 14,
  firstMajorSec: 22 * 60,
})

const HIDDEN_USER = buildSyntheticData({
  // 20 matches — under the 25-match threshold, card should not render.
  count: 20,
  matches: POS1.slice(0, 4),
  gpm: 480,
  lhPerMin: 6,
  obsPerGame: 0.5,
  senPerGame: 0.7,
  dewardsPerGame: 1,
  deathsPerMatch: 6,
  durationSec: 41 * 60,
  killsPlusAssists: 12,
  firstMajorSec: 24 * 60,
})

interface StateBlockProps {
  title: string
  subtitle: string
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  honestMode?: boolean
}

function StateBlock({ title, subtitle, matches, details, honestMode = false }: StateBlockProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#ECE6D6', marginBottom: 4 }}>
        {title}
      </h2>
      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, opacity: 0.7, color: '#ECE6D6', marginBottom: 12 }}>
        {subtitle}
      </p>
      <ProComparisonCard
        matches={matches}
        details={details}
        accountId={999_999_999}
        honestMode={honestMode}
        corpus={PRO_CORPUS}
        phase="done"
      />
    </div>
  )
}

export function DevProComparisonStates() {
  return (
    <div className="dwr" data-honest="false" style={{ padding: '24px 16px', maxWidth: 720, margin: '0 auto' }}>
      <div className="cosmos" />
      <h1 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 32, color: '#E94560', marginBottom: 24 }}>
        Pro Comparison — dev test states
      </h1>
      <p style={{ fontFamily: '"Inter", sans-serif', fontSize: 13, opacity: 0.85, color: '#ECE6D6', marginBottom: 32 }}>
        Three required states for the v1.3.0 walkthrough. All inputs are synthetic — no
        OpenDota calls. Switch to honest mode by appending <code>?honest=1</code> to the URL.
      </p>

      <StateBlock
        title="State 1 — magsasaka-shape FLEX user"
        subtitle="50 matches, role distribution split across pos 1 / pos 2 / pos 5. Entropy > 0.95 → headline twin suppressed, per-axis renders."
        matches={FLEX_USER.matches}
        details={FLEX_USER.details}
      />

      <StateBlock
        title="State 2 — concentrated POS 1 user (headline twin)"
        subtitle="50 matches, ~95% pos 1 carry. Entropy < 0.95 → headline twin renders with Why + Where you diverge."
        matches={CONCENTRATED_USER.matches}
        details={CONCENTRATED_USER.details}
      />

      <StateBlock
        title="State 3 — under 25 matches (HIDDEN)"
        subtitle="20 matches. Card returns null and does not render. The dotted region below should be empty."
        matches={HIDDEN_USER.matches}
        details={HIDDEN_USER.details}
      />
      <div style={{ height: 100, border: '1px dashed #5C5749', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ECE6D6', opacity: 0.5, fontFamily: '"JetBrains Mono", monospace', fontSize: 11 }}>
        ↑ if a card appears above this dashed box, the &lt;25 hidden state is broken.
      </div>

      <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#ECE6D6', marginTop: 48, marginBottom: 4 }}>
        State 1 — flex user, HONEST mode
      </h2>
      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, opacity: 0.7, color: '#ECE6D6', marginBottom: 12 }}>
        Same FLEX user as State 1, honestMode=true. Sharper opening line.
      </p>
      <ProComparisonCard
        matches={FLEX_USER.matches}
        details={FLEX_USER.details}
        accountId={999_999_999}
        honestMode={true}
        corpus={PRO_CORPUS}
        phase="done"
      />

      <h2 style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 22, color: '#ECE6D6', marginTop: 48, marginBottom: 4 }}>
        State 2 — concentrated user, HONEST mode
      </h2>
      <p style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, opacity: 0.7, color: '#ECE6D6', marginBottom: 12 }}>
        Same CONCENTRATED user, honestMode=true. The "least-far among N pros" line should appear.
      </p>
      <ProComparisonCard
        matches={CONCENTRATED_USER.matches}
        details={CONCENTRATED_USER.details}
        accountId={999_999_999}
        honestMode={true}
        corpus={PRO_CORPUS}
        phase="done"
      />
    </div>
  )
}
