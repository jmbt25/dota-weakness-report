import { useMemo } from 'react'
import type { ODMatchDetail } from '../types'
import { getHeroName } from '../lib/heroes'
import { buildMatchContext } from '../lib/breakdownsProse/cat1b'
import { runCat2, type Cat2Output } from '../lib/breakdownsProse/cat2'

interface BreakdownsMatchSectionsProps {
  detail: ODMatchDetail
}

/**
 * Renders the four match-level cards (Draft / Lane / Mid game / Teamfights)
 * below the per-player grid on /breakdowns/{match_id}. Each card maps to
 * one Cat 2 sub-section. Empty sub-sections render NOTHING — no apologetic
 * placeholder line per spec §6 ("rare matches with no Roshan don't get a
 * 'no notable Roshan activity' line; section just isn't there").
 */
export function BreakdownsMatchSections({ detail }: BreakdownsMatchSectionsProps) {
  const sections = useMemo<Cat2Output>(() => {
    const ctx = buildMatchContext(detail, getHeroName)
    return runCat2(ctx)
  }, [detail])

  const anyFires =
    sections.draft.length +
    sections.lane.length +
    sections.midgame.length +
    sections.teamfights.length
  if (anyFires === 0) return null

  return (
    <div className="dwr-breakdowns-match-sections">
      <Section label="Draft" fires={sections.draft} />
      <Section label="Lane phase" fires={sections.lane} />
      <Section label="Mid game" fires={sections.midgame} />
      <Section label="Teamfights" fires={sections.teamfights} />
    </div>
  )
}

function Section({
  label,
  fires,
}: {
  label: string
  fires: { templateId: string; text: string }[]
}) {
  if (fires.length === 0) return null
  return (
    <article className="card dwr-breakdowns-match-section">
      <h2 className="dwr-breakdowns-match-section-label">{label}</h2>
      <div className="dwr-breakdowns-match-section-body">
        {fires.map((f) => (
          <p key={f.templateId} className="dwr-breakdowns-match-section-prose">
            {f.text}
          </p>
        ))}
      </div>
    </article>
  )
}
