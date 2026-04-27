import type { AnalysisResult, HonestLanguage } from '../types'
import { ReportCard } from './ReportCard'
import { StackSynergyCard } from './StackSynergyCard'

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
    <section className="max-w-7xl mx-auto px-6 pb-16">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            Your weakness report
            {honestMode && (
              <span
                className="text-sm pill-amber"
                aria-label="Honest mode is active"
                title="Honest mode is active"
              >
                🔥 Honest mode
              </span>
            )}
          </h2>
          <p className="text-sm text-ink-muted mt-1">
            Based on your last {matchCount} match{matchCount === 1 ? '' : 'es'}.
            {!isPaid && (
              <>
                {' '}<span className="text-sky-300">Widen the window to 100 matches, unlock per-hero deep dives, and get Taglish honest mode <span aria-label="Philippines flag">🇵🇭</span> with a license key below.</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        {results.map((r) =>
          r.id === 'stack-synergy' ? (
            <StackSynergyCard
              key={r.id}
              result={r}
              honestMode={honestMode}
              language={language}
              accountId={accountId}
            />
          ) : (
            <ReportCard
              key={r.id}
              result={r}
              honestMode={honestMode}
              language={language}
              accountId={accountId}
            />
          )
        )}
      </div>
    </section>
  )
}
