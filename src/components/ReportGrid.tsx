import type { AnalysisResult } from '../types'
import { ReportCard } from './ReportCard'

interface ReportGridProps {
  results: AnalysisResult[]
  matchCount: number
  totalAvailable: number
  isPaid: boolean
}

export function ReportGrid({ results, matchCount, totalAvailable, isPaid }: ReportGridProps) {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-16">
      <div className="flex items-end justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Your weakness report</h2>
          <p className="text-sm text-ink-muted mt-1">
            Based on your last {matchCount} match{matchCount === 1 ? '' : 'es'}.
            {!isPaid && totalAvailable > matchCount && (
              <>
                {' '}<span className="text-amber-400">Unlock {totalAvailable - matchCount} more with a license key below.</span>
              </>
            )}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {results.map((r) => (
          <ReportCard key={r.id} result={r} />
        ))}
      </div>
    </section>
  )
}
