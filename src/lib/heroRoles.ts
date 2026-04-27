// Hero → typical pub-position role.
//
// Values: 'core' (pos 1/2/3 ~always), 'support' (pos 4/5 ~always),
// 'flex' (commonly played either way).
//
// We start from OpenDota's `roles` array — heroes tagged "Carry" without
// "Support" default to 'core'; heroes tagged "Support" without "Carry"
// default to 'support'; heroes tagged with both default to 'flex'.
//
// OpenDota's tagging is too generous with "Carry" for some heroes that are
// predominantly pos 4/5 in modern pubs (e.g. Spirit Breaker, Earthshaker,
// Pudge). The OVERRIDES table corrects those — bias is toward marking
// ambiguous heroes as 'flex' rather than forcing a side.

import type { ODHero } from '../types'

export type HeroRole = 'core' | 'support' | 'flex'

// Hero ID → override role. Numeric IDs match OpenDota's hero index.
// Conservative list — only heroes where the OpenDota tags consistently
// disagree with how the hero is actually played in pubs.
const OVERRIDES: Record<number, HeroRole> = {
  // OpenDota tags as Carry but actually almost always pos 4-5 in modern pubs.
  71: 'flex',     // Spirit Breaker
  62: 'support',  // Bounty Hunter
  88: 'flex',     // Nyx Assassin
  100: 'flex',    // Tusk
  107: 'support', // Earth Spirit
  123: 'support', // Hoodwink
  128: 'flex',    // Snapfire
  // OpenDota tags as Carry but more often offlane/initiator/flex than pos 1.
  7: 'flex',      // Earthshaker
  14: 'flex',     // Pudge
  16: 'flex',     // Sand King
  19: 'flex',     // Tiny
  32: 'flex',     // Riki
  // Tagged as both Carry+Support → already 'flex' by default, listed for clarity.
  21: 'flex',     // Windranger
  20: 'flex',     // Vengeful Spirit
  86: 'flex',     // Rubick
}

export function classifyHero(hero: ODHero | undefined): HeroRole {
  if (!hero) return 'flex'
  const override = OVERRIDES[hero.id]
  if (override) return override

  const roles = hero.roles ?? []
  const hasSupport = roles.includes('Support')
  const hasCarry = roles.includes('Carry')
  if (hasSupport && !hasCarry) return 'support'
  if (hasCarry && !hasSupport) return 'core'
  return 'flex'
}
