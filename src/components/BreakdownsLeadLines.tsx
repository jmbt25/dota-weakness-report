import { useMemo } from 'react'
import type { ODMatchDetail } from '../types'
import { getHeroName } from '../lib/heroes'
import { buildMatchContext, runCat1B } from '../lib/breakdownsProse/cat1b'
import { runCat1A } from '../lib/breakdownsProse/cat1a'
import { runCat2 } from '../lib/breakdownsProse/cat2'
import { selectLeadLines } from '../lib/breakdownsProse/leadLines'

interface BreakdownsLeadLinesProps {
  detail: ODMatchDetail
}

/**
 * Renders 0-3 standalone pull-quote cards at the top of
 * /breakdowns/{match_id}, before the per-player grid. Cards are PULL-OUTS
 * — the same prose lines also render in their original sections below
 * (per-player or match-level).
 *
 * Empty match (zero lead-eligible fires) renders nothing — no "WHAT STOOD
 * OUT" header. Per spec §2.5.
 */
export function BreakdownsLeadLines({ detail }: BreakdownsLeadLinesProps) {
  const leads = useMemo(() => {
    const ctx = buildMatchContext(detail, getHeroName)
    const cat1a = runCat1A(ctx)
    const cat1b = runCat1B(ctx)
    const cat2 = runCat2(ctx)
    return selectLeadLines(cat1a, cat1b, cat2)
  }, [detail])

  if (leads.length === 0) return null

  return (
    <section className="dwr-breakdowns-leads">
      <h2 className="dwr-breakdowns-leads-header">WHAT STOOD OUT</h2>
      <div className="dwr-breakdowns-leads-list">
        {leads.map((lead, i) => (
          <div key={lead.fire.templateId} className="dwr-breakdowns-lead">
            <div className="dwr-breakdowns-lead-overline">
              [{String(i + 1).padStart(2, '0')}]
            </div>
            <p className="dwr-breakdowns-lead-text">{lead.fire.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
