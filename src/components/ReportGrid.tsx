import type React from 'react'
import type { AnalysisResult, HonestLanguage, ODMatchDetail, ODMatchSummary } from '../types'
import { ReportCard } from './ReportCard'
import { StackSynergyCard } from './StackSynergyCard'
import { VisionCard } from './VisionCard'
import { ProComparisonCard } from './ProComparisonCard'
import proVectorsRaw from '../data/pro-vectors.json'
import type { ProCorpus } from '../lib/proComparison'
import type { ReportPhase } from './ProgressStrip'

const PRO_CORPUS = proVectorsRaw as ProCorpus

interface ReportGridProps {
  results: AnalysisResult[]
  matchCount: number
  honestMode: boolean
  language: HonestLanguage
  accountId: number
  /** Filtered matches + details, as passed to runAllAnalyses. Pro Comparison
   * card uses the same data to compute the user's playstyle vector — no
   * extra OpenDota calls. */
  matches: ODMatchSummary[]
  details: Record<number, ODMatchDetail>
  /** 'core' or 'support' when the role-split filter is active. Drives the
   * stack-synergy footnote so users know the partner sample is filtered. */
  roleFilter?: 'all' | 'core' | 'support'
  /** Streaming phase from the progressive renderer. Lets cards show a
   * "waiting on first parsed match" skeleton instead of a flat unmeasured
   * card while data is still flowing in. */
  phase: ReportPhase
}

export function ReportGrid({
  results,
  matchCount,
  honestMode,
  language,
  accountId,
  matches,
  details,
  roleFilter = 'all',
  phase,
}: ReportGridProps) {
  // Full-card remount on role-filter switch. Keying the chart subtree
  // alone wasn't enough — Recharts still ended up measuring at 0 height
  // when the analyses pipeline swapped in a filtered subset's results,
  // collapsing stack-synergy + tilt out of the bottom row. Remounting
  // the entire card guarantees a fresh ResponsiveContainer + parent
  // layout context. Trade-off: any per-card state (e.g. StackSynergyCard's
  // showNames toggle) resets on filter switch — acceptable because the
  // user is genuinely changing what they're looking at.
  const cardKeySuffix = roleFilter
  return (
    <>
      <div className="dwr-report-head">
        <div className="dwr-section-head">
          <h2 className="dwr-section-title">
            Your <span className="red">weakness</span> report
            {honestMode && <span className="honest-badge">🔥 HONEST MODE</span>}
          </h2>
        </div>
        <p className="dwr-section-sub">
          Based on your last {matchCount} match{matchCount === 1 ? '' : 'es'}.
        </p>
      </div>

      <div className="dwr-grid">
        {results.flatMap((r) => {
          const cards: React.ReactNode[] = []
          if (r.id === 'stack-synergy') {
            cards.push(
              <StackSynergyCard
                key={`${r.id}-${cardKeySuffix}`}
                result={r}
                honestMode={honestMode}
                language={language}
                accountId={accountId}
                roleFilter={roleFilter}
                roleFilterMatchCount={matchCount}
                phase={phase}
              />
            )
            // Pro Comparison sits right after Stack Synergy. The card
            // itself returns null when the user has < 25 matches, so it
            // only renders when there's enough sample to make sense.
            cards.push(
              <ProComparisonCard
                key={`pro-comparison-${cardKeySuffix}`}
                matches={matches}
                details={details}
                accountId={accountId}
                honestMode={honestMode}
                corpus={PRO_CORPUS}
                phase={phase}
              />
            )
          } else if (r.id === 'vision') {
            cards.push(
              <VisionCard
                key={`${r.id}-${cardKeySuffix}`}
                result={r}
                honestMode={honestMode}
                language={language}
                accountId={accountId}
                phase={phase}
              />
            )
          } else {
            cards.push(
              <ReportCard
                key={`${r.id}-${cardKeySuffix}`}
                result={r}
                honestMode={honestMode}
                language={language}
                accountId={accountId}
                phase={phase}
              />
            )
          }
          return cards
        })}
      </div>
    </>
  )
}
