import type { AnalysisResult, HonestLanguage } from '../types'
import { ReportCard } from './ReportCard'
import { StackSynergyCard } from './StackSynergyCard'
import { VisionCard } from './VisionCard'

interface ReportGridProps {
  results: AnalysisResult[]
  matchCount: number
  isPaid: boolean
  honestMode: boolean
  language: HonestLanguage
  accountId: number
}

export function ReportGrid({
  results,
  matchCount,
  isPaid,
  honestMode,
  language,
  accountId,
}: ReportGridProps) {
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
          {!isPaid && (
            <>
              {' '}<span className="upgrade">
                Unlock the 100-match window and per-hero deep dives with a license key below.
              </span>
            </>
          )}
        </p>
      </div>

      <div className="dwr-grid">
        {results.map((r) => {
          if (r.id === 'stack-synergy') {
            return (
              <StackSynergyCard
                key={r.id}
                result={r}
                honestMode={honestMode}
                language={language}
                accountId={accountId}
              />
            )
          }
          if (r.id === 'vision') {
            return (
              <VisionCard
                key={r.id}
                result={r}
                honestMode={honestMode}
                language={language}
                accountId={accountId}
              />
            )
          }
          return (
            <ReportCard
              key={r.id}
              result={r}
              honestMode={honestMode}
              language={language}
              accountId={accountId}
            />
          )
        })}
      </div>
    </>
  )
}
