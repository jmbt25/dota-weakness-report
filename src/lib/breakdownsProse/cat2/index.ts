// Cat 2 — match-level prose runner. Combines the four sub-section
// modules into a single Cat2Output keyed by sub-section. Empty
// sub-sections produce empty arrays — UI skips them entirely (no
// apologetic placeholder per Phase 6 spec).

import { validateBreakdownsProse } from '../bannedTokens'
import type { MatchContext, ProseFire } from '../cat1b'
import type { Cat2Template, Cat2Output } from './types'
import { DRAFT_TEMPLATES } from './draft'
import { LANE_TEMPLATES } from './lane'
import { MIDGAME_TEMPLATES } from './midgame'
import { TEAMFIGHTS_TEMPLATES } from './teamfights'

export type { Cat2Output } from './types'

function runSection(ctx: MatchContext, templates: Cat2Template[]): ProseFire[] {
  const out: ProseFire[] = []
  for (const tpl of templates) {
    let result: { text: string; facts: Record<string, string | number> } | null
    try {
      result = tpl.produce(ctx)
    } catch {
      result = null
    }
    if (!result) continue
    if (!validateBreakdownsProse(result.text)) {
      // eslint-disable-next-line no-console
      console.warn('[breakdowns-prose] Cat 2 template rejected by validator:', tpl.id, result.text)
      continue
    }
    out.push({
      templateId: tpl.id,
      text: result.text,
      priority: tpl.priority,
      facts: result.facts,
    })
  }
  return out
}

export function runCat2(ctx: MatchContext): Cat2Output {
  return {
    draft: runSection(ctx, DRAFT_TEMPLATES),
    lane: runSection(ctx, LANE_TEMPLATES),
    midgame: runSection(ctx, MIDGAME_TEMPLATES),
    teamfights: runSection(ctx, TEAMFIGHTS_TEMPLATES),
  }
}
