import { useMemo } from 'react'
import type { ODMatchDetail } from '../types'
import { getHeroName } from '../lib/heroes'
import { buildMatchContext, runCat1B } from '../lib/watchProse/cat1b'
import { runCat1A } from '../lib/watchProse/cat1a'
import { runCat2 } from '../lib/watchProse/cat2'
import { selectLeadLines } from '../lib/watchProse/leadLines'

interface WatchLeadLinesProps {
  detail: ODMatchDetail
}

/**
 * Renders 0-3 standalone pull-quote cards at the top of /watch/{match_id},
 * before the per-player grid. Cards are PULL-OUTS — the same prose lines
 * also render in their original sections below (per-player or match-level).
 *
 * Empty match (zero lead-eligible fires) renders nothing — no "WHAT STOOD
 * OUT" header. Per spec §2.5.
 */
export function WatchLeadLines({ detail }: WatchLeadLinesProps) {
  const leads = useMemo(() => {
    const ctx = buildMatchContext(detail, getHeroName)
    const cat1a = runCat1A(ctx)
    const cat1b = runCat1B(ctx)
    const cat2 = runCat2(ctx)
    return selectLeadLines(cat1a, cat1b, cat2)
  }, [detail])

  if (leads.length === 0) return null

  return (
    <section className="dwr-watch-leads">
      <h2 className="dwr-watch-leads-header">WHAT STOOD OUT</h2>
      <div className="dwr-watch-leads-grid">
        {leads.map((lead, i) => (
          <article key={lead.fire.templateId} className="card dwr-watch-lead">
            <div className="dwr-watch-lead-overline">
              OBSERVATION {String(i + 1).padStart(2, '0')}
            </div>
            <p className="dwr-watch-lead-text">{lead.fire.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
