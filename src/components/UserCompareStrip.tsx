// User-comparison strip — Phase C wiring of v1.9.0.
//
// Renders the strip prose produced by buildUserStrip() beneath a Cat 1B
// fire on /breakdowns/{match_id}/player cards. Returns null when the
// strip layer suppresses (sub-5 user games, missing data, unsupported
// template, etc.) so the consumer can render unconditionally.
//
// Anti-bleed (spec §C.4 + §E.3): the consumer passes only the Cat 1B
// fire (templateId + facts), the user-compare cache, and honestMode.
// No display name, no upstream prose. Visual styling lives in
// src/index.css under .dwr-breakdowns-user-strip — Phase D polishes.

import type { ProseFire } from '../lib/breakdownsProse/cat1b'
import { buildUserStrip } from '../lib/breakdownsProse/userStrips'
import type { UserCompareData } from '../lib/userCompareData'
import { getHeroName } from '../lib/heroes'

interface UserCompareStripProps {
  fire: ProseFire
  userCompareData: UserCompareData | null
  honestMode: boolean
}

export function UserCompareStrip({ fire, userCompareData, honestMode }: UserCompareStripProps) {
  if (!userCompareData) return null

  const text = buildUserStrip({
    templateId: fire.templateId,
    facts: fire.facts,
    userCompareData,
    honestMode,
    resolveHeroName: getHeroName,
  })

  if (!text) return null

  return (
    <p className="dwr-breakdowns-user-strip" data-template={fire.templateId}>
      {text}
    </p>
  )
}
