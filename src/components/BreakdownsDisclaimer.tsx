import type { UserCompareData } from '../lib/userCompareData'
import { HonestModeToggle } from './HonestModeToggle'

/**
 * Renders just under TopNav on /breakdowns and /breakdowns/{match_id}.
 * Required by the spec — pros are public figures, but the prose register
 * is observation not editorial, and the disclaimer makes the
 * unaffiliation explicit.
 *
 * On the match-detail route (showAffordance=true), the right side hosts
 * the v1.9.0 user-comparison affordance per spec §G.2:
 *   - No personalization → "Run a report to compare your stats →"
 *   - Personalization active (cache ≤ 30 days) → "Comparing against
 *     your last N matches at {bracket}. Most useful for {role} cards."
 *     + HonestModeToggle
 *   - Personalization stale (cache > 30 days) → "Last /report run was
 *     N days ago — re-run for current bracket"
 *
 * On the listing route (showAffordance=false / unset), only the
 * disclaimer body renders — there's nothing player-specific to
 * personalize against on the listing.
 *
 * Don't render anywhere outside the /breakdowns routes.
 */

const STALE_THRESHOLD_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

interface BreakdownsDisclaimerProps {
  showAffordance?: boolean
  userCompareData?: UserCompareData | null
  honestMode?: boolean
  onToggleHonestMode?: (v: boolean) => void
  onNavigateHome?: () => void
}

export function BreakdownsDisclaimer({
  showAffordance = false,
  userCompareData = null,
  honestMode = false,
  onToggleHonestMode,
  onNavigateHome,
}: BreakdownsDisclaimerProps) {
  return (
    <div className="dwr-breakdowns-disclaimer" role="note">
      <div className="dwr-breakdowns-disclaimer-body">
        Observations from public match data. Not affiliated with any team,
        player, or tournament. Data via OpenDota.
      </div>
      {showAffordance && (
        <DisclaimerAffordance
          userCompareData={userCompareData}
          honestMode={honestMode}
          onToggleHonestMode={onToggleHonestMode}
          onNavigateHome={onNavigateHome}
        />
      )}
    </div>
  )
}

function DisclaimerAffordance({
  userCompareData,
  honestMode,
  onToggleHonestMode,
  onNavigateHome,
}: {
  userCompareData: UserCompareData | null
  honestMode: boolean
  onToggleHonestMode?: (v: boolean) => void
  onNavigateHome?: () => void
}) {
  // No personalization yet — render the "Run a report" link.
  if (!userCompareData) {
    return (
      <div className="dwr-breakdowns-disclaimer-affordance">
        <button
          type="button"
          className="dwr-breakdowns-disclaimer-link"
          onClick={() => onNavigateHome?.()}
        >
          Run a report to compare your stats →
        </button>
      </div>
    )
  }

  const ageDays = Math.floor((Date.now() - userCompareData.built_at) / MS_PER_DAY)
  const stale = ageDays > STALE_THRESHOLD_DAYS

  if (stale) {
    return (
      <div className="dwr-breakdowns-disclaimer-affordance">
        <button
          type="button"
          className="dwr-breakdowns-disclaimer-link"
          onClick={() => onNavigateHome?.()}
        >
          Last /report run was {ageDays} days ago — re-run for current bracket
        </button>
        {onToggleHonestMode && (
          <HonestModeToggle enabled={honestMode} onToggle={onToggleHonestMode} />
        )}
      </div>
    )
  }

  return (
    <div className="dwr-breakdowns-disclaimer-affordance">
      <button
        type="button"
        className="dwr-breakdowns-disclaimer-link"
        onClick={() => onNavigateHome?.()}
      >
        {affordanceCopy(userCompareData)}
      </button>
      {onToggleHonestMode && (
        <HonestModeToggle enabled={honestMode} onToggle={onToggleHonestMode} />
      )}
    </div>
  )
}

/**
 * Compose the personalization-active line per spec §A.2 + Phase C
 * brief:
 *   - 'core' / 'support': "Most useful for {role} position cards."
 *   - 'flex': "Strips appear on cards for the positions you play most."
 *   - Uncalibrated rank: bracket token swaps to "your match history"
 *     so the line stays grammatical.
 */
function affordanceCopy(data: UserCompareData): string {
  const n = data.match_window.total_matches
  const bracketClause = data.rank_tier
    ? `at ${data.rank_label}`
    : 'in your match history'
  const head = `Comparing against your last ${n} matches ${bracketClause}.`
  if (data.user_role_label === 'flex') {
    return `${head} Strips appear on cards for the positions you play most.`
  }
  const noun = data.user_role_label === 'support' ? 'support' : 'core'
  return `${head} Most useful for ${noun} position cards.`
}
